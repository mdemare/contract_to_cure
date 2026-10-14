package game_test

import (
	"encoding/json"
	"slices"
	"strings"
	"testing"

	"github.com/mdemare/contract_to_cure/src/game"
)

// Unit tests ported from the rule sections of test/test_api_endpoints.rb and
// test/test_game_state.rb. The contract scenarios are replayed in
// actions_contract_test.go.

// testGame deals a 4-player game, then gives the players these roles, puts
// them in Wuhan with empty hands, and clears every cube from the board.
func testGame(t *testing.T, roles ...game.Role) *game.GameState {
	t.Helper()
	g := newGame(t, 4, game.Heroic, 1)
	for i := range g.Players {
		p := &g.Players[i]
		if i < len(roles) {
			p.Role = roles[i]
		}
		p.Location = "Wuhan"
		p.Hand = nil
	}
	for i := range g.Cities {
		g.Cities[i].SetDiseaseCubes(0)
	}
	for i := range g.DiseaseCubes {
		g.DiseaseCubes[i].InSupply = game.MaxDiseaseCubesPerColor
	}
	return g
}

func cityCards(t *testing.T, g *game.GameState, names ...string) []game.Card {
	t.Helper()
	var cards []game.Card
	for _, n := range names {
		c := g.City(n)
		if c == nil {
			t.Fatalf("unknown city %s", n)
		}
		cards = append(cards, game.Card{Type: game.CityCard, Name: n, Color: c.Color})
	}
	return cards
}

func names(cards []game.Card) []string {
	var out []string
	for _, c := range cards {
		out = append(out, c.Name)
	}
	return out
}

func wantSuccess(t *testing.T, res game.Result, message string) {
	t.Helper()
	if !res.Success || res.Status != game.StatusSuccess || res.GameState == nil {
		t.Fatalf("result = %+v, want success", res)
	}
	if !strings.Contains(res.Message, message) {
		t.Errorf("message = %q, want it to contain %q", res.Message, message)
	}
}

func wantError(t *testing.T, res game.Result, message string) {
	t.Helper()
	want := game.Result{Success: false, Status: game.StatusError, Message: message}
	if !sameJSON(res, want) {
		t.Fatalf("result = %+v, want %+v", res, want)
	}
}

func sameJSON(a, b game.Result) bool {
	ja, _ := json.Marshal(a)
	jb, _ := json.Marshal(b)
	return string(ja) == string(jb)
}

func TestMoveDriveSpendsAnAction(t *testing.T) {
	g := testGame(t, game.Scientist, game.Medic)
	to := g.City("Wuhan").Connections[0]
	res := g.Move(0, to, "")
	wantSuccess(t, res, "Successfully moved scientist from Wuhan to "+to+" via drive / ferry")
	if g.Players[0].Location != to || g.ActionsRemaining != 3 || *res.EndTurn {
		t.Errorf("location %s, actions %d, end_turn %v", g.Players[0].Location, g.ActionsRemaining, *res.EndTurn)
	}
}

func TestMoveAnotherPawn(t *testing.T) {
	t.Run("rejected without the Dispatcher", func(t *testing.T) {
		g := testGame(t, game.Medic, game.Scientist)
		g.Players[0].Location, g.Players[1].Location = "London", "London"
		wantError(t, g.Move(1, "Paris", ""), "Current player cannot move another player's pawn unless they are the Dispatcher")
		if g.Players[1].Location != "London" || g.ActionsRemaining != 4 {
			t.Error("the game changed")
		}
	})
	t.Run("Dispatcher drives another pawn", func(t *testing.T) {
		g := testGame(t, game.Dispatcher, game.Medic)
		g.Players[1].Location = "London"
		wantSuccess(t, g.Move(1, "Paris", ""), "via drive / ferry")
		if g.Players[1].Location != "Paris" || g.Players[0].Location != "Wuhan" {
			t.Error("wrong pawn moved")
		}
	})
	t.Run("Dispatcher moves a pawn to another pawn", func(t *testing.T) {
		g := testGame(t, game.Dispatcher, game.Medic, game.Scientist)
		g.Players[1].Location, g.Players[2].Location = "London", "Tokyo"
		wantSuccess(t, g.Move(1, "Tokyo", ""), "via dispatcher special move")
		if g.Players[1].Location != "Tokyo" {
			t.Error("pawn did not move")
		}
	})
	t.Run("Dispatcher pays for another pawn's flight", func(t *testing.T) {
		g := testGame(t, game.Dispatcher, game.Medic)
		g.Players[0].Hand = cityCards(t, g, "Lima")
		g.Players[1].Location = "London"
		wantSuccess(t, g.Move(1, "Lima", ""), "Successfully moved medic from London to Lima via direct flight")
		if g.Players[1].Location != "Lima" || len(g.Players[0].Hand) != 0 || len(g.Players[1].Hand) != 0 {
			t.Error("the Dispatcher's card was not spent")
		}
		if names(g.Decks.PlayerDiscard)[len(g.Decks.PlayerDiscard)-1] != "Lima" {
			t.Error("Lima was not discarded")
		}
	})
	t.Run("unknown player", func(t *testing.T) {
		g := testGame(t, game.Dispatcher)
		wantError(t, g.Move(4, "Paris", ""), "Unknown player 4")
		wantError(t, g.Move(-1, "Paris", ""), "Unknown player -1")
	})
}

