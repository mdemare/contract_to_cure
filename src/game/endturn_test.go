package game_test

import (
	"net/http"
	"reflect"
	"slices"
	"testing"

	"github.com/mdemare/contract_to_cure/src/game"
)

// Unit tests ported from test/test_end_turn_events.rb, plus the end-turn
// flow that cc-383 lists. The contract scenarios are replayed in
// endturn_contract_test.go.

// outbreakGame has four Medics in Wuhan, so no Quarantine Specialist
// protects anything, and an empty board with full supplies.
func outbreakGame(t *testing.T) *game.GameState {
	t.Helper()
	return testGame(t, game.Medic, game.Medic, game.Medic, game.Medic)
}

// twoCityOutbreak connects only Chicago and Houston, with Chicago full.
func twoCityOutbreak(t *testing.T, g *game.GameState) {
	t.Helper()
	g.City("Chicago").Connections = []string{"Houston"}
	g.City("Houston").Connections = []string{"Chicago"}
	setCubes(t, g, "Chicago", 3)
	setCubes(t, g, "Houston", 0)
}

func setCubes(t *testing.T, g *game.GameState, city string, n int) {
	t.Helper()
	if err := g.City(city).SetDiseaseCubes(n); err != nil {
		t.Fatal(err)
	}
}

func cubes(g *game.GameState, city string) int { return g.City(city).DiseaseCubes() }

func supply(g *game.GameState, c game.Color) int { return g.Disease(c).InSupply }

// eventJSON marshals each event.
func eventJSON(t *testing.T, events []game.Event) []string {
	t.Helper()
	var out []string
	for _, e := range events {
		out = append(out, string(marshal(t, e)))
	}
	return out
}

func outbreaks(events []game.Event) []game.OutbreakEvent {
	var out []game.OutbreakEvent
	for _, e := range events {
		if o, ok := e.(game.OutbreakEvent); ok {
			out = append(out, o)
		}
	}
	return out
}

func TestAddDiseaseCubesAllowsExactSupplyPlacement(t *testing.T) {
	g := outbreakGame(t)
	g.Disease(game.Blue).InSupply = 1

	var events []game.Event
	if over := g.AddDiseaseCubes("Chicago", game.Blue, 1, &events); over != nil {
		t.Fatalf("game over: %+v", over)
	}
	if cubes(g, "Chicago") != 1 || supply(g, game.Blue) != 0 || g.GameOver || len(events) != 0 {
		t.Errorf("cubes %d, supply %d, over %v, events %v", cubes(g, "Chicago"), supply(g, game.Blue), g.GameOver, events)
	}
}

func TestAddDiseaseCubesSubtractsCubePlacedBeforeOutbreak(t *testing.T) {
	g := outbreakGame(t)
	setCubes(t, g, "Chicago", 2)
	g.City("Chicago").Connections = nil

	var events []game.Event
	g.AddDiseaseCubes("Chicago", game.Blue, 2, &events)

	if cubes(g, "Chicago") != 3 || supply(g, game.Blue) != 23 || g.Outbreaks != 1 || g.GameOver {
		t.Errorf("cubes %d, supply %d, outbreaks %d, over %v", cubes(g, "Chicago"), supply(g, game.Blue), g.Outbreaks, g.GameOver)
	}
	if len(outbreaks(events)) != 1 || len(events) != 1 {
		t.Errorf("events = %v", eventJSON(t, events))
	}
}

// The Medic blocks direct placement but not outbreak spread.
func TestDirectPlacementAndOutbreakRetainMedicDifference(t *testing.T) {
	g := outbreakGame(t)
	twoCityOutbreak(t, g)
	g.Disease(game.Blue).Cured = true
	g.Disease(game.Blue).InSupply = 10
	g.Players[0].Location = "Houston"

	var events []game.Event
	g.AddDiseaseCubes("Houston", game.Blue, 1, &events)
	if cubes(g, "Houston") != 0 || supply(g, game.Blue) != 10 {
		t.Errorf("direct: cubes %d, supply %d", cubes(g, "Houston"), supply(g, game.Blue))
	}

	g.TriggerOutbreak("Chicago", &events)
	if cubes(g, "Houston") != 1 || supply(g, game.Blue) != 9 {
		t.Errorf("outbreak: cubes %d, supply %d", cubes(g, "Houston"), supply(g, game.Blue))
	}
}

