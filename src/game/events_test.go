package game_test

import (
	"net/http"
	"slices"
	"testing"

	"github.com/mdemare/contract_to_cure/src/game"
)

// Unit tests ported from the event-card tests in test/test_api_endpoints.rb
// and test/test_error_handling.rb. The contract scenarios are replayed in
// events_contract_test.go.

func eventCard(name string) game.Card { return game.Card{Type: game.ActionCard, Name: name} }

func intPtr(i int) *int { return &i }

func play(t *testing.T, g *game.GameState, req game.EventCardRequest) game.EventCardResponse {
	t.Helper()
	return g.PlayEventCard(req)
}

func TestAirlift(t *testing.T) {
	g := testGame(t, game.Scientist, game.Medic)
	g.Players[2].Hand = []game.Card{eventCard(game.Airlift)}
	g.City("London").SetDiseaseCubes(2)
	g.Disease(game.Blue).Cured = true
	g.Disease(game.Blue).InSupply -= 2

	resp := play(t, g, game.EventCardRequest{Card: game.Airlift, PlayerIndex: intPtr(1), City: "London"})
	res := resp.Body.(game.Result)
	wantSuccess(t, res, "Successfully Airlifted medic from Wuhan to London")
	if resp.HTTPStatus != http.StatusOK || !resp.Changed {
		t.Errorf("response = %+v", resp)
	}
	if g.Players[1].Location != "London" {
		t.Errorf("medic in %s", g.Players[1].Location)
	}
	if g.City("London").DiseaseCubes() != 0 || g.Disease(game.Blue).InSupply != game.MaxDiseaseCubesPerColor {
		t.Error("the Medic did not clear the cured color")
	}
	if g.ActionsRemaining != game.StartingActions || res.EndTurn != nil {
		t.Error("an event card must not cost an action")
	}
	if len(g.Players[2].Hand) != 0 || !slices.Equal(names(g.Decks.PlayerDiscard), []string{game.Airlift}) {
		t.Error("the card was not discarded")
	}
}

func TestAirliftErrors(t *testing.T) {
	g := testGame(t)
	wantError(t, g.Airlift(intPtr(0), "London"), "No player has the Airlift card")

	g.Players[0].Hand = []game.Card{eventCard(game.Airlift)}
	wantError(t, g.Airlift(intPtr(0), "Atlantis"), "City 'Atlantis' does not exist")

	// cc-435: no index, or one outside 0..3 (-1 is not the last player).
	wantError(t, g.Airlift(nil, "London"), "No player given for Airlift")
	wantError(t, g.Airlift(intPtr(4), "London"), "Unknown player 4")
	wantError(t, g.Airlift(intPtr(-1), "London"), "Unknown player -1")
	if len(g.Players[0].Hand) != 1 {
		t.Error("a failed Airlift spent the card")
	}
	for _, p := range g.Players {
		if p.Location == "London" {
			t.Errorf("a failed Airlift moved the %s", p.Role)
		}
	}
}

func TestOneQuietNight(t *testing.T) {
	g := testGame(t)
	// Any player's card may be played, in any phase.
	g.Players[3].Hand = []game.Card{eventCard(game.OneQuietNight)}
	g.Phase, g.ActionsRemaining = game.InfectCities, 0

	resp := play(t, g, game.EventCardRequest{Card: game.OneQuietNight})
	wantSuccess(t, resp.Body.(game.Result), "Tonight at least will be quiet")
	if g.QuietNight == nil || !*g.QuietNight {
		t.Error("QuietNight not set")
	}
	if g.Phase != game.InfectCities || g.ActionsRemaining != 0 {
		t.Error("an event card must not change the phase")
	}
	if len(g.Players[3].Hand) != 0 || len(g.Decks.PlayerDiscard) != 1 {
		t.Error("the card was not discarded")
	}
}

func TestGovernmentGrant(t *testing.T) {
	g := testGame(t)
	g.Players[1].Hand = []game.Card{eventCard(game.GovernmentGrant)}

	wantError(t, g.GovernmentGrant(game.StartingCity), "Research station already exists in Wuhan")
	wantError(t, g.GovernmentGrant("Atlantis"), "City 'Atlantis' does not exist")

	wantSuccess(t, g.GovernmentGrant("Tokyo"), "Successfully built a research station in Tokyo using Government Grant")
	if !slices.Equal(g.ResearchStations, []string{game.StartingCity, "Tokyo"}) {
		t.Errorf("stations = %v", g.ResearchStations)
	}
	if !g.City("Tokyo").HasResearchStation {
		t.Error("HasResearchStation was not set (cc-434)")
	}
	wantError(t, g.GovernmentGrant("Paris"), "No player has the Government Grant card")

	g.Players[1].Hand = []game.Card{eventCard(game.GovernmentGrant)}
	g.ResearchStations = []string{"a", "b", "c", "d", "e", "f"}
	wantError(t, g.GovernmentGrant("Paris"), "Maximum number of research stations reached")
}