func TestMoveFlights(t *testing.T) {
	tests := []struct {
		name, from, to, card string
		hand                 []string
		station              string
		wantType, wantCard   string // wantCard is the discarded card
	}{
		{name: "direct", from: "London", to: "Lima", hand: []string{"Lima"}, wantType: "direct flight", wantCard: "Lima"},
		{name: "charter", from: "London", to: "Lima", hand: []string{"London"}, wantType: "charter flight", wantCard: "London"},
		{name: "choice direct", from: "London", to: "Lima", card: "Lima", hand: []string{"London", "Lima"}, wantType: "direct flight", wantCard: "Lima"},
		{name: "choice charter", from: "London", to: "Lima", card: "London", hand: []string{"London", "Lima"}, wantType: "charter flight", wantCard: "London"},
		{name: "shuttle", from: "Wuhan", to: "Lima", station: "Lima", hand: []string{"Lima"}, wantType: "shuttle flight"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			g := testGame(t, game.Scientist)
			g.Players[0].Location = tt.from
			g.Players[0].Hand = cityCards(t, g, tt.hand...)
			if tt.station != "" {
				g.ResearchStations = append(g.ResearchStations, tt.station)
			}
			discarded := len(g.Decks.PlayerDiscard)
			wantSuccess(t, g.Move(0, tt.to, tt.card), "via "+tt.wantType)
			newDiscards := names(g.Decks.PlayerDiscard[discarded:])
			if tt.wantCard == "" && len(newDiscards) != 0 || tt.wantCard != "" && !slices.Equal(newDiscards, []string{tt.wantCard}) {
				t.Errorf("discarded %v, want %q", newDiscards, tt.wantCard)
			}
		})
	}

	t.Run("flight choice needs a card", func(t *testing.T) {
		g := testGame(t, game.Scientist)
		g.Players[0].Location = "London"
		g.Players[0].Hand = cityCards(t, g, "London", "Lima")
		res := g.Move(0, "Lima", "")
		got, _ := json.Marshal(res)
		want := `{"success":false,"status":"card_required","message":"You can use either a direct flight (discard destination card) or a charter flight (discard current location card)","movement_type":"flight_choice","options":["direct_flight","charter_flight"]}`
		if string(got) != want {
			t.Errorf("got %s", got)
		}
		wantError(t, g.Move(0, "Lima", "Paris"), "Selected card does not match either the current location or destination")
		if g.Players[0].Location != "London" || len(g.Players[0].Hand) != 2 || g.ActionsRemaining != 4 {
			t.Error("the game changed")
		}
	})
	t.Run("no way to get there", func(t *testing.T) {
		g := testGame(t, game.Scientist)
		g.Players[0].Location = "London"
		wantError(t, g.Move(0, "Lima", ""), "Cannot move player to destination Lima from London")
		wantError(t, g.Move(0, "Atlantis", ""), "Unknown destination Atlantis")
	})
}