// Direct placement may take the last cube; outbreak spread with one cube
// left places two and loses (cc-259).
func TestDirectPlacementAndOutbreakRetainExactSupplyDifference(t *testing.T) {
	g := outbreakGame(t)
	twoCityOutbreak(t, g)
	g.Disease(game.Blue).InSupply = 1

	var events []game.Event
	g.AddDiseaseCubes("Houston", game.Blue, 1, &events)
	if cubes(g, "Houston") != 1 || supply(g, game.Blue) != 0 || g.GameOver {
		t.Errorf("direct: cubes %d, supply %d, over %v", cubes(g, "Houston"), supply(g, game.Blue), g.GameOver)
	}

	setCubes(t, g, "Houston", 0)
	g.Disease(game.Blue).InSupply = 1
	over, _ := g.TriggerOutbreak("Chicago", &events)
	if cubes(g, "Houston") != 2 || supply(g, game.Blue) != 0 || !g.GameOver || g.GameOverReason != game.NoCubes {
		t.Errorf("outbreak: cubes %d, supply %d, over %v %s", cubes(g, "Houston"), supply(g, game.Blue), g.GameOver, g.GameOverReason)
	}
	if want := (game.GameOverEvent{Type: "game_over", Reason: game.NoCubes, Color: game.Blue}); over == nil || *over != want {
		t.Errorf("result = %+v", over)
	}
}

func TestQuarantineAndEradicationProtectBothPlacementPaths(t *testing.T) {
	g := outbreakGame(t)
	twoCityOutbreak(t, g)
	g.Players[0].Role = game.QuarantineSpecialist
	g.Players[0].Location = "Houston"

	var events []game.Event
	g.AddDiseaseCubes("Houston", game.Blue, 1, &events)
	g.TriggerOutbreak("Chicago", &events)
	if cubes(g, "Houston") != 0 || supply(g, game.Blue) != 24 {
		t.Errorf("quarantine: cubes %d, supply %d", cubes(g, "Houston"), supply(g, game.Blue))
	}

	g.Players[0].Location = "Wuhan"
	g.Disease(game.Blue).Cured = true
	g.City("Houston").Connections = nil
	g.AddDiseaseCubes("Houston", game.Blue, 1, &events)
	g.TriggerOutbreak("Chicago", &events)
	if cubes(g, "Houston") != 0 || supply(g, game.Blue) != 24 {
		t.Errorf("eradicated: cubes %d, supply %d", cubes(g, "Houston"), supply(g, game.Blue))
	}
}

func TestChainedOutbreaksDoNotRevisitACity(t *testing.T) {
	g := outbreakGame(t)
	twoCityOutbreak(t, g)
	setCubes(t, g, "Houston", 3)

	var events []game.Event
	_, chain := g.TriggerOutbreak("Chicago", &events)

	if len(events) != 2 || len(outbreaks(events)) != 2 || g.Outbreaks != 2 || g.GameOver {
		t.Errorf("events %v, outbreaks %d, over %v", eventJSON(t, events), g.Outbreaks, g.GameOver)
	}
	if !slices.Equal(chain, []string{"Chicago", "Houston"}) {
		t.Errorf("chain = %v", chain)
	}
}

// Each event keeps its own copy of the chain so far (cc-401): the second
// outbreak must not show up in the first event's chain.
func TestEachOutbreakEventRecordsTheChainWhenItHappened(t *testing.T) {
	g := outbreakGame(t)
	twoCityOutbreak(t, g)
	setCubes(t, g, "Houston", 3)

	var events []game.Event
	_, chain := g.TriggerOutbreak("Chicago", &events)

	var chains [][]string
	for _, o := range outbreaks(events) {
		chains = append(chains, o.OutbreakChain)
	}
	if want := [][]string{{"Chicago"}, {"Chicago", "Houston"}}; !reflect.DeepEqual(chains, want) {
		t.Errorf("chains = %v, want %v", chains, want)
	}
	chain[0] = "changed"
	if chains[0][0] != "Chicago" || chains[1][0] != "Chicago" {
		t.Error("the events share the chain's backing array")
	}
}

