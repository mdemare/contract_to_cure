package game

import (
	"fmt"
	"slices"
)

// Result statuses.
const (
	StatusSuccess           = "success"
	StatusError             = "error"
	StatusCardRequired      = "card_required"
	StatusActionUnavailable = "action_unavailable"
)

// Result is the hash a player action returns in Rails. The fields are in the
// order Rails builds the hash, and the optional ones are left out when unset,
// so it marshals key for key like the Ruby response.
//
// The game changed, and Rails saved it, exactly when Success is true.
type Result struct {
	Success      bool     `json:"success"`
	Status       string   `json:"status"`
	Message      string   `json:"message"`
	EndTurn      *bool    `json:"end_turn,omitempty"` // set on success
	CubesRemoved int      `json:"cubes_removed,omitempty"`
	MovementType string   `json:"movement_type,omitempty"` // with card_required
	Options      []string `json:"options,omitempty"`
	// GameState is the game after the action, rendered as the client JSON
	// view (to_json_state). That view is ported in cc-420.
	GameState         *GameState        `json:"game_state,omitempty"`
	ExceededHandLimit *PendingHandLimit `json:"exceeded_hand_limit,omitempty"`
}

// Rejection is a guard's error: {status, message} without a success key.
type Rejection struct {
	Status  string `json:"status"`
	Message string `json:"message"`
}

// CheckGameOver rejects every request but a restart once the game is over
// (check_game_over, cc-404). A finished game keeps its phase, so CheckAction
// alone does not stop it. Like Rails, the actions themselves do not check
// GameOver: the caller runs this guard first.
func (g *GameState) CheckGameOver() *Rejection {
	if !g.GameOver {
		return nil
	}
	return &Rejection{Status: StatusError, Message: "The game is over"}
}

// CheckAction rejects player actions outside the player_actions phase,
// including while a hand-limit discard is pending (check_action).
func (g *GameState) CheckAction() *Rejection {
	if g.Phase == PlayerActions {
		return nil
	}
	return &Rejection{Status: StatusError, Message: "No more actions allowed"}
}

func actionError(message string) Result {
	return Result{Success: false, Status: StatusError, Message: message}
}

// afterAction spends an action, moves on to drawing cards after the last
// one, and returns the successful result (after_action).
func (g *GameState) afterAction(message string) Result {
	g.ActionsRemaining--
	if g.ActionsRemaining <= 0 {
		g.Phase = DrawCards
	}
	endTurn := g.ActionsRemaining == 0
	return Result{Success: true, Status: StatusSuccess, Message: message, EndTurn: &endTurn, GameState: g}
}

// player returns players[i] with Ruby's indexing, where -1 is the last
// player, or nil when i is out of range.
func (g *GameState) player(i int) *Player {
	if i < 0 {
		i += len(g.Players)
	}
	if i < 0 || i >= len(g.Players) {
		return nil
	}
	return &g.Players[i]
}

func (p *Player) cardIndex(match func(Card) bool) int {
	return slices.IndexFunc(p.Hand, match)
}

func (p *Player) cityCardIndex(name string) int {
	return p.cardIndex(func(c Card) bool { return c.Type == CityCard && c.Name == name })
}

func (p *Player) hasCityCard(name string) bool { return p.cityCardIndex(name) >= 0 }

// missingCard returns the first name that is not matched by a card of its
// own in the hand, counting repeated names against the cards with that name
// (Rails' first_missing_card_name). ok is false when every name is covered.
func (p *Player) missingCard(names []string) (name string, ok bool) {
	available := map[string]int{}
	for _, c := range p.Hand {
		available[c.Name]++
	}
	for _, n := range names {
		available[n]--
		if available[n] < 0 {
			return n, true
		}
	}
	return "", false
}

// takeCard removes the first card with this name, of any type, from the
// hand and re-sorts it.
func (p *Player) takeCard(name string) (Card, bool) {
	i := p.cardIndex(func(c Card) bool { return c.Name == name })
	if i < 0 {
		return Card{}, false
	}
	card := p.Hand[i]
	p.Hand = slices.Delete(p.Hand, i, i+1)
	p.SortHand()
	return card, true
}