// An unknown destination is rejected before any move type is tried, so no
// card is discarded and no action spent (test_error_handling.rb).
func TestMoveUnknownDestinationIsCheckedFirst(t *testing.T) {
	const nowhere = "NonExistentCity"
	tests := []struct {
		name   string
		player int
		card   string
		setup  func(g *game.GameState)
	}{
		{name: "operations expert at a station", setup: func(g *game.GameState) {
			g.Players[0].Role = game.OperationsExpert
			g.ResearchStations = append(g.ResearchStations, "Wuhan")
			g.Players[0].Hand = cityCards(t, g, "London")
		}},
		{name: "direct flight", setup: func(g *game.GameState) {
			g.Players[0].Location = "London"
			g.Players[0].Hand = []game.Card{{Type: game.CityCard, Name: nowhere, Color: game.Blue}}
		}},
		{name: "charter flight", card: "London", setup: func(g *game.GameState) {
			g.Players[0].Location = "London"
			g.Players[0].Hand = cityCards(t, g, "London")
		}},
		{name: "shuttle flight", setup: func(g *game.GameState) {
			g.ResearchStations = append(g.ResearchStations, "Wuhan", nowhere)
		}},
		{name: "dispatcher gather", player: 1, setup: func(g *game.GameState) {
			g.Players[0].Role = game.Dispatcher
			g.Players[1].Location = "London"
			g.Players[2].Location = nowhere
		}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			g := testGame(t, game.Scientist, game.Medic, game.Researcher, game.QuarantineSpecialist)
			tt.setup(g)
			location := g.Players[tt.player].Location
			hand := names(g.Players[0].Hand)
			wantError(t, g.Move(tt.player, nowhere, tt.card), "Unknown destination "+nowhere)
			if g.Players[tt.player].Location != location || !slices.Equal(names(g.Players[0].Hand), hand) || g.ActionsRemaining != 4 {
				t.Error("the game changed")
			}
		})
	}
}

func TestMoveMedicClearsCuredColor(t *testing.T) {
	g := testGame(t, game.Medic)
	g.Disease(game.Blue).Cured = true
	g.City("London").SetDiseaseCubes(2)
	g.Disease(game.Blue).InSupply = 22
	g.Players[0].Location = "Paris"
	wantSuccess(t, g.Move(0, "London", ""), "drive / ferry")
	if g.City("London").DiseaseCubes() != 0 || g.Disease(game.Blue).InSupply != 24 {
		t.Error("the Medic did not clear London")
	}
}