func TestOutbreakGameOverIsPropagatedAtOutbreakLimit(t *testing.T) {
	g := outbreakGame(t)
	g.Outbreaks = game.MaxOutbreaks - 1
	setCubes(t, g, "Chicago", 3)

	var events []game.Event
	over, _ := g.TriggerOutbreak("Chicago", &events)

	if want := (game.GameOverEvent{Type: "game_over", Reason: game.TooManyOutbreaks}); over == nil || *over != want {
		t.Errorf("result = %+v", over)
	}
	if !g.GameOver || g.GameOverReason != game.TooManyOutbreaks {
		t.Errorf("over %v %s", g.GameOver, g.GameOverReason)
	}
	if got := string(marshal(t, *over)); got != `{"type":"game_over","reason":"too_many_outbreaks"}` {
		t.Errorf("JSON = %s", got)
	}
}

// drawGame is outbreakGame at the draw step, with an explicit player deck
// (drawn from the end) and infection deck (the epidemic takes the first).
func drawGame(t *testing.T, playerDeck []game.Card, infectionDeck ...string) *game.GameState {
	t.Helper()
	g := outbreakGame(t)
	g.Phase = game.DrawCards
	g.ActionsRemaining = 0
	g.Decks.PlayerDeck = playerDeck
	g.Decks.InfectionDeck = cityCards(t, g, infectionDeck...)
	g.Decks.InfectionDiscard = []game.Card{}
	return g
}

var epidemic = game.Card{Type: game.EpidemicCard, Name: game.EpidemicCardName}

func drawResult(t *testing.T, resp game.EndTurnResponse) game.EndTurnResult {
	t.Helper()
	res, ok := resp.Body.(game.EndTurnResult)
	if !ok || resp.HTTPStatus != http.StatusOK || !resp.Changed {
		t.Fatalf("response = %+v", resp)
	}
	return res
}

func TestEpidemicOutbreakChainEmitsEachOutbreakOnce(t *testing.T) {
	g := drawGame(t, cityCards(t, outbreakGame(t), "Lima"), "Chicago", "Paris")
	g.Decks.PlayerDeck = append(g.Decks.PlayerDeck, epidemic)
	twoCityOutbreak(t, g)
	setCubes(t, g, "Chicago", 1)
	setCubes(t, g, "Houston", 3)

	res := drawResult(t, g.DrawCards(seeded(1)))

	var cities []string
	for _, o := range outbreaks(res.EndTurnEvents.Events) {
		cities = append(cities, o.City)
	}
	if !slices.Equal(cities, []string{"Chicago", "Houston"}) || g.Outbreaks != 2 {
		t.Errorf("outbreaks in %v, count %d", cities, g.Outbreaks)
	}
}

func TestDrawCards(t *testing.T) {
	g := drawGame(t, cityCards(t, outbreakGame(t), "Lima", "Paris"))

	res := drawResult(t, g.DrawCards(seeded(1)))

	want := `{"success":true,"status":"success","message":null,"end_turn":true,"end_turn_events":{"game_over":false,"events":[` +
		`{"type":"draw_card","player":0,"card":{"type":"city","name":"Paris","color":"blue"}},` +
		`{"type":"draw_card","player":0,"card":{"type":"city","name":"Lima","color":"yellow"}},` +
		`{"type":"wait_infect_cities"}]},"game_state":` + string(marshal(t, g)) + `}`
	if got := string(marshal(t, res)); got != want {
		t.Errorf("JSON:\n got %s\nwant %s", got, want)
	}
	if g.Phase != game.InfectCities || !slices.Equal(names(g.CurrentPlayer().Hand), []string{"Paris", "Lima"}) {
		t.Errorf("phase %s, hand %v", g.Phase, names(g.CurrentPlayer().Hand))
	}
}