// discard moves the first card with this name, of any type, to the player
// discard pile and re-sorts the hand. It does nothing if there is none
// (discard_player_card_by_name).
func (g *GameState) discard(p *Player, name string) {
	if card, ok := p.takeCard(name); ok {
		g.Decks.PlayerDiscard = append(g.Decks.PlayerDiscard, card)
	}
}

func (g *GameState) hasResearchStation(city string) bool {
	return slices.Contains(g.ResearchStations, city)
}

// medicAbility removes every cube of a cured color from the Medic's city.
func (g *GameState) medicAbility(p *Player, cityKey string) {
	if p.Role != Medic {
		return
	}
	city := g.City(cityKey)
	disease := g.Disease(city.Color)
	if !disease.Cured {
		return
	}
	disease.InSupply += city.diseaseCubes
	city.diseaseCubes = 0
}

func (g *GameState) handLimitExcess(playerIndex int) int {
	return max(len(g.player(playerIndex).Hand)-HandLimit, 0)
}

// setPendingHandLimit makes the player discard down to the hand limit before
// play goes on in returnPhase. It returns the pending discard, or nil when
// the player is within the limit (set_pending_hand_limit). Every way of
// going over the limit goes through here.
func (g *GameState) setPendingHandLimit(playerIndex int, returnPhase Phase) *PendingHandLimit {
	count := g.handLimitExcess(playerIndex)
	if count <= 0 {
		return nil
	}
	g.PendingHandLimit = &PendingHandLimit{PlayerIndex: playerIndex, DiscardCount: count, ReturnPhase: returnPhase}
	g.Phase = PendingDiscard
	pending := *g.PendingHandLimit
	return &pending
}

// resolvePendingHandLimit ends the pending discard and returns to its phase
// once the player is within the limit, or updates the discard count if not
// (resolve_pending_hand_limit_if_satisfied). It reports whether it ended.
func (g *GameState) resolvePendingHandLimit() bool {
	pending := g.PendingHandLimit
	if pending == nil {
		return false
	}
	if count := g.handLimitExcess(pending.PlayerIndex); count > 0 {
		pending.DiscardCount = count
		return false
	}
	g.Phase = pending.ReturnPhase
	g.PendingHandLimit = nil
	return true
}

// checkHandLimit runs after an action that gave the player a card. Over the
// limit, the discard returns to the phase after the action, and the result
// carries it as exceeded_hand_limit.
func (g *GameState) checkHandLimit(res *Result, playerIndex int) {
	res.ExceededHandLimit = g.setPendingHandLimit(playerIndex, g.Phase)
}