func TestOperationsExpertMove(t *testing.T) {
	expert := func(t *testing.T, location string, hand ...game.Card) *game.GameState {
		g := testGame(t, game.OperationsExpert)
		g.Players[0].Location = location
		g.Players[0].Hand = hand
		return g
	}

	t.Run("discards the chosen card", func(t *testing.T) {
		g := expert(t, "Wuhan", cityCards(t, testGame(t), "London", "Paris")...)
		wantSuccess(t, g.Move(0, "Lima", "London"), "via operation researcher special move")
		if g.Players[0].Location != "Lima" || !slices.Equal(names(g.Players[0].Hand), []string{"Paris"}) || !g.OperationsExpertMoveUsed {
			t.Errorf("location %s, hand %v, used %v", g.Players[0].Location, names(g.Players[0].Hand), g.OperationsExpertMoveUsed)
		}
	})
	t.Run("asks for a card", func(t *testing.T) {
		g := expert(t, "Wuhan", cityCards(t, testGame(t), "London", "Paris")...)
		for _, card := range []string{"", "Tokyo"} {
			res := g.Move(0, "Lima", card)
			if res.Success || res.Status != game.StatusCardRequired || res.MovementType != "operations_expert_special" ||
				res.Message != "Operations Expert requires a city card to move from a research station to any city" {
				t.Errorf("card %q: %+v", card, res)
			}
		}
		if g.ActionsRemaining != 4 || g.OperationsExpertMoveUsed {
			t.Error("the game changed")
		}
	})
	t.Run("not at a station", func(t *testing.T) {
		g := expert(t, "London", cityCards(t, testGame(t), "Paris")...)
		wantError(t, g.Move(0, "Lima", "Paris"), "Cannot move player to destination Lima from London")
	})
	t.Run("without city cards", func(t *testing.T) {
		g := expert(t, "Wuhan", game.Card{Type: game.ActionCard, Name: "Airlift"})
		wantError(t, g.Move(0, "Lima", ""), "Cannot move player to destination Lima from Wuhan")
	})
	t.Run("other roles", func(t *testing.T) {
		g := expert(t, "Wuhan", cityCards(t, testGame(t), "London")...)
		g.Players[0].Role = game.Medic
		wantError(t, g.Move(0, "Lima", "London"), "Cannot move player to destination Lima from Wuhan")
	})
	t.Run("drive keeps the card", func(t *testing.T) {
		g := expert(t, "London", cityCards(t, testGame(t), "Paris")...)
		wantSuccess(t, g.Move(0, "Paris", ""), "via drive / ferry")
		if !slices.Equal(names(g.Players[0].Hand), []string{"Paris"}) {
			t.Error("the Paris card was spent")
		}
	})

	// A spent special move must not block direct, charter, or flight-choice requests.
	tests := []struct {
		hand             []string
		card, want       string
		discarded        string // empty when the move fails
		wantCardRequired bool
	}{
		{hand: []string{"Lima", "London"}, want: "direct flight", discarded: "Lima"},
		{hand: []string{"Wuhan", "London"}, want: "charter flight", discarded: "Wuhan"},
		{hand: []string{"Wuhan", "Lima", "London"}, card: "Lima", want: "direct flight", discarded: "Lima"},
		{hand: []string{"Wuhan", "Lima", "London"}, card: "Wuhan", want: "charter flight", discarded: "Wuhan"},
		{hand: []string{"Wuhan", "Lima", "London"}, wantCardRequired: true},
		{hand: []string{"London"}, card: "London"},
	}
	for _, tt := range tests {
		t.Run("move used "+strings.Join(tt.hand, ",")+" "+tt.card, func(t *testing.T) {
			g := testGame(t, game.OperationsExpert)
			hand := make([]game.Card, len(tt.hand))
			for i, n := range tt.hand {
				hand[i] = game.Card{Type: game.CityCard, Name: n, Color: game.Blue}
			}
			g.Players[0].Hand = hand
			g.OperationsExpertMoveUsed = true

			res := g.Move(0, "Lima", tt.card)
			if !g.OperationsExpertMoveUsed {
				t.Error("move-used flag was cleared")
			}
			if tt.discarded != "" {
				wantSuccess(t, res, tt.want)
				rest := slices.DeleteFunc(slices.Clone(tt.hand), func(n string) bool { return n == tt.discarded })
				if g.Players[0].Location != "Lima" || !slices.Equal(names(g.Players[0].Hand), rest) || g.ActionsRemaining != 3 {
					t.Errorf("location %s, hand %v, actions %d", g.Players[0].Location, names(g.Players[0].Hand), g.ActionsRemaining)
				}
				return
			}
			if tt.wantCardRequired {
				if res.Status != game.StatusCardRequired || res.MovementType != "flight_choice" {
					t.Errorf("result = %+v", res)
				}
			} else if res.Status != game.StatusError {
				t.Errorf("result = %+v", res)
			}
			if g.Players[0].Location != "Wuhan" || !slices.Equal(names(g.Players[0].Hand), tt.hand) || g.ActionsRemaining != 4 {
				t.Error("the game changed")
			}
		})
	}
}

func TestGuards(t *testing.T) {
	g := testGame(t, game.Scientist)
	if g.CheckAction() != nil || g.CheckGameOver() != nil {
		t.Fatal("a fresh game is guarded")
	}
	for _, phase := range []game.Phase{game.DrawCards, game.InfectCities, game.PendingDiscard} {
		g.Phase = phase
		if got, _ := json.Marshal(g.CheckAction()); string(got) != `{"status":"error","message":"No more actions allowed"}` {
			t.Errorf("%s: %s", phase, got)
		}
	}
	// cc-404: a finished game keeps its phase, so only CheckGameOver stops it.
	g.Phase, g.GameOver, g.GameOverReason = game.PlayerActions, true, game.Victory
	if g.CheckAction() != nil {
		t.Error("CheckAction looks at game over")
	}
	if got, _ := json.Marshal(g.CheckGameOver()); string(got) != `{"status":"error","message":"The game is over"}` {
		t.Errorf("game over: %s", got)
	}
}

