package game_test

import (
	"encoding/json"
	"slices"
	"strconv"
	"strings"
	"testing"

	"github.com/mdemare/contract_to_cure/src/game"
)

// Ported from test_disease_summary.rb: every color has its supply, and the
// decks show the player deck's size but nothing of the infection deck.
func TestViewDiseaseCubesAndDecks(t *testing.T) {
	g := newGame(t, 4, game.Heroic, 1)
	var view struct {
		DiseaseCubes map[string]struct {
			InSupply *int `json:"inSupply"`
		} `json:"diseaseCubes"`
		Decks map[string]json.RawMessage `json:"decks"`
	}
	if err := json.Unmarshal(marshal(t, g), &view); err != nil {
		t.Fatal(err)
	}
	for _, c := range game.Colors {
		d, ok := view.DiseaseCubes[string(c)]
		if !ok || d.InSupply == nil || *d.InSupply < 0 {
			t.Errorf("%s: %+v", c, d)
		}
	}
	if got := string(view.Decks["playerDeck"]); got != strconv.Itoa(len(g.Decks.PlayerDeck)) {
		t.Errorf("playerDeck = %s", got)
	}
	if _, ok := view.Decks["infectionDeck"]; ok {
		t.Error("the view shows the infection deck")
	}
}

// Hands are sorted by type, then color, keeping ties in their order, and
// numbered; the player's own hand is left alone. Only city cards have a
// color, and the retrieved flag is not shown.
func TestViewHand(t *testing.T) {
	g := testGame(t)
	hand := append(cityCards(t, g, "Wuhan", "Paris", "Tokyo", "London"),
		game.Card{Type: game.ActionCard, Name: "Airlift", Retrieved: true},
		game.Card{Type: game.EpidemicCard, Name: game.EpidemicCardName})
	g.Players[0].Hand = hand
	before := slices.Clone(hand)

	got := marshal(t, g.View().Players[0].Hand)
	want := `[{"type":"action","name":"Airlift","index":0},` +
		`{"type":"city","name":"Paris","color":"blue","index":1},` +
		`{"type":"city","name":"London","color":"blue","index":2},` +
		`{"type":"city","name":"Wuhan","color":"red","index":3},` +
		`{"type":"city","name":"Tokyo","color":"red","index":4},` +
		`{"type":"epidemic","name":"Event:Epidemic","index":5}]`
	if string(got) != want {
		t.Errorf("hand:\n got %s\nwant %s", got, want)
	}
	if !slices.Equal(g.Players[0].Hand, before) {
		t.Error("the view sorted the hand itself")
	}
}

// Empty collections are [] or {}, never null; a missing Forecast and
// game-over reason are null; QuietNight is not shown.
func TestViewEmptyValues(t *testing.T) {
	g := testGame(t)
	g.ResearchStations = nil
	g.Decks = game.Decks{}
	quiet := true
	g.QuietNight = &quiet
	got := string(marshal(t, g))

	for _, want := range []string{
		`"gameOverReason":null`,
		`"forecast_cards":null`,
		`"onBoard":{}`,
		`"researchStations":{"available":6,"locations":[]}`,
		`"hand":[]`,
		`"decks":{"playerDeck":0,"discardPile":[],"infectionDiscardPile":[]}`,
	} {
		if !strings.Contains(got, want) {
			t.Errorf("view lacks %s:\n%s", want, got)
		}
	}
	if strings.Contains(got, "quiet") {
		t.Errorf("view shows quiet_night: %s", got)
	}

	g.ForecastCards = []string{}
	g.GameOver, g.GameOverReason = true, game.GameOverReason("victory")
	got = string(marshal(t, g))
	for _, want := range []string{`"forecast_cards":[]`, `"gameOver":true,"gameOverReason":"victory"`} {
		if !strings.Contains(got, want) {
			t.Errorf("view lacks %s:\n%s", want, got)
		}
	}
}

// A color is eradicated once it is cured and all its cubes are back.
func TestViewEradicated(t *testing.T) {
	g := testGame(t)
	g.City("Wuhan").SetDiseaseCubes(2)
	g.City("Tokyo").SetDiseaseCubes(1)
	d := g.Disease(game.Red)
	d.Cured, d.InSupply = true, game.MaxDiseaseCubesPerColor-3
	g.Disease(game.Blue).Cured = true
	g.Disease(game.Blue).InSupply = game.MaxDiseaseCubesPerColor

	got := string(marshal(t, g.View().DiseaseCubes))
	for _, want := range []string{
		`"blue":{"cured":true,"eradicated":true,"inSupply":24,"onBoard":{}}`,
		`"red":{"cured":true,"eradicated":false,"inSupply":21,"onBoard":{`,
	} {
		if !strings.Contains(got, want) {
			t.Errorf("diseaseCubes lacks %s:\n%s", want, got)
		}
	}
	if !strings.HasPrefix(got, `{"blue":`) || !strings.Contains(got, `"Tokyo":1`) || !strings.Contains(got, `"Wuhan":2`) {
		t.Errorf("diseaseCubes: %s", got)
	}
}