// Move moves the pawn of playerIndex to destination (move). The current
// player moves their own pawn; the Dispatcher may move any pawn. The first
// matching rule picks the movement type: drive/ferry, shuttle flight, the
// Operations Expert's move from a station, the Dispatcher's move to another
// pawn, then direct or charter flight. When a card choice is needed, the
// result is card_required with the movement type; cardName answers it, and
// an empty cardName means none was given.
func (g *GameState) Move(playerIndex int, destination, cardName string) Result {
	if playerIndex < 0 || playerIndex >= len(g.Players) {
		return actionError(fmt.Sprintf("Unknown player %d", playerIndex))
	}
	player := &g.Players[playerIndex]
	acting := g.CurrentPlayer()
	dispatcherMove := acting.Role == Dispatcher && playerIndex != g.CurrentPlayerIdx

	if playerIndex != g.CurrentPlayerIdx && acting.Role != Dispatcher {
		return actionError("Current player cannot move another player's pawn unless they are the Dispatcher")
	}

	from := player.Location
	if g.City(destination) == nil {
		return actionError("Unknown destination " + destination)
	}

	var moveType string
	switch {
	case slices.Contains(g.City(from).Connections, destination):
		moveType = "drive / ferry"
	case g.hasResearchStation(from) && g.hasResearchStation(destination):
		moveType = "shuttle flight"
	case !dispatcherMove && acting.Role == OperationsExpert && g.hasResearchStation(from) &&
		len(acting.CityCards()) > 0 && !g.OperationsExpertMoveUsed:
		// The once-per-turn limit applies only to this ability; ordinary
		// flights remain available.
		if cardName == "" || !acting.hasCityCard(cardName) {
			return Result{
				Success:      false,
				Status:       StatusCardRequired,
				Message:      "Operations Expert requires a city card to move from a research station to any city",
				MovementType: "operations_expert_special",
			}
		}
		moveType = "operation researcher special move"
		g.discard(acting, cardName)
		g.OperationsExpertMoveUsed = true
	case acting.Role == Dispatcher && slices.ContainsFunc(g.Players, func(p Player) bool {
		return p.Location == destination && p.Index != playerIndex
	}):
		moveType = "dispatcher special move"
	case acting.hasCityCard(destination):
		if !acting.hasCityCard(from) {
			moveType = "direct flight"
			g.discard(acting, destination)
			break
		}
		switch cardName {
		case "":
			return Result{
				Success:      false,
				Status:       StatusCardRequired,
				Message:      "You can use either a direct flight (discard destination card) or a charter flight (discard current location card)",
				MovementType: "flight_choice",
				Options:      []string{"direct_flight", "charter_flight"},
			}
		case destination:
			moveType = "direct flight"
		case from:
			moveType = "charter flight"
		default:
			return actionError("Selected card does not match either the current location or destination")
		}
		g.discard(acting, cardName)
	case acting.hasCityCard(from):
		moveType = "charter flight"
		g.discard(acting, from)
	default:
		return actionError(fmt.Sprintf("Cannot move player to destination %s from %s", destination, from))
	}

	player.Location = destination
	g.medicAbility(player, destination)
	return g.afterAction(fmt.Sprintf("Successfully moved %s from %s to %s via %s", player.Role, from, destination, moveType))
}

// BuildResearchStation builds a station in the current player's city by
// discarding its card; the Operations Expert needs no card. At most
// MaxResearchStations exist. Like Rails, it adds the city to
// ResearchStations but leaves the city's HasResearchStation alone.
func (g *GameState) BuildResearchStation() Result {
	p := g.CurrentPlayer()
	city := p.Location
	if len(g.ResearchStations) >= MaxResearchStations {
		return actionError("Maximum number of research stations reached")
	}
	if g.hasResearchStation(city) {
		return actionError("Research station already exists in " + city)
	}
	if p.Role == OperationsExpert {
		g.ResearchStations = append(g.ResearchStations, city)
		return g.afterAction(fmt.Sprintf("Successfully built a research station in %s (Operations Expert ability)", city))
	}
	if !p.hasCityCard(city) {
		return actionError(fmt.Sprintf("Player does not have the %s city card", city))
	}
	g.discard(p, city)
	g.ResearchStations = append(g.ResearchStations, city)
	return g.afterAction("Successfully built a research station in " + city)
}

// Pass spends the rest of the turn's actions.
func (g *GameState) Pass() Result {
	g.ActionsRemaining = 1
	return g.afterAction("Passed for the rest of the turn")
}

// TreatDisease removes a cube of the city's color from the current player's
// city, or every cube for the Medic or a cured color (treat_disease). With no
// cubes it is action_unavailable, with the game state.
func (g *GameState) TreatDisease() Result {
	city := g.City(g.CurrentPlayer().Location)
	disease := g.Disease(city.Color)
	if city.diseaseCubes == 0 {
		return Result{
			Success:   false,
			Status:    StatusActionUnavailable,
			Message:   fmt.Sprintf("No %s disease cubes to treat in %s", city.Color, city.Name),
			GameState: g,
		}
	}
	removed := 1
	if g.CurrentPlayer().Role == Medic || disease.Cured {
		removed = city.diseaseCubes
	}
	city.diseaseCubes -= removed
	disease.InSupply += removed

	res := g.afterAction(fmt.Sprintf("Treated %s disease in %s", city.Color, city.Name))
	res.CubesRemoved = removed
	return res
}