func TestLastActionEndsTheTurn(t *testing.T) {
	g := testGame(t, game.Scientist)
	g.ActionsRemaining = 1
	res := g.Move(0, g.City("Wuhan").Connections[0], "")
	if !*res.EndTurn || g.Phase != game.DrawCards || g.ActionsRemaining != 0 {
		t.Errorf("end_turn %v, phase %s, actions %d", *res.EndTurn, g.Phase, g.ActionsRemaining)
	}
}

func TestPass(t *testing.T) {
	g := testGame(t, game.Scientist)
	g.ActionsRemaining = 3
	res := g.Pass()
	wantSuccess(t, res, "Passed for the rest of the turn")
	if !*res.EndTurn || g.Phase != game.DrawCards || g.ActionsRemaining != 0 {
		t.Errorf("end_turn %v, phase %s, actions %d", *res.EndTurn, g.Phase, g.ActionsRemaining)
	}
}

func TestTreatDisease(t *testing.T) {
	tests := []struct {
		name        string
		role        game.Role
		cured       bool
		wantRemoved int
	}{
		{"one cube", game.Scientist, false, 1},
		{"Medic treats all", game.Medic, false, 3},
		{"cured color treats all", game.Scientist, true, 3},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			g := testGame(t, tt.role)
			g.City("Wuhan").SetDiseaseCubes(3)
			g.Disease(game.Red).InSupply = 21
			g.Disease(game.Red).Cured = tt.cured
			res := g.TreatDisease()
			wantSuccess(t, res, "Treated red disease in Wuhan")
			if res.CubesRemoved != tt.wantRemoved || g.City("Wuhan").DiseaseCubes() != 3-tt.wantRemoved ||
				g.Disease(game.Red).InSupply != 21+tt.wantRemoved {
				t.Errorf("removed %d, left %d, supply %d", res.CubesRemoved, g.City("Wuhan").DiseaseCubes(), g.Disease(game.Red).InSupply)
			}
		})
	}

	t.Run("no cubes", func(t *testing.T) {
		g := testGame(t, game.Medic)
		res := g.TreatDisease()
		if res.Success || res.Status != game.StatusActionUnavailable || res.GameState != g ||
			res.Message != "No red disease cubes to treat in Wuhan" || res.EndTurn != nil {
			t.Errorf("result = %+v", res)
		}
		if g.ActionsRemaining != 4 {
			t.Error("an action was spent")
		}
	})
}

