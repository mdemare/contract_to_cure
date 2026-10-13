package game

import (
	"fmt"
	"net/http"
	"slices"
)

// End-turn event types, in the end_turn_events list that
// public/js/end_turn_events.js animates.
const (
	EventDrawCard              = "draw_card"
	EventIncreaseInfectionRate = "increase_infection_rate"
	EventOutbreak              = "outbreak"
	EventInfectNewCity         = "infect_new_city"
	EventGameOver              = "game_over"
	EventWaitInfectCities      = "wait_infect_cities"
	EventInfectCity            = "infect_city"
	EventQuietNight            = "quiet_night"
	EventHeader                = "header"
)

// Event is one entry of end_turn_events. Each event type is its own struct,
// with its fields in the order Rails builds the hash.
type Event interface{ isEvent() }

// DrawCardEvent is a drawn player card. The second draw carries the pending
// discard when it takes the hand over the limit.
type DrawCardEvent struct {
	Type              string            `json:"type"`
	Player            int               `json:"player"`
	Card              CardDescription   `json:"card"`
	ExceededHandLimit *PendingHandLimit `json:"exceeded_hand_limit,omitempty"`
}

// CardDescription is a card as events show it (Card#description): only city
// cards have a color.
type CardDescription struct {
	Type  CardType `json:"type"`
	Name  string   `json:"name"`
	Color Color    `json:"color,omitempty"`
}

// IncreaseInfectionRateEvent starts an epidemic.
type IncreaseInfectionRateEvent struct {
	Type    string `json:"type"`
	NewRate int    `json:"new_rate"`
}

// OutbreakEvent is one city's outbreak. OutbreakChain is the cascade up to
// and including this city, copied when the event is made (cc-401).
type OutbreakEvent struct {
	Type          string   `json:"type"`
	City          string   `json:"city"`
	Color         Color    `json:"color"`
	OutbreakChain []string `json:"outbreak_chain"`
}

// InfectNewCityEvent is the epidemic's three cubes on the bottom card.
type InfectNewCityEvent struct {
	Type     string `json:"type"`
	City     string `json:"city"`
	Color    Color  `json:"color"`
	Count    int    `json:"count"`
	Epidemic bool   `json:"epidemic"`
}

// GameOverEvent ends the game while cubes are placed. Only an epidemic adds
// it to the events; Color is set when the cubes ran out during placement.
type GameOverEvent struct {
	Type   string         `json:"type"`
	Reason GameOverReason `json:"reason"`
	Color  Color          `json:"color,omitempty"`
}

// WaitInfectCitiesEvent ends the draw.
type WaitInfectCitiesEvent struct {
	Type string `json:"type"`
}

// InfectCityEvent is one infection card drawn in the infect phase.
type InfectCityEvent struct {
	Type  string `json:"type"`
	City  string `json:"city"`
	Color Color  `json:"color"`
}

// QuietNightEvent is an infect phase skipped by One Quiet Night.
type QuietNightEvent struct {
	Type string `json:"type"`
}

// HeaderEvent announces the next player's turn. Rails puts message first.
type HeaderEvent struct {
	Message string `json:"message"`
	Type    string `json:"type"`
}

func (DrawCardEvent) isEvent()              {}
func (IncreaseInfectionRateEvent) isEvent() {}
func (OutbreakEvent) isEvent()              {}
func (InfectNewCityEvent) isEvent()         {}
func (GameOverEvent) isEvent()              {}
func (WaitInfectCitiesEvent) isEvent()      {}
func (InfectCityEvent) isEvent()            {}
func (QuietNightEvent) isEvent()            {}
func (HeaderEvent) isEvent()                {}

// EndTurnEvents is end_turn_events: the events in order, and on a game over
// its reason (cc-386).
type EndTurnEvents struct {
	GameOver bool           `json:"game_over"`
	Reason   GameOverReason `json:"reason,omitempty"`
	Events   []Event        `json:"events"`
}

// EndTurnResult is the response of a /draw_cards or /infect_cities step
// that ran. Message is always null, and EndTurn always true.
type EndTurnResult struct {
	Success       bool          `json:"success"`
	Status        string        `json:"status"`
	Message       *string       `json:"message"`
	EndTurn       bool          `json:"end_turn"`
	EndTurnEvents EndTurnEvents `json:"end_turn_events"`
	GameState     *GameState    `json:"game_state"`
}

// StatusOnly is the {"status": "success"} Rails answers when actions are
// left: nothing is drawn or infected.
type StatusOnly struct {
	Status string `json:"status"`
}