// ShareKnowledge gives a city card from one player to another in the same
// city. The card must match that city unless the giver is the Researcher.
// Both indexes must be in 0..players-1.
func (g *GameState) ShareKnowledge(givingIndex, receivingIndex int, cityName string) Result {
	for _, i := range []int{givingIndex, receivingIndex} {
		if i < 0 || i >= len(g.Players) {
			return actionError(fmt.Sprintf("Unknown player %d", i))
		}
	}
	giver, receiver := &g.Players[givingIndex], &g.Players[receivingIndex]
	if giver.Location != receiver.Location {
		return actionError("Both players must be in the same city to share knowledge")
	}
	i := giver.cityCardIndex(cityName)
	if i < 0 {
		return actionError(fmt.Sprintf("Player does not have the %s city card", cityName))
	}
	card := giver.Hand[i]
	if card.Name != giver.Location && giver.Role != Researcher {
		return actionError("Card must match current location or player must be a researcher")
	}

	giver.Hand = slices.Delete(giver.Hand, i, i+1)
	giver.SortHand()
	receiver.Hand = append(receiver.Hand, card)
	receiver.SortHand()

	res := g.afterAction(fmt.Sprintf("Successfully shared %s card from %s to %s", card.Name, giver.Role, receiver.Role))
	g.checkHandLimit(&res, receivingIndex)
	return res
}

// CureDisease discards the named cards, all of the color, at a research
// station: CardsNeededForCure of them. Medics then clear the cured color from
// their cities, and the fourth cure wins the game. Each name must be a
// different card from the hand.
func (g *GameState) CureDisease(color Color, cardNames []string) Result {
	p := g.CurrentPlayer()
	if !g.hasResearchStation(p.Location) {
		return actionError("Player must be at a research station to discover a cure")
	}
	disease := g.Disease(color)
	if disease != nil && disease.Cured {
		return actionError(fmt.Sprintf("The %s disease is already cured", color))
	}
	needed := CardsNeededForCure(p.Role)
	if len(cardNames) != needed {
		return actionError(fmt.Sprintf("Need %d cards of the same color to discover a cure", needed))
	}
	for _, name := range cardNames {
		i := p.cityCardIndex(name)
		if i < 0 || p.Hand[i].Color != color {
			return actionError(fmt.Sprintf("All selected cards must be %s city cards", color))
		}
	}
	if _, ok := p.missingCard(cardNames); ok {
		return actionError("Selected cards must be different cards from your hand")
	}

	for _, name := range cardNames {
		g.discard(p, name)
	}
	disease.Cured = true
	for i := range g.Players {
		g.medicAbility(&g.Players[i], g.Players[i].Location)
	}
	if !slices.ContainsFunc(g.DiseaseCubes, func(d DiseaseCubes) bool { return !d.Cured }) {
		g.GameOver = true
		g.GameOverReason = Victory
	}
	return g.afterAction(fmt.Sprintf("Successfully discovered a cure for the %s disease!", color))
}

// Retrieve lets the Contingency Planner take an event card from the player
// discard pile. The card is marked retrieved, so it leaves the game once
// played, and goes to the end of the hand unsorted. Every discarded card with
// that name leaves the pile.
func (g *GameState) Retrieve(actionCardName string) Result {
	p := g.CurrentPlayer()
	if p.Role != ContingencyPlanner {
		return actionError("Only the Contingency Planner can retrieve action cards")
	}
	i := slices.IndexFunc(g.Decks.PlayerDiscard, func(c Card) bool { return c.Name == actionCardName })
	if i < 0 {
		return actionError(fmt.Sprintf("Card '%s' not found in discard pile", actionCardName))
	}
	card := g.Decks.PlayerDiscard[i]
	if card.Type != ActionCard {
		return actionError(fmt.Sprintf("Card '%s' is not an action card", actionCardName))
	}

	card.Retrieved = true
	p.Hand = append(p.Hand, card)
	g.Decks.PlayerDiscard = slices.DeleteFunc(g.Decks.PlayerDiscard, func(c Card) bool { return c.Name == actionCardName })

	res := g.afterAction(fmt.Sprintf("Successfully retrieved '%s' action card", actionCardName))
	g.checkHandLimit(&res, g.CurrentPlayerIdx)
	return res
}