func TestCureDisease(t *testing.T) {
	blue := []string{"Chicago", "Montreal", "Washington", "New York", "London"}

	t.Run("five cards", func(t *testing.T) {
		g := testGame(t, game.Medic)
		g.Players[0].Location = "Chicago"
		g.ResearchStations = append(g.ResearchStations, "Chicago")
		g.Players[0].Hand = cityCards(t, g, blue...)
		wantSuccess(t, g.CureDisease(game.Blue, blue), "Successfully discovered a cure for the blue disease!")
		if !g.Disease(game.Blue).Cured || len(g.Players[0].Hand) != 0 || g.GameOver {
			t.Error("cure not discovered")
		}
	})
	t.Run("the Scientist needs four", func(t *testing.T) {
		g := testGame(t, game.Scientist)
		g.Players[0].Hand = cityCards(t, g, blue...)
		wantError(t, g.CureDisease(game.Blue, blue), "Need 4 cards of the same color to discover a cure")
		wantSuccess(t, g.CureDisease(game.Blue, blue[:4]), "blue")
		if !slices.Equal(names(g.Players[0].Hand), []string{"London"}) {
			t.Errorf("hand = %v", names(g.Players[0].Hand))
		}
	})
	t.Run("rule checks", func(t *testing.T) {
		g := testGame(t, game.Medic)
		g.Players[0].Hand = cityCards(t, g, append(blue, "Lima")...)
		wantError(t, g.CureDisease(game.Blue, blue[:4]), "Need 5 cards of the same color to discover a cure")
		wantError(t, g.CureDisease(game.Blue, append(blue[:4:4], "Lima")), "All selected cards must be blue city cards")
		wantError(t, g.CureDisease(game.Blue, append(blue[:4:4], "Paris")), "All selected cards must be blue city cards")
		g.Disease(game.Blue).Cured = true
		wantError(t, g.CureDisease(game.Blue, blue), "The blue disease is already cured")
		g.Players[0].Location = "Lima"
		wantError(t, g.CureDisease(game.Blue, blue), "Player must be at a research station to discover a cure")
		if len(g.Players[0].Hand) != 6 || g.ActionsRemaining != 4 {
			t.Error("the game changed")
		}
	})
	t.Run("Medics clear the cured color", func(t *testing.T) {
		g := testGame(t, game.Scientist, game.Medic)
		g.Players[0].Hand = cityCards(t, g, blue[:4]...)
		g.Players[1].Location = "London"
		g.City("London").SetDiseaseCubes(2)
		g.Disease(game.Blue).InSupply = 22
		wantSuccess(t, g.CureDisease(game.Blue, blue[:4]), "blue")
		if g.City("London").DiseaseCubes() != 0 || !g.Disease(game.Blue).Eradicated() {
			t.Error("the Medic did not clear London")
		}
	})
	t.Run("the fourth cure wins", func(t *testing.T) {
		g := testGame(t, game.Scientist)
		for _, c := range []game.Color{game.Yellow, game.Black, game.Red} {
			g.Disease(c).Cured = true
		}
		g.Players[0].Hand = cityCards(t, g, blue[:4]...)
		wantSuccess(t, g.CureDisease(game.Blue, blue[:4]), "blue")
		if !g.GameOver || g.GameOverReason != game.Victory || g.Phase != game.PlayerActions {
			t.Errorf("game over %v, reason %s, phase %s", g.GameOver, g.GameOverReason, g.Phase)
		}
	})
	// One card cannot be named four times (cc-432).
	t.Run("repeated names", func(t *testing.T) {
		g := testGame(t, game.Scientist)
		g.Players[0].Hand = cityCards(t, g, "Chicago", "Lima")
		wantError(t, g.CureDisease(game.Blue, []string{"Chicago", "Chicago", "Chicago", "Chicago"}), "Selected cards must be different cards from your hand")
		if !slices.Equal(names(g.Players[0].Hand), []string{"Chicago", "Lima"}) || g.Disease(game.Blue).Cured || g.ActionsRemaining != 4 {
			t.Errorf("the game changed: hand = %v", names(g.Players[0].Hand))
		}
	})
}

func TestShareKnowledge(t *testing.T) {
	t.Run("gives the city card", func(t *testing.T) {
		g := testGame(t, game.Scientist, game.Medic)
		g.Players[0].Location, g.Players[1].Location = "Chicago", "Chicago"
		g.Players[0].Hand = cityCards(t, g, "Chicago")
		res := g.ShareKnowledge(0, 1, "Chicago")
		wantSuccess(t, res, "Successfully shared Chicago card from scientist to medic")
		if len(g.Players[0].Hand) != 0 || !slices.Equal(names(g.Players[1].Hand), []string{"Chicago"}) || res.ExceededHandLimit != nil {
			t.Error("card not moved")
		}
	})
	t.Run("the Researcher gives any card", func(t *testing.T) {
		g := testGame(t, game.Medic, game.Researcher)
		g.Players[1].Hand = cityCards(t, g, "Lima")
		res := g.ShareKnowledge(1, 0, "Lima")
		wantSuccess(t, res, "from researcher to medic")
	})
	t.Run("rule checks", func(t *testing.T) {
		g := testGame(t, game.Scientist, game.Medic, game.Dispatcher)
		g.Players[0].Hand = cityCards(t, g, "Lima")
		g.Players[2].Location = "Lima"
		wantError(t, g.ShareKnowledge(0, 2, "Lima"), "Both players must be in the same city to share knowledge")
		wantError(t, g.ShareKnowledge(0, 1, "Paris"), "Player does not have the Paris city card")
		wantError(t, g.ShareKnowledge(0, 1, "Lima"), "Card must match current location or player must be a researcher")
		if g.ActionsRemaining != 4 || len(g.Players[0].Hand) != 1 {
			t.Error("the game changed")
		}
	})
	// cc-433: an index outside 0..players-1 is rejected; -1 is not the last
	// player.
	t.Run("unknown player", func(t *testing.T) {
		g := testGame(t, game.Scientist, game.Medic, game.Dispatcher, game.Researcher)
		g.Players[0].Hand = cityCards(t, g, "Wuhan")
		g.Players[3].Hand = cityCards(t, g, "Wuhan")
		wantError(t, g.ShareKnowledge(0, 4, "Wuhan"), "Unknown player 4")
		wantError(t, g.ShareKnowledge(4, 0, "Wuhan"), "Unknown player 4")
		wantError(t, g.ShareKnowledge(0, -1, "Wuhan"), "Unknown player -1")
		wantError(t, g.ShareKnowledge(-1, 0, "Wuhan"), "Unknown player -1")
		if g.ActionsRemaining != 4 || len(g.Players[0].Hand) != 1 || len(g.Players[3].Hand) != 1 {
			t.Error("the game changed")
		}
	})
	// cc-441: the current player gives or receives, and nobody shares with
	// themselves.
	t.Run("current player and two players", func(t *testing.T) {
		g := testGame(t, game.Scientist, game.Medic, game.Dispatcher)
		for i := range g.Players {
			g.Players[i].Location = "Chicago"
		}
		g.Players[0].Hand = cityCards(t, g, "Chicago")
		g.Players[1].Hand = cityCards(t, g, "Chicago")
		wantError(t, g.ShareKnowledge(1, 2, "Chicago"), "The current player must give or receive the card")
		wantError(t, g.ShareKnowledge(0, 0, "Chicago"), "A player cannot share knowledge with themselves")
		if g.ActionsRemaining != 4 || len(g.Players[0].Hand) != 1 || len(g.Players[1].Hand) != 1 || len(g.Players[2].Hand) != 0 {
			t.Error("the game changed")
		}
	})
}

