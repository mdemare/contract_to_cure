package game

import (
	"fmt"
	"net/http"
	"slices"
)

// Event card names.
const (
	Airlift             = "Airlift"
	Forecast            = "Forecast"
	GovernmentGrant     = "Government Grant"
	OneQuietNight       = "One Quiet Night"
	ResilientPopulation = "Resilient Population"
)

// forecastCardCount is how many infection cards Forecast shows.
const forecastCardCount = 6

const forecastActiveMessage = "Cannot perform action while Forecast is active. Please complete the Forecast action first."

// CheckForecast rejects every request but GET /game_state.json and
// /action_card while a Forecast waits for its new order
// (check_forecast_active). It runs before CheckGameOver. Inside
// /action_card, PlayEventCard gives the same message with HTTP 200.
func (g *GameState) CheckForecast() *Rejection {
	if !g.ForecastActive {
		return nil
	}
	return &Rejection{Status: StatusError, Message: forecastActiveMessage}
}

// EventCardRequest holds the parameters of POST /action_card after
// validation. PlayerIndex is nil and CardOrder is nil when not given.
type EventCardRequest struct {
	Card        string
	City        string
	PlayerIndex *int
	CardOrder   []string
}

// EventCardResponse is what Rails renders for POST /action_card.
type EventCardResponse struct {
	// Body is a Result, a ForecastView, a *Rejection, or the bare *GameState
	// after a finished Forecast.
	Body any
	// HTTPStatus keeps the Rails quirks: a Forecast error is 200, an unknown
	// card is 500, and a failed Result is 422.
	HTTPStatus int
	// Changed is true when Rails saved the game.
	Changed bool
}

// ForecastView is the response to the first step of Forecast: the top cards
// of the infection deck, next card first. Rails puts game_state on it only
// when a hand-limit discard is pending.
type ForecastView struct {
	Status    string         `json:"status"`
	Type      string         `json:"type"`
	Message   string         `json:"message"`
	Cards     []ForecastCard `json:"cards"`
	GameState *GameState     `json:"game_state,omitempty"`
}

// ForecastCard is one card in a ForecastView.
type ForecastCard struct {
	Name  string `json:"name"`
	Color Color  `json:"color"`
}

// PlayEventCard plays the event card named in req (GameController#action_card).
// Any player's card may be played in any phase, and it costs no action.
// While a Forecast is active, only its card_order is accepted. A played card
// that brings a pending hand-limit discard back within the limit resolves
// it. The caller runs CheckGameOver and parameter validation first.
func (g *GameState) PlayEventCard(req EventCardRequest) EventCardResponse {
	if g.ForecastActive {
		if req.Card == Forecast && req.CardOrder != nil {
			if rej := g.ApplyForecast(req.CardOrder); rej != nil {
				return EventCardResponse{Body: rej, HTTPStatus: http.StatusOK}
			}
			return EventCardResponse{Body: g, HTTPStatus: http.StatusOK, Changed: true}
		}
		return EventCardResponse{
			Body:       &Rejection{Status: StatusError, Message: forecastActiveMessage},
			HTTPStatus: http.StatusOK,
		}
	}

	var res Result
	switch req.Card {
	case Airlift:
		res = g.Airlift(req.PlayerIndex, req.City)
	case OneQuietNight:
		res = g.PlayOneQuietNight()
	case ResilientPopulation:
		res = g.ResilientPopulation(req.City)
	case GovernmentGrant:
		res = g.GovernmentGrant(req.City)
	case Forecast:
		view, failed := g.Forecast()
		if failed != nil {
			return EventCardResponse{Body: *failed, HTTPStatus: http.StatusUnprocessableEntity}
		}
		if g.PendingHandLimit != nil {
			g.resolvePendingHandLimit()
			view.GameState = g
		}
		return EventCardResponse{Body: view, HTTPStatus: http.StatusOK, Changed: true}
	default:
		return EventCardResponse{
			Body:       &Rejection{Status: StatusError, Message: "Unknown action card: " + req.Card},
			HTTPStatus: http.StatusInternalServerError,
		}
	}

	if !res.Success {
		return EventCardResponse{Body: res, HTTPStatus: http.StatusUnprocessableEntity}
	}
	if g.PendingHandLimit != nil {
		g.resolvePendingHandLimit()
	}
	return EventCardResponse{Body: res, HTTPStatus: http.StatusOK, Changed: true}
}

// eventCardHolder returns the first player holding the event card, and the
// card, or an error result when nobody has it.
func (g *GameState) eventCardHolder(name string) (*Player, Card, *Result) {
	for i := range g.Players {
		p := &g.Players[i]
		if j := p.cardIndex(func(c Card) bool { return c.Type == ActionCard && c.Name == name }); j >= 0 {
			return p, p.Hand[j], nil
		}
	}
	res := actionError(fmt.Sprintf("No player has the %s card", name))
	return nil, Card{}, &res
}

// spendEventCard takes the played card from the hand. It goes to the player
// discard pile, unless the Contingency Planner retrieved it: then it leaves
// the game.
func (g *GameState) spendEventCard(p *Player, card Card) {
	if taken, ok := p.takeCard(card.Name); ok && !card.Retrieved {
		g.Decks.PlayerDiscard = append(g.Decks.PlayerDiscard, taken)
	}
}

func eventSuccess(g *GameState, message string) Result {
	return Result{Success: true, Status: StatusSuccess, Message: message, GameState: g}
}