func TestResilientPopulation(t *testing.T) {
	g := testGame(t)
	g.Players[0].Hand = []game.Card{eventCard(game.ResilientPopulation)}
	g.Decks.InfectionDiscard = cityCards(t, g, "Cairo", "Paris", "Cairo")

	wantError(t, g.ResilientPopulation("Tokyo"), "City 'Tokyo' not found in infection discard pile")
	wantSuccess(t, g.ResilientPopulation("Cairo"), "Successfully removed Cairo from the infection discard pile")
	if got := names(g.Decks.InfectionDiscard); !slices.Equal(got, []string{"Paris", "Cairo"}) {
		t.Errorf("infection discard = %v", got)
	}
}

func TestUnknownEventCard(t *testing.T) {
	g := testGame(t)
	resp := play(t, g, game.EventCardRequest{Card: "NonExistentCard"})
	if resp.HTTPStatus != http.StatusInternalServerError || resp.Changed {
		t.Errorf("response = %+v", resp)
	}
	if got := string(marshal(t, resp.Body)); got != `{"status":"error","message":"Unknown action card: NonExistentCard"}` {
		t.Errorf("body = %s", got)
	}
}

func TestEventCardNotHeldIs422(t *testing.T) {
	g := testGame(t)
	g.Players[0].Hand = cityCards(t, g, "Chicago")
	for _, card := range game.ActionCardNames {
		resp := play(t, g, game.EventCardRequest{Card: card, PlayerIndex: intPtr(0), City: "London"})
		if resp.HTTPStatus != http.StatusUnprocessableEntity || resp.Changed {
			t.Errorf("%s: response = %+v", card, resp)
		}
		wantError(t, resp.Body.(game.Result), "No player has the "+card+" card")
	}
}

func TestRetrievedEventCardLeavesTheGame(t *testing.T) {
	g := testGame(t, game.ContingencyPlanner)
	g.Decks.PlayerDiscard = []game.Card{eventCard(game.OneQuietNight)}
	wantSuccess(t, g.Retrieve(game.OneQuietNight), "retrieved")

	play(t, g, game.EventCardRequest{Card: game.OneQuietNight})
	if len(g.Players[0].Hand) != 0 || len(g.Decks.PlayerDiscard) != 0 {
		t.Errorf("hand %v, discard %v", names(g.Players[0].Hand), names(g.Decks.PlayerDiscard))
	}
}

// TestForecastAcrossRequests ports test_forecast_persists_across_requests.
func TestForecastAcrossRequests(t *testing.T) {
	g := testGame(t)
	g.Players[0].Hand = []game.Card{eventCard(game.Forecast)}
	original := names(g.Decks.InfectionDeck)
	topSix := slices.Clone(original[len(original)-6:])
	slices.Reverse(topSix)

	resp := play(t, g, game.EventCardRequest{Card: game.Forecast})
	view := resp.Body.(game.ForecastView)
	if resp.HTTPStatus != http.StatusOK || !resp.Changed || view.GameState != nil {
		t.Errorf("response = %+v", resp)
	}
	var shown []string
	for _, c := range view.Cards {
		shown = append(shown, c.Name)
		if c.Color != g.City(c.Name).Color {
			t.Errorf("%s shown as %s", c.Name, c.Color)
		}
	}
	if !slices.Equal(shown, topSix) || !slices.Equal(g.ForecastCards, topSix) || !g.ForecastActive {
		t.Errorf("shown %v, forecast cards %v", shown, g.ForecastCards)
	}
	if len(g.Players[0].Hand) != 0 || !slices.Equal(names(g.Decks.PlayerDiscard), []string{game.Forecast}) {
		t.Error("the card was not discarded")
	}

	if rej := g.CheckForecast(); rej == nil || rej.Message != "Cannot perform action while Forecast is active. Please complete the Forecast action first." {
		t.Errorf("CheckForecast = %v", rej)
	}
	g.Players[1].Hand = []game.Card{eventCard(game.OneQuietNight)}
	for _, req := range []game.EventCardRequest{
		{Card: game.OneQuietNight},
		{Card: game.Forecast},
		{Card: game.Forecast, CardOrder: topSix[:5]},
		{Card: game.Forecast, CardOrder: append(slices.Clone(topSix[:5]), topSix[0])},
	} {
		resp := play(t, g, req)
		if _, ok := resp.Body.(*game.Rejection); !ok || resp.HTTPStatus != http.StatusOK || resp.Changed {
			t.Errorf("%+v: response = %+v", req, resp)
		}
	}
	if !g.ForecastActive || !slices.Equal(names(g.Decks.InfectionDeck), original) {
		t.Fatal("a rejected request changed the game")
	}

	reordered := slices.Clone(topSix)
	slices.Reverse(reordered)
	resp = play(t, g, game.EventCardRequest{Card: game.Forecast, CardOrder: reordered})
	if resp.Body != any(g) || resp.HTTPStatus != http.StatusOK || !resp.Changed {
		t.Errorf("response = %+v, want the bare game state", resp)
	}
	if g.ForecastActive || g.ForecastCards != nil || g.CheckForecast() != nil {
		t.Error("Forecast still active")
	}
	want := append(slices.Clone(original[:len(original)-6]), topSix...)
	if got := names(g.Decks.InfectionDeck); !slices.Equal(got, want) {
		t.Errorf("deck = %v\nwant %v", got, want)
	}
	if last := g.Decks.InfectionDeck[len(g.Decks.InfectionDeck)-1]; last.Name != reordered[0] {
		t.Errorf("next card %s, want the first chosen %s", last.Name, reordered[0])
	}
	for _, c := range g.Decks.InfectionDeck {
		if c.Type != game.CityCard {
			t.Fatalf("%s is a %s card", c.Name, c.Type)
		}
	}
	wantSuccess(t, g.Pass(), "Passed")
}