// EndTurnResponse is what Rails renders for /draw_cards or /infect_cities.
type EndTurnResponse struct {
	// Body is an EndTurnResult, a *Rejection or a StatusOnly.
	Body       any
	HTTPStatus int
	// Changed is true when Rails saved the game: whenever the step ran,
	// including on a game over (cc-399).
	Changed bool
}

// checkEndTurnPhase rejects a draw or infect step while a hand-limit discard
// is pending or outside its phase. With actions left, the step does nothing.
func (g *GameState) checkEndTurnPhase(phase Phase) *EndTurnResponse {
	var body any
	switch {
	case g.PendingHandLimit != nil:
		body = &Rejection{Status: StatusError, Message: "Must resolve pending hand-limit discard before continuing"}
	case g.Phase != phase:
		body = &Rejection{Status: StatusError, Message: "Cannot perform this action unless game phase is " + string(phase)}
	case g.ActionsRemaining != 0:
		return &EndTurnResponse{Body: StatusOnly{Status: StatusSuccess}, HTTPStatus: http.StatusOK}
	default:
		return nil
	}
	return &EndTurnResponse{Body: body, HTTPStatus: http.StatusUnprocessableEntity}
}

func (g *GameState) endTurnResponse(events []Event) EndTurnResponse {
	result := EndTurnResult{
		Success:       true,
		Status:        StatusSuccess,
		EndTurn:       true,
		EndTurnEvents: EndTurnEvents{GameOver: g.GameOver, Events: events},
		GameState:     g,
	}
	if g.GameOver {
		result.EndTurnEvents.Reason = g.GameOverReason
	}
	return EndTurnResponse{Body: result, HTTPStatus: http.StatusOK, Changed: true}
}

// DrawCards is POST /draw_cards (GameController#draw_cards with
// EndTurnEvents#draw_cards). The current player draws two player cards. An
// epidemic is resolved at once and never reaches the hand. After the second
// draw a hand over the limit makes the player discard before infect_cities;
// otherwise the phase moves on to infect_cities. On a game over the phase
// stays. rng shuffles the infection discard when an epidemic intensifies.
// The caller runs CheckForecast and CheckGameOver first.
func (g *GameState) DrawCards(rng Shuffler) EndTurnResponse {
	if rej := g.checkEndTurnPhase(DrawCards); rej != nil {
		return *rej
	}
	events := []Event{}
	for i := range 2 {
		g.drawPlayerCard(i == 1, &events, rng)
		if g.GameOver {
			return g.endTurnResponse(events)
		}
	}
	events = append(events, WaitInfectCitiesEvent{Type: EventWaitInfectCities})
	if g.PendingHandLimit == nil {
		g.Phase = InfectCities
	}
	return g.endTurnResponse(events)
}

// drawPlayerCard draws one player card from the top (EndTurn#draw_player_card).
// An empty deck loses the game.
func (g *GameState) drawPlayerCard(last bool, events *[]Event, rng Shuffler) {
	deck := g.Decks.PlayerDeck
	if len(deck) == 0 {
		g.GameOver = true
		g.GameOverReason = NoPlayerCards
		return
	}
	card := deck[len(deck)-1]
	g.Decks.PlayerDeck = deck[:len(deck)-1]

	event := DrawCardEvent{Type: EventDrawCard, Player: g.CurrentPlayerIdx, Card: describe(card)}
	p := g.CurrentPlayer()
	if card.Type != EpidemicCard {
		p.Hand = append(p.Hand, card)
		p.SortHand()
	}
	if last && len(p.Hand) > HandLimit {
		event.ExceededHandLimit = g.setPendingHandLimit(g.CurrentPlayerIdx, InfectCities)
	}
	*events = append(*events, event)

	if card.Type == EpidemicCard {
		g.handleEpidemic(events, rng)
	}
}

func describe(c Card) CardDescription {
	d := CardDescription{Type: c.Type, Name: c.Name}
	if c.Type == CityCard {
		d.Color = c.Color
	}
	return d
}

// handleEpidemic increases the infection rate, puts three cubes on the
// bottom infection card's city and intensifies. With an empty infection
// deck it only increases the rate.
func (g *GameState) handleEpidemic(events *[]Event, rng Shuffler) {
	g.increaseInfectionRate()
	*events = append(*events, IncreaseInfectionRateEvent{Type: EventIncreaseInfectionRate, NewRate: g.InfectionRate})

	if len(g.Decks.InfectionDeck) == 0 {
		return
	}
	bottom := g.Decks.InfectionDeck[0]
	g.Decks.InfectionDeck = g.Decks.InfectionDeck[1:]
	city := g.City(bottom.Name)

	// The outbreak events are already in events (cc-387); only a game over
	// still needs adding.
	if over := g.addDiseaseCubes(city.Name, city.Color, 3, events); over != nil {
		*events = append(*events, *over)
	}

	g.Decks.InfectionDiscard = append(g.Decks.InfectionDiscard, bottom)
	*events = append(*events, InfectNewCityEvent{
		Type: EventInfectNewCity, City: city.Name, Color: city.Color, Count: 3, Epidemic: true,
	})
	g.intensify(rng)
}