// An epidemic never reaches the hand: it raises the infection rate, puts
// three cubes on the bottom infection card's city, and intensifies, so the
// whole infection discard is drawn next (cc-383, point 1).
func TestDrawCardsEpidemic(t *testing.T) {
	g := drawGame(t, cityCards(t, outbreakGame(t), "Lima"), "Chicago", "Paris", "Tokyo")
	g.Decks.PlayerDeck = append(g.Decks.PlayerDeck, epidemic)
	g.Decks.InfectionDiscard = cityCards(t, g, "Rome", "Stockholm")
	g.InfectionRatePosition = 2

	res := drawResult(t, g.DrawCards(seeded(1)))

	types := eventJSON(t, res.EndTurnEvents.Events)
	want := []string{
		`{"type":"draw_card","player":0,"card":{"type":"epidemic","name":"Event:Epidemic"}}`,
		`{"type":"increase_infection_rate","new_rate":3}`,
		`{"type":"infect_new_city","city":"Chicago","color":"blue","count":3,"epidemic":true}`,
		`{"type":"draw_card","player":0,"card":{"type":"city","name":"Lima","color":"yellow"}}`,
		`{"type":"wait_infect_cities"}`,
	}
	if !slices.Equal(types, want) {
		t.Errorf("events:\n got %v\nwant %v", types, want)
	}
	if !slices.Equal(names(g.CurrentPlayer().Hand), []string{"Lima"}) {
		t.Errorf("hand = %v", names(g.CurrentPlayer().Hand))
	}
	if g.InfectionRatePosition != 3 || g.InfectionRate != 3 {
		t.Errorf("rate %d at %d", g.InfectionRate, g.InfectionRatePosition)
	}
	if cubes(g, "Chicago") != 3 || supply(g, game.Blue) != 21 {
		t.Errorf("Chicago %d, supply %d", cubes(g, "Chicago"), supply(g, game.Blue))
	}
	deck := names(g.Decks.InfectionDeck)
	top := slices.Sorted(slices.Values(deck[2:]))
	if !slices.Equal(deck[:2], []string{"Paris", "Tokyo"}) || !slices.Equal(top, []string{"Chicago", "Rome", "Stockholm"}) {
		t.Errorf("infection deck = %v", deck)
	}
	if len(g.Decks.InfectionDiscard) != 0 || g.Phase != game.InfectCities {
		t.Errorf("discard %v, phase %s", names(g.Decks.InfectionDiscard), g.Phase)
	}
}

// Past the end of the track the marker still moves, but the rate stays.
func TestInfectionRatePastTheTrack(t *testing.T) {
	g := drawGame(t, []game.Card{epidemic, epidemic})
	g.InfectionRatePosition = len(game.InfectionRateTrack) - 1
	g.InfectionRate = 4

	drawResult(t, g.DrawCards(seeded(1)))

	if g.InfectionRatePosition != len(game.InfectionRateTrack)+1 || g.InfectionRate != 4 {
		t.Errorf("rate %d at %d", g.InfectionRate, g.InfectionRatePosition)
	}
}

// The hand limit is checked after the second draw only; the discard then
// returns to infect_cities.
func TestDrawCardsHandLimit(t *testing.T) {
	g := drawGame(t, cityCards(t, outbreakGame(t), "Lima", "Paris"))
	g.CurrentPlayer().Hand = cityCards(t, g, "Tokyo", "Kyoto", "Seoul", "Beijing", "Shanghai", "Taipei")

	res := drawResult(t, g.DrawCards(seeded(1)))

	events := res.EndTurnEvents.Events
	first, second := events[0].(game.DrawCardEvent), events[1].(game.DrawCardEvent)
	want := game.PendingHandLimit{PlayerIndex: 0, DiscardCount: 1, ReturnPhase: game.InfectCities}
	if first.ExceededHandLimit != nil || second.ExceededHandLimit == nil || *second.ExceededHandLimit != want {
		t.Errorf("exceeded: %+v, %+v", first.ExceededHandLimit, second.ExceededHandLimit)
	}
	if g.Phase != game.PendingDiscard || g.PendingHandLimit == nil || *g.PendingHandLimit != want {
		t.Errorf("phase %s, pending %+v", g.Phase, g.PendingHandLimit)
	}
	if _, ok := events[len(events)-1].(game.WaitInfectCitiesEvent); !ok {
		t.Errorf("last event = %+v", events[len(events)-1])
	}
}