// Every way over the hand limit goes through one pending-discard helper.
func TestHandLimitAfterAction(t *testing.T) {
	seven := []string{"Montreal", "Washington", "New York", "London", "Paris", "Barcelona", "Stockholm"}
	share := func(t *testing.T, actions int) (*game.GameState, game.Result) {
		g := testGame(t, game.Scientist, game.Medic)
		g.ActionsRemaining = actions
		g.Players[0].Location, g.Players[1].Location = "Chicago", "Chicago"
		g.Players[0].Hand = cityCards(t, g, "Chicago")
		g.Players[1].Hand = cityCards(t, g, seven...)
		return g, g.ShareKnowledge(0, 1, "Chicago")
	}
	retrieve := func(t *testing.T, actions int) (*game.GameState, game.Result) {
		g := testGame(t, game.ContingencyPlanner)
		g.ActionsRemaining = actions
		g.Players[0].Hand = cityCards(t, g, seven...)
		g.Decks.PlayerDiscard = []game.Card{{Type: game.ActionCard, Name: "Airlift"}}
		return g, g.Retrieve("Airlift")
	}
	tests := []struct {
		name    string
		act     func(*testing.T, int) (*game.GameState, game.Result)
		actions int
		want    game.PendingHandLimit
	}{
		{"share", share, 4, game.PendingHandLimit{PlayerIndex: 1, DiscardCount: 1, ReturnPhase: game.PlayerActions}},
		{"share with the last action", share, 1, game.PendingHandLimit{PlayerIndex: 1, DiscardCount: 1, ReturnPhase: game.DrawCards}},
		{"retrieve", retrieve, 4, game.PendingHandLimit{PlayerIndex: 0, DiscardCount: 1, ReturnPhase: game.PlayerActions}},
		{"retrieve with the last action", retrieve, 1, game.PendingHandLimit{PlayerIndex: 0, DiscardCount: 1, ReturnPhase: game.DrawCards}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			g, res := tt.act(t, tt.actions)
			if !res.Success || res.ExceededHandLimit == nil || *res.ExceededHandLimit != tt.want {
				t.Fatalf("exceeded_hand_limit = %+v, want %+v", res.ExceededHandLimit, tt.want)
			}
			if g.Phase != game.PendingDiscard || *g.PendingHandLimit != tt.want || g.CheckAction() == nil {
				t.Errorf("phase %s, pending %+v", g.Phase, g.PendingHandLimit)
			}
			got, _ := json.Marshal(res)
			want, _ := json.Marshal(tt.want)
			if !strings.HasSuffix(string(got), `"exceeded_hand_limit":`+string(want)+"}") {
				t.Errorf("json = %s", got)
			}
		})
	}
}