// increaseInfectionRate moves the marker on; past the end of the track the
// rate stays.
func (g *GameState) increaseInfectionRate() {
	g.InfectionRatePosition++
	if g.InfectionRatePosition < len(InfectionRateTrack) {
		g.InfectionRate = InfectionRateTrack[g.InfectionRatePosition]
	}
}

// intensify shuffles the infection discard onto the top of the infection
// deck, so those cities are drawn next.
func (g *GameState) intensify(rng Shuffler) {
	shuffle(rng, g.Decks.InfectionDiscard)
	g.Decks.InfectionDeck = append(g.Decks.InfectionDeck, g.Decks.InfectionDiscard...)
	g.Decks.InfectionDiscard = []Card{}
}

// InfectCities is POST /infect_cities (GameController#infect_cities with
// EndTurnEvents#infect_cities). It draws as many infection cards as the
// infection rate, or skips them once after One Quiet Night, then hands the
// turn to the next player. On a game over the player, phase and turn stay,
// but the game is still saved (cc-399). The caller runs CheckForecast and
// CheckGameOver first.
func (g *GameState) InfectCities() EndTurnResponse {
	if rej := g.checkEndTurnPhase(InfectCities); rej != nil {
		return *rej
	}
	events := []Event{}
	if g.QuietNight != nil && *g.QuietNight {
		quiet := false
		g.QuietNight = &quiet
		events = append(events, QuietNightEvent{Type: EventQuietNight})
	} else {
		for range g.InfectionRate {
			g.infectCity(&events)
			if g.GameOver {
				return g.endTurnResponse(events)
			}
		}
	}

	g.CurrentPlayerIdx = (g.CurrentPlayerIdx + 1) % len(g.Players)
	g.ActionsRemaining = StartingActions
	g.Phase = PlayerActions
	g.Turn++
	g.OperationsExpertMoveUsed = false

	events = append(events, HeaderEvent{Message: "TURN START: " + g.CurrentPlayer().Role.Name(), Type: EventHeader})
	return g.endTurnResponse(events)
}

// infectCity draws the top infection card and adds a cube to its city
// (EndTurn#infect_city). An empty deck infects nothing.
func (g *GameState) infectCity(events *[]Event) {
	deck := g.Decks.InfectionDeck
	if len(deck) == 0 {
		return
	}
	card := deck[len(deck)-1]
	g.Decks.InfectionDeck = deck[:len(deck)-1]
	g.Decks.InfectionDiscard = append(g.Decks.InfectionDiscard, card)

	city := g.City(card.Name)
	*events = append(*events, InfectCityEvent{Type: EventInfectCity, City: city.Name, Color: city.Color})
	g.addDiseaseCubes(city.Name, city.Color, 1, events)
}

// addDiseaseCubes puts count cubes of color on a city (add_disease_cubes):
// at most up to three, with an outbreak if more were asked for. Placement
// needs the city's own color, and quarantine, eradication and a Medic with
// the cure there block it. Taking more cubes than the supply has loses, but
// taking the last one does not (cc-259). It returns the game over, if any;
// GameOver and GameOverReason are set too.
func (g *GameState) addDiseaseCubes(cityKey string, color Color, count int, events *[]Event) *GameOverEvent {
	if g.placementProtected(cityKey, color) {
		return nil
	}
	disease := g.Disease(color)
	if disease.Cured && g.hasMedicAt(cityKey) {
		return nil
	}
	city := g.City(cityKey)
	if city.Color != color {
		return nil
	}

	toPlace := min(count, 3-city.diseaseCubes)
	if toPlace > disease.InSupply {
		city.addCubes(disease.InSupply)
		disease.InSupply = 0
		return g.lose(NoCubes, color)
	}

	disease.InSupply -= toPlace
	if city.diseaseCubes+count > 3 {
		city.addCubes(3 - city.diseaseCubes)
		return g.triggerOutbreak(cityKey, events, &[]string{})
	}
	city.addCubes(count)
	return nil
}