// A game over keeps the events so far, and the phase stays (cc-383 point 3,
// cc-386).
func TestDrawCardsGameOver(t *testing.T) {
	t.Run("empty player deck", func(t *testing.T) {
		g := drawGame(t, nil)

		res := drawResult(t, g.DrawCards(seeded(1)))

		want := `{"game_over":true,"reason":"no_player_cards","events":[]}`
		if got := string(marshal(t, res.EndTurnEvents)); got != want {
			t.Errorf("end_turn_events = %s, want %s", got, want)
		}
		if !g.GameOver || g.Phase != game.DrawCards {
			t.Errorf("over %v, phase %s", g.GameOver, g.Phase)
		}
	})
	t.Run("epidemic outbreak", func(t *testing.T) {
		g := drawGame(t, cityCards(t, outbreakGame(t), "Lima", "Paris"), "Chicago")
		g.Decks.PlayerDeck = append(g.Decks.PlayerDeck, epidemic)
		g.Outbreaks = game.MaxOutbreaks - 1
		setCubes(t, g, "Chicago", 1)

		res := drawResult(t, g.DrawCards(seeded(1)))

		types := eventJSON(t, res.EndTurnEvents.Events)
		want := []string{
			`{"type":"draw_card","player":0,"card":{"type":"epidemic","name":"Event:Epidemic"}}`,
			`{"type":"increase_infection_rate","new_rate":2}`,
			`{"type":"outbreak","city":"Chicago","color":"blue","outbreak_chain":["Chicago"]}`,
			`{"type":"game_over","reason":"too_many_outbreaks"}`,
			`{"type":"infect_new_city","city":"Chicago","color":"blue","count":3,"epidemic":true}`,
		}
		if !slices.Equal(types, want) {
			t.Errorf("events:\n got %v\nwant %v", types, want)
		}
		if res.EndTurnEvents.Reason != game.TooManyOutbreaks || g.Phase != game.DrawCards || len(g.Decks.PlayerDeck) != 2 {
			t.Errorf("reason %s, phase %s, deck %d", res.EndTurnEvents.Reason, g.Phase, len(g.Decks.PlayerDeck))
		}
	})
}

func TestEndTurnGuards(t *testing.T) {
	steps := map[game.Phase]func(g *game.GameState) game.EndTurnResponse{
		game.DrawCards:    func(g *game.GameState) game.EndTurnResponse { return g.DrawCards(seeded(1)) },
		game.InfectCities: func(g *game.GameState) game.EndTurnResponse { return g.InfectCities() },
	}
	for phase, step := range steps {
		t.Run(string(phase), func(t *testing.T) {
			g := outbreakGame(t)
			g.ActionsRemaining = 0
			resp := step(g)
			want := `{"status":"error","message":"Cannot perform this action unless game phase is ` + string(phase) + `"}`
			if got := string(marshal(t, resp.Body)); got != want || resp.HTTPStatus != http.StatusUnprocessableEntity || resp.Changed {
				t.Errorf("out of phase: %d %s", resp.HTTPStatus, got)
			}

			g.Phase = game.PendingDiscard
			g.PendingHandLimit = &game.PendingHandLimit{PlayerIndex: 0, DiscardCount: 1, ReturnPhase: phase}
			resp = step(g)
			want = `{"status":"error","message":"Must resolve pending hand-limit discard before continuing"}`
			if got := string(marshal(t, resp.Body)); got != want || resp.HTTPStatus != http.StatusUnprocessableEntity || resp.Changed {
				t.Errorf("pending discard: %d %s", resp.HTTPStatus, got)
			}

			g.Phase, g.PendingHandLimit, g.ActionsRemaining = phase, nil, 1
			resp = step(g)
			if got := string(marshal(t, resp.Body)); got != `{"status":"success"}` || resp.HTTPStatus != http.StatusOK || resp.Changed {
				t.Errorf("actions left: %d %s", resp.HTTPStatus, got)
			}
			if g.Phase != phase {
				t.Errorf("phase = %s", g.Phase)
			}
		})
	}
}