func TestBuildResearchStation(t *testing.T) {
	t.Run("with the city card", func(t *testing.T) {
		g := testGame(t, game.Scientist)
		g.Players[0].Location = "Chicago"
		g.Players[0].Hand = cityCards(t, g, "Chicago")
		wantSuccess(t, g.BuildResearchStation(), "Successfully built a research station in Chicago")
		if !slices.Equal(g.ResearchStations, []string{"Wuhan", "Chicago"}) || len(g.Players[0].Hand) != 0 {
			t.Errorf("stations %v, hand %v", g.ResearchStations, names(g.Players[0].Hand))
		}
		if !g.City("Chicago").HasResearchStation {
			t.Error("HasResearchStation was not set (cc-434)")
		}
	})
	t.Run("the Operations Expert needs no card", func(t *testing.T) {
		g := testGame(t, game.OperationsExpert)
		g.Players[0].Location = "Paris"
		wantSuccess(t, g.BuildResearchStation(), "Successfully built a research station in Paris (Operations Expert ability)")
	})
	t.Run("rule checks", func(t *testing.T) {
		g := testGame(t, game.OperationsExpert)
		wantError(t, g.BuildResearchStation(), "Research station already exists in Wuhan")
		g.Players[0].Location = "Paris"
		g.ResearchStations = []string{"Wuhan", "Lima", "London", "Tokyo", "Cairo", "Chicago"}
		wantError(t, g.BuildResearchStation(), "Maximum number of research stations reached")
		g.ResearchStations = g.ResearchStations[:5]
		g.Players[0].Role = game.Scientist
		wantError(t, g.BuildResearchStation(), "Player does not have the Paris city card")
		if g.ActionsRemaining != 4 {
			t.Error("an action was spent")
		}
	})
}

func TestRetrieve(t *testing.T) {
	t.Run("takes the event card", func(t *testing.T) {
		g := testGame(t, game.ContingencyPlanner)
		g.Players[0].Hand = cityCards(t, g, "Lima")
		g.Decks.PlayerDiscard = append(cityCards(t, g, "Paris"), game.Card{Type: game.ActionCard, Name: "Airlift"})
		res := g.Retrieve("Airlift")
		wantSuccess(t, res, "Successfully retrieved 'Airlift' action card")
		want := []game.Card{cityCards(t, g, "Lima")[0], {Type: game.ActionCard, Name: "Airlift", Retrieved: true}}
		if !slices.Equal(g.Players[0].Hand, want) || !slices.Equal(names(g.Decks.PlayerDiscard), []string{"Paris"}) {
			t.Errorf("hand %+v, discard %v", g.Players[0].Hand, names(g.Decks.PlayerDiscard))
		}
	})
	t.Run("rule checks", func(t *testing.T) {
		g := testGame(t, game.Scientist)
		g.Decks.PlayerDiscard = append(cityCards(t, g, "Paris"), game.Card{Type: game.ActionCard, Name: "Airlift"})
		wantError(t, g.Retrieve("Airlift"), "Only the Contingency Planner can retrieve action cards")
		g.Players[0].Role = game.ContingencyPlanner
		wantError(t, g.Retrieve("Paris"), "Card 'Paris' is not an action card")
		wantError(t, g.Retrieve("Forecast"), "Card 'Forecast' not found in discard pile")
		if g.ActionsRemaining != 4 || len(g.Decks.PlayerDiscard) != 2 {
			t.Error("the game changed")
		}
	})
}

// Results marshal like the Ruby hashes: errors have no end_turn or
// game_state, and successes put end_turn before the extra keys.
func TestResultJSON(t *testing.T) {
	g := testGame(t, game.Scientist)
	g.City("Wuhan").SetDiseaseCubes(1)
	res := g.TreatDisease()
	res.GameState = nil // the view itself is checked by TestViewScenarios
	got, _ := json.Marshal(res)
	if want := `{"success":true,"status":"success","message":"Treated red disease in Wuhan","end_turn":false,"cubes_removed":1}`; string(got) != want {
		t.Errorf("treat: %s", got)
	}
	got, _ = json.Marshal(g.Move(0, "Atlantis", ""))
	if want := `{"success":false,"status":"error","message":"Unknown destination Atlantis"}`; string(got) != want {
		t.Errorf("error: %s", got)
	}
}