func TestForecastWithFewCards(t *testing.T) {
	g := testGame(t)
	g.Players[0].Hand = []game.Card{eventCard(game.Forecast)}
	g.Decks.InfectionDeck = cityCards(t, g, "Paris", "Cairo")

	view, failed := g.Forecast()
	if failed != nil {
		t.Fatal(*failed)
	}
	if len(view.Cards) != 2 || !slices.Equal(g.ForecastCards, []string{"Cairo", "Paris"}) {
		t.Errorf("cards %v, forecast %v", view.Cards, g.ForecastCards)
	}
	if rej := g.ApplyForecast([]string{"Paris", "Cairo"}); rej != nil {
		t.Fatal(rej)
	}
	if got := names(g.Decks.InfectionDeck); !slices.Equal(got, []string{"Cairo", "Paris"}) {
		t.Errorf("deck = %v", got)
	}

	g.Players[0].Hand = []game.Card{eventCard(game.Forecast)}
	g.Decks.InfectionDeck = nil
	if view, _ := g.Forecast(); view.Cards == nil || string(marshal(t, view.Cards)) != "[]" {
		t.Errorf("cards = %#v, want []", view.Cards)
	}
}

func TestApplyForecastChecksThePermutation(t *testing.T) {
	g := testGame(t)
	if rej := g.ApplyForecast([]string{"Paris"}); rej == nil || rej.Message != "Forecast is not active" {
		t.Errorf("rejection = %v", rej)
	}
	g.ForecastActive = true
	g.ForecastCards = []string{"Paris", "Paris", "Cairo"}
	for _, order := range [][]string{{"Paris", "Cairo", "Cairo"}, {"Paris", "Cairo"}, nil} {
		if rej := g.ApplyForecast(order); rej == nil || rej.Message != "Invalid card order provided" {
			t.Errorf("%v: rejection = %v", order, rej)
		}
	}
	if rej := g.ApplyForecast([]string{"Cairo", "Paris", "Paris"}); rej != nil {
		t.Errorf("a permutation with repeats was rejected: %v", rej)
	}
}

// TestEventCardResolvesPendingDiscard ports
// test_action_card_can_resolve_pending_hand_limit.
func TestEventCardResolvesPendingDiscard(t *testing.T) {
	overLimit := func(t *testing.T, extra ...game.Card) *game.GameState {
		g := testGame(t)
		g.Players[0].Hand = append(cityCards(t, g, "Chicago", "Montreal", "Washington", "New York", "London",
			"Paris", "Barcelona"), extra...)
		g.PendingHandLimit = &game.PendingHandLimit{PlayerIndex: 0, DiscardCount: len(extra), ReturnPhase: game.InfectCities}
		g.Phase = game.PendingDiscard
		return g
	}

	t.Run("back to the limit", func(t *testing.T) {
		g := overLimit(t, eventCard(game.OneQuietNight))
		wantSuccess(t, play(t, g, game.EventCardRequest{Card: game.OneQuietNight}).Body.(game.Result), "quiet")
		if g.Phase != game.InfectCities || g.PendingHandLimit != nil || len(g.Players[0].Hand) != 7 {
			t.Errorf("phase %s, pending %v", g.Phase, g.PendingHandLimit)
		}
	})
	t.Run("still over", func(t *testing.T) {
		g := overLimit(t, eventCard(game.OneQuietNight), eventCard(game.Airlift))
		g.PendingHandLimit.DiscardCount = 5
		play(t, g, game.EventCardRequest{Card: game.OneQuietNight})
		if g.Phase != game.PendingDiscard || g.PendingHandLimit == nil || g.PendingHandLimit.DiscardCount != 1 {
			t.Errorf("phase %s, pending %+v", g.Phase, g.PendingHandLimit)
		}
	})
	t.Run("failed card", func(t *testing.T) {
		g := overLimit(t, eventCard(game.Airlift))
		g.Players[0].Hand = g.Players[0].Hand[1:]
		play(t, g, game.EventCardRequest{Card: game.Airlift, PlayerIndex: intPtr(0), City: "Atlantis"})
		if g.Phase != game.PendingDiscard || g.PendingHandLimit == nil {
			t.Error("a failed card resolved the discard")
		}
	})
	t.Run("forecast shows the game", func(t *testing.T) {
		g := overLimit(t, eventCard(game.Forecast))
		view := play(t, g, game.EventCardRequest{Card: game.Forecast}).Body.(game.ForecastView)
		if view.GameState != g || g.Phase != game.InfectCities {
			t.Errorf("game_state %v, phase %s", view.GameState != nil, g.Phase)
		}
	})
}