// triggerOutbreak spreads a cube to every connected city of the same color
// (trigger_outbreak). A full neighbour outbreaks in turn, but no city twice
// in one chain. Each outbreak adds to the counter, and MaxOutbreaks loses.
// Unlike direct placement, spreading ignores the Medic, and spreading with a
// single cube left in the supply loses (cc-259). It returns the game over,
// if any; chain holds the cities that broke out.
func (g *GameState) triggerOutbreak(cityKey string, events *[]Event, chain *[]string) *GameOverEvent {
	if slices.Contains(*chain, cityKey) {
		return nil
	}
	*chain = append(*chain, cityKey)
	city := g.City(cityKey)
	color := city.Color
	*events = append(*events, OutbreakEvent{
		Type: EventOutbreak, City: cityKey, Color: color,
		OutbreakChain: append([]string(nil), *chain...),
	})

	g.Outbreaks++
	if g.Outbreaks >= MaxOutbreaks {
		return g.lose(TooManyOutbreaks, "")
	}

	disease := g.Disease(color)
	for _, key := range city.Connections {
		neighbour := g.City(key)
		if g.placementProtected(key, color) || neighbour.Color != color {
			continue
		}
		if disease.InSupply == 1 {
			// The last cube is placed twice, once directly and once by
			// addDiseaseCubes, and then the game is lost.
			neighbour.addCubes(1)
			g.addDiseaseCubes(key, color, 1, events)
			disease.InSupply = 0
		}
		if disease.InSupply == 0 {
			return g.lose(NoCubes, color)
		}

		full := neighbour.diseaseCubes == 3
		if !full {
			disease.InSupply--
			neighbour.addCubes(1)
			continue
		}
		if over := g.triggerOutbreak(key, events, chain); over != nil {
			return over
		}
	}
	return nil
}

func (g *GameState) lose(reason GameOverReason, color Color) *GameOverEvent {
	g.GameOver = true
	g.GameOverReason = reason
	return &GameOverEvent{Type: EventGameOver, Reason: reason, Color: color}
}

func (c *City) addCubes(n int) { c.diseaseCubes = min(3, c.diseaseCubes+n) }

// placementProtected is a Quarantine Specialist in or next to the city, or
// an eradicated color.
func (g *GameState) placementProtected(cityKey string, color Color) bool {
	return g.quarantined(cityKey) || g.Disease(color).Eradicated()
}

func (g *GameState) quarantined(cityKey string) bool {
	near := append([]string{cityKey}, g.City(cityKey).Connections...)
	return slices.ContainsFunc(g.Players, func(p Player) bool {
		return p.Role == QuarantineSpecialist && slices.Contains(near, p.Location)
	})
}

func (g *GameState) hasMedicAt(cityKey string) bool {
	return slices.ContainsFunc(g.Players, func(p Player) bool {
		return p.Role == Medic && p.Location == cityKey
	})
}

// DiscardCards is POST /discard_cards (discard_cards_for_hand_limit): the
// player over the hand limit discards exactly the excess, from cards they
// hold, and play returns to the pending discard's phase. It costs no
// action. Like Rails, a retrieved card discarded here goes to the discard
// pile (cc-437). The game changed when Success is true.
func (g *GameState) DiscardCards(playerIndex int, cardNames []string) Result {
	pending := g.PendingHandLimit
	if pending == nil {
		return actionError("No hand-limit discard is pending")
	}
	if playerIndex != pending.PlayerIndex {
		return actionError("Only the player over the hand limit may discard")
	}
	required := g.handLimitExcess(playerIndex)
	if required <= 0 {
		g.resolvePendingHandLimit()
		return eventSuccess(g, "Hand limit already resolved")
	}
	if len(cardNames) != required {
		return actionError(fmt.Sprintf("Must discard exactly %d card(s) to resolve hand limit", required))
	}
	p := g.player(playerIndex)
	if missing, ok := firstMissingCard(p, cardNames); ok {
		return actionError(fmt.Sprintf("Player does not have the %s card", missing))
	}

	// A retrieved event card leaves the game, as when it is played.
	for _, name := range cardNames {
		if card, ok := p.takeCard(name); ok && !card.Retrieved {
			g.Decks.PlayerDiscard = append(g.Decks.PlayerDiscard, card)
		}
	}
	g.resolvePendingHandLimit()
	return eventSuccess(g, fmt.Sprintf("Successfully discarded %d card(s)", len(cardNames)))
}

// firstMissingCard returns the first name the hand does not hold, counting
// repeated names.
func firstMissingCard(p *Player, cardNames []string) (string, bool) {
	held := map[string]int{}
	for _, c := range p.Hand {
		held[c.Name]++
	}
	for _, name := range cardNames {
		held[name]--
		if held[name] < 0 {
			return name, true
		}
	}
	return "", false
}
