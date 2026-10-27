package web_test

import (
	"bytes"
	"encoding/json"
	"reflect"
	"testing"

	"github.com/mdemare/contract_to_cure/src/contract"
	"github.com/mdemare/contract_to_cure/src/game"
)

// randomRestarts are the successful restart_game scenarios. Their after.json
// is a game dealt by Ruby's RNG, so the save is compared by shape (Q41-cc).
var randomRestarts = map[string]bool{
	"restart_game":                 true,
	"restart_game_difficulty":      true,
	"restart_game_after_game_over": true,
}

// TestContractScenarios replays every testdata/contract scenario through the
// HTTP server (Q41-cc): the status, content type and body byte for byte
// (key order and nulls included), then the save in Redis.
func TestContractScenarios(t *testing.T) {
	names, err := contract.ScenarioNames(fixtureRoot)
	if err != nil {
		t.Fatal(err)
	}
	if len(names) < 90 {
		t.Fatalf("found only %d scenarios", len(names))
	}
	for _, name := range names {
		t.Run(name, func(t *testing.T) {
			sc, err := contract.LoadScenario(fixtureRoot, name)
			if err != nil {
				t.Fatal(err)
			}
			before := readFixture(t, sc.SaveBefore)
			ts := newTestServer(t, before)
			if sc.ConcurrentSave != "" {
				concurrent := readFixture(t, sc.ConcurrentSave)
				ts.afterFirstGet(func() {
					if err := ts.mr.Set(testKey, string(concurrent)); err != nil {
						t.Error(err)
					}
				})
			}

			body := ""
			if string(sc.Request.Body) != "null" {
				body = string(sc.Request.Body)
			}
			rec := ts.do(sc.Request.Method, sc.Request.Path, sc.Request.Headers["Content-Type"], body)

			if rec.Code != sc.Response.Status {
				t.Errorf("status %d, want %d", rec.Code, sc.Response.Status)
			}
			if ct := rec.Header().Get("Content-Type"); ct != sc.Response.ContentType {
				t.Errorf("content type %q, want %q", ct, sc.Response.ContentType)
			}
			gotBody, wantBody := rec.Body.Bytes(), []byte(sc.Response.Body)
			if randomRestarts[name] {
				// The new game is dealt by Go's RNG, so game_state is only
				// required to be the game that was saved.
				var gotGame, wantGame json.RawMessage
				gotBody, gotGame = splitGameState(t, gotBody)
				wantBody, _ = splitGameState(t, wantBody)
				saved, err := json.Marshal(ts.savedGame())
				if err != nil {
					t.Fatal(err)
				}
				wantGame = saved
				if got, want := compactJSON(t, gotGame), compactJSON(t, wantGame); got != want {
					t.Errorf("game_state is not the saved game\n got: %s\nwant: %s", got, want)
				}
			}
			if got, want := compactJSON(t, gotBody), compactJSON(t, wantBody); got != want {
				t.Errorf("body differs\n got: %s\nwant: %s", got, want)
			}

			saved := ts.saved()
			switch {
			case sc.SaveAfter == contract.Unchanged:
				if !bytes.Equal(saved, before) {
					t.Errorf("the save changed:\n%s", saved)
				}
			case randomRestarts[name]:
				if got, want := ts.savedGame(), decodeFixture(t, sc.SaveAfter); !reflect.DeepEqual(shape(got), shape(want)) {
					t.Errorf("restarted game has shape %+v, want %+v", shape(got), shape(want))
				}
			default:
				if want := readFixture(t, sc.SaveAfter); !bytes.Equal(saved, want) {
					t.Errorf("save differs from %s:\n%s", sc.SaveAfter, saved)
				}
			}
		})
	}
}

// splitGameState returns a response body without its game_state, and the
// game_state itself.
func splitGameState(t *testing.T, body []byte) (rest, state json.RawMessage) {
	t.Helper()
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(body, &fields); err != nil {
		t.Fatalf("invalid JSON %q: %v", body, err)
	}
	state = fields["game_state"]
	delete(fields, "game_state")
	rest, err := json.Marshal(fields)
	if err != nil {
		t.Fatal(err)
	}
	return rest, state
}

// gameShape is what a new game has regardless of the deal.
type gameShape struct {
	Difficulty                      game.Difficulty
	Phase                           game.Phase
	Turn, Actions, Outbreaks        int
	PlayerDeck, PlayerDiscard       int
	InfectionDeck, InfectionDiscard int
	Epidemics, InfectedCities       int
	Stations                        []string
	HandSizes                       []int
}

func shape(g *game.GameState) gameShape {
	s := gameShape{
		Difficulty:       g.DifficultyLevel,
		Phase:            g.Phase,
		Turn:             g.Turn,
		Actions:          g.ActionsRemaining,
		Outbreaks:        g.Outbreaks,
		PlayerDeck:       len(g.Decks.PlayerDeck),
		PlayerDiscard:    len(g.Decks.PlayerDiscard),
		InfectionDeck:    len(g.Decks.InfectionDeck),
		InfectionDiscard: len(g.Decks.InfectionDiscard),
		Stations:         g.ResearchStations,
	}
	for _, c := range g.Decks.PlayerDeck {
		if c.Type == game.EpidemicCard {
			s.Epidemics++
		}
	}
	for i := range g.Cities {
		if g.Cities[i].DiseaseCubes() > 0 {
			s.InfectedCities++
		}
	}
	for _, p := range g.Players {
		s.HandSizes = append(s.HandSizes, len(p.Hand))
	}
	return s
}