// infectGame is outbreakGame at the infect step of the last player, with an
// explicit infection deck (drawn from the end).
func infectGame(t *testing.T, infectionDeck ...string) *game.GameState {
	t.Helper()
	g := outbreakGame(t)
	g.Players[0].Role = game.Scientist
	g.Phase = game.InfectCities
	g.ActionsRemaining = 0
	g.CurrentPlayerIdx = 3
	g.Turn = 5
	g.OperationsExpertMoveUsed = true
	g.Decks.InfectionDeck = cityCards(t, g, infectionDeck...)
	g.Decks.InfectionDiscard = []game.Card{}
	return g
}

// cc-383 point 4: draw the infection rate's cards from the end, then the
// next player (wrapping round) starts a new turn.
func TestInfectCities(t *testing.T) {
	g := infectGame(t, "Lima", "Paris", "Tokyo")
	setCubes(t, g, "Paris", 1)

	res := drawResult(t, g.InfectCities())

	want := `{"game_over":false,"events":[` +
		`{"type":"infect_city","city":"Tokyo","color":"red"},` +
		`{"type":"infect_city","city":"Paris","color":"blue"},` +
		`{"message":"TURN START: Scientist","type":"header"}]}`
	if got := string(marshal(t, res.EndTurnEvents)); got != want {
		t.Errorf("end_turn_events:\n got %s\nwant %s", got, want)
	}
	if cubes(g, "Tokyo") != 1 || cubes(g, "Paris") != 2 || supply(g, game.Blue) != 23 {
		t.Errorf("Tokyo %d, Paris %d, blue supply %d", cubes(g, "Tokyo"), cubes(g, "Paris"), supply(g, game.Blue))
	}
	if !slices.Equal(names(g.Decks.InfectionDeck), []string{"Lima"}) ||
		!slices.Equal(names(g.Decks.InfectionDiscard), []string{"Tokyo", "Paris"}) {
		t.Errorf("deck %v, discard %v", names(g.Decks.InfectionDeck), names(g.Decks.InfectionDiscard))
	}
	if g.CurrentPlayerIdx != 0 || g.ActionsRemaining != 4 || g.Phase != game.PlayerActions || g.Turn != 6 || g.OperationsExpertMoveUsed {
		t.Errorf("player %d, actions %d, phase %s, turn %d, ops %v",
			g.CurrentPlayerIdx, g.ActionsRemaining, g.Phase, g.Turn, g.OperationsExpertMoveUsed)
	}
}

// An empty infection deck infects nothing and is not reshuffled.
func TestInfectCitiesEmptyDeck(t *testing.T) {
	g := infectGame(t)
	res := drawResult(t, g.InfectCities())
	if len(res.EndTurnEvents.Events) != 1 || g.Phase != game.PlayerActions {
		t.Errorf("events %v, phase %s", eventJSON(t, res.EndTurnEvents.Events), g.Phase)
	}
}

// cc-383 point 5: One Quiet Night skips the infections once.
func TestInfectCitiesQuietNight(t *testing.T) {
	g := infectGame(t, "Lima", "Paris")
	quiet := true
	g.QuietNight = &quiet

	res := drawResult(t, g.InfectCities())

	want := `{"game_over":false,"events":[{"type":"quiet_night"},{"message":"TURN START: Scientist","type":"header"}]}`
	if got := string(marshal(t, res.EndTurnEvents)); got != want {
		t.Errorf("end_turn_events = %s", got)
	}
	if g.QuietNight == nil || *g.QuietNight || len(g.Decks.InfectionDeck) != 2 || g.Turn != 6 {
		t.Errorf("quiet night %v, deck %d, turn %d", g.QuietNight, len(g.Decks.InfectionDeck), g.Turn)
	}
}