// Airlift moves any player's pawn to any city (use_airlift); a Medic then
// clears cured colors there. playerIndex must be given and lie in
// 0..len(Players)-1; it is checked after the card and the city (cc-435).
func (g *GameState) Airlift(playerIndex *int, city string) Result {
	holder, card, failed := g.eventCardHolder(Airlift)
	if failed != nil {
		return *failed
	}
	switch {
	case g.City(city) == nil:
		return actionError(fmt.Sprintf("City '%s' does not exist", city))
	case playerIndex == nil:
		return actionError("No player given for Airlift")
	case *playerIndex < 0 || *playerIndex >= len(g.Players):
		return actionError(fmt.Sprintf("Unknown player %d", *playerIndex))
	}
	p := &g.Players[*playerIndex]

	g.spendEventCard(holder, card)
	from := p.Location
	p.Location = city
	g.medicAbility(p, city)
	return eventSuccess(g, fmt.Sprintf("Successfully Airlifted %s from %s to %s", p.Role, from, city))
}

// GovernmentGrant builds a research station in any city without a city card
// (use_government_grant). Like BuildResearchStation, it leaves the city's
// HasResearchStation alone.
func (g *GameState) GovernmentGrant(city string) Result {
	holder, card, failed := g.eventCardHolder(GovernmentGrant)
	if failed != nil {
		return *failed
	}
	switch {
	case len(g.ResearchStations) >= MaxResearchStations:
		return actionError("Maximum number of research stations reached")
	case g.hasResearchStation(city):
		return actionError("Research station already exists in " + city)
	case g.City(city) == nil:
		return actionError(fmt.Sprintf("City '%s' does not exist", city))
	}

	g.spendEventCard(holder, card)
	g.ResearchStations = append(g.ResearchStations, city)
	return eventSuccess(g, fmt.Sprintf("Successfully built a research station in %s using Government Grant", city))
}

// ResilientPopulation removes a card from the infection discard pile for
// good (use_resilient_population).
func (g *GameState) ResilientPopulation(city string) Result {
	holder, card, failed := g.eventCardHolder(ResilientPopulation)
	if failed != nil {
		return *failed
	}
	i := slices.IndexFunc(g.Decks.InfectionDiscard, func(c Card) bool { return c.Name == city })
	if i < 0 {
		return actionError(fmt.Sprintf("City '%s' not found in infection discard pile", city))
	}

	g.spendEventCard(holder, card)
	g.Decks.InfectionDiscard = slices.Delete(g.Decks.InfectionDiscard, i, i+1)
	return eventSuccess(g, fmt.Sprintf("Successfully removed %s from the infection discard pile", city))
}

// PlayOneQuietNight sets QuietNight, so the next infect_cities step skips
// its infections (quiet_night!).
func (g *GameState) PlayOneQuietNight() Result {
	holder, card, failed := g.eventCardHolder(OneQuietNight)
	if failed != nil {
		return *failed
	}

	g.spendEventCard(holder, card)
	quiet := true
	g.QuietNight = &quiet
	return eventSuccess(g, "Tonight at least will be quiet")
}

// Forecast is the first step of the Forecast card (use_forecast): it shows
// the top six infection cards (the end of the deck), next card first, and
// sets ForecastActive until ApplyForecast gets their new order. When nobody
// holds the card, it returns the error result instead.
func (g *GameState) Forecast() (ForecastView, *Result) {
	holder, card, failed := g.eventCardHolder(Forecast)
	if failed != nil {
		return ForecastView{}, failed
	}

	g.spendEventCard(holder, card)
	deck := g.Decks.InfectionDeck
	top := deck[max(len(deck)-forecastCardCount, 0):]
	view := ForecastView{
		Status:  StatusSuccess,
		Type:    "forecast_view",
		Message: "Choose the order for the infection cards",
		Cards:   make([]ForecastCard, 0, len(top)),
	}
	g.ForecastCards = make([]string, 0, len(top))
	for i := len(top) - 1; i >= 0; i-- {
		view.Cards = append(view.Cards, ForecastCard{Name: top[i].Name, Color: top[i].Color})
		g.ForecastCards = append(g.ForecastCards, top[i].Name)
	}
	g.ForecastActive = true
	return view, nil
}

// ApplyForecast puts the forecast cards back on top of the infection deck so
// that the first of cardOrder is drawn next, and ends the Forecast
// (apply_forecast). cardOrder must be a permutation of ForecastCards. The
// cards come back as city cards.
func (g *GameState) ApplyForecast(cardOrder []string) *Rejection {
	if !g.ForecastActive {
		return &Rejection{Status: StatusError, Message: "Forecast is not active"}
	}
	if !samePermutation(cardOrder, g.ForecastCards) {
		return &Rejection{Status: StatusError, Message: "Invalid card order provided"}
	}

	deck := g.Decks.InfectionDeck
	deck = deck[:max(len(deck)-len(g.ForecastCards), 0)]
	for _, name := range slices.Backward(cardOrder) {
		if city := g.City(name); city != nil {
			deck = append(deck, Card{Type: CityCard, Name: name, Color: city.Color})
		}
	}
	g.Decks.InfectionDeck = deck
	g.ForecastActive = false
	g.ForecastCards = nil
	return nil
}

// samePermutation reports whether a and b hold the same names, counting
// repeats (Ruby's a.tally == b.tally).
func samePermutation(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	return slices.Equal(slices.Sorted(slices.Values(a)), slices.Sorted(slices.Values(b)))
}