// cc-383 point 6: a game over stops the infections; the player, phase and
// turn stay, but the game is saved (cc-399).
func TestInfectCitiesGameOver(t *testing.T) {
	g := infectGame(t, "Lima", "Paris")
	g.Disease(game.Blue).InSupply = 0

	res := drawResult(t, g.InfectCities())

	want := `{"game_over":true,"reason":"no_cubes","events":[{"type":"infect_city","city":"Paris","color":"blue"}]}`
	if got := string(marshal(t, res.EndTurnEvents)); got != want {
		t.Errorf("end_turn_events = %s", got)
	}
	if g.CurrentPlayerIdx != 3 || g.Phase != game.InfectCities || g.Turn != 5 || len(g.Decks.InfectionDeck) != 1 {
		t.Errorf("player %d, phase %s, turn %d, deck %d", g.CurrentPlayerIdx, g.Phase, g.Turn, len(g.Decks.InfectionDeck))
	}
}

// pendingGame has player 1 one card over the hand limit, returning to
// infect_cities.
func pendingGame(t *testing.T) *game.GameState {
	t.Helper()
	g := outbreakGame(t)
	g.Players[1].Hand = cityCards(t, g, "Tokyo", "Kyoto", "Seoul", "Beijing", "Shanghai", "Taipei", "Paris", "Lima")
	g.Players[1].SortHand()
	g.Phase = game.PendingDiscard
	g.PendingHandLimit = &game.PendingHandLimit{PlayerIndex: 1, DiscardCount: 1, ReturnPhase: game.InfectCities}
	g.Decks.PlayerDiscard = []game.Card{}
	return g
}

func TestDiscardCards(t *testing.T) {
	t.Run("resolves", func(t *testing.T) {
		g := pendingGame(t)
		wantSuccess(t, g.DiscardCards(1, []string{"Paris"}), "Successfully discarded 1 card(s)")
		if g.Phase != game.InfectCities || g.PendingHandLimit != nil || len(g.Players[1].Hand) != 7 ||
			!slices.Equal(names(g.Decks.PlayerDiscard), []string{"Paris"}) {
			t.Errorf("phase %s, pending %+v, discard %v", g.Phase, g.PendingHandLimit, names(g.Decks.PlayerDiscard))
		}
	})
	t.Run("errors", func(t *testing.T) {
		g := pendingGame(t)
		wantError(t, g.DiscardCards(0, []string{"Paris"}), "Only the player over the hand limit may discard")
		wantError(t, g.DiscardCards(1, []string{"Paris", "Lima"}), "Must discard exactly 1 card(s) to resolve hand limit")
		wantError(t, g.DiscardCards(1, []string{"Rome"}), "Player does not have the Rome card")
		if g.Phase != game.PendingDiscard || len(g.Players[1].Hand) != 8 {
			t.Errorf("phase %s, hand %d", g.Phase, len(g.Players[1].Hand))
		}
		g.PendingHandLimit = nil
		wantError(t, g.DiscardCards(1, []string{"Paris"}), "No hand-limit discard is pending")
	})
	t.Run("repeated names count", func(t *testing.T) {
		g := pendingGame(t)
		g.Players[1].Hand = append(g.Players[1].Hand, cityCards(t, g, "Rome")...)
		g.PendingHandLimit.DiscardCount = 2
		wantError(t, g.DiscardCards(1, []string{"Paris", "Paris"}), "Player does not have the Paris card")
	})
	t.Run("already resolved", func(t *testing.T) {
		g := pendingGame(t)
		g.Players[1].Hand = g.Players[1].Hand[:7]
		wantSuccess(t, g.DiscardCards(1, nil), "Hand limit already resolved")
		if g.Phase != game.InfectCities || g.PendingHandLimit != nil {
			t.Errorf("phase %s, pending %+v", g.Phase, g.PendingHandLimit)
		}
	})
	// A retrieved card leaves the game, as when it is played (cc-437).
	t.Run("retrieved card leaves the game", func(t *testing.T) {
		g := pendingGame(t)
		airlift := game.Card{Type: game.ActionCard, Name: game.Airlift, Retrieved: true}
		g.Players[1].Hand = append(g.Players[1].Hand[:7], airlift)
		wantSuccess(t, g.DiscardCards(1, []string{game.Airlift}), "discarded")
		if len(g.Decks.PlayerDiscard) != 0 || slices.Contains(g.Players[1].Hand, airlift) {
			t.Errorf("discard = %+v, hand = %+v", g.Decks.PlayerDiscard, g.Players[1].Hand)
		}
	})
}
