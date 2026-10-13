package game_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"path/filepath"
	"strings"
	"testing"

	"github.com/mdemare/contract_to_cure/src/contract"
	"github.com/mdemare/contract_to_cure/src/game"
	"github.com/mdemare/contract_to_cure/src/store"
)

const fixtureRoot = "../../testdata/contract"

func fixtureStates(t *testing.T) []string {
	t.Helper()
	paths, err := filepath.Glob(filepath.Join(fixtureRoot, "states", "*.yaml"))
	if err != nil || len(paths) == 0 {
		t.Fatalf("no fixture states: %v", err)
	}
	for i, p := range paths {
		paths[i], _ = filepath.Rel(fixtureRoot, p)
	}
	return paths
}

func readFixture(t *testing.T, path string) []byte {
	t.Helper()
	data, err := contract.ReadSave(fixtureRoot, path)
	if err != nil {
		t.Fatal(err)
	}
	return data
}

func decodeFixture(t *testing.T, data []byte) *game.GameState {
	t.Helper()
	s, err := store.DecodeSave(data, "heroic")
	if err != nil {
		t.Fatal(err)
	}
	g, err := game.FromSave(s)
	if err != nil {
		t.Fatal(err)
	}
	return g
}

// actionRequest holds the parameters of every player-action endpoint.
type actionRequest struct {
	PlayerIndex          int      `json:"player_index"`
	Destination          string   `json:"destination"`
	CardName             string   `json:"card_name"`
	Color                string   `json:"color"`
	CardNames            []string `json:"card_names"`
	ActionCardName       string   `json:"action_card_name"`
	GivingPlayerIndex    int      `json:"giving_player_index"`
	ReceivingPlayerIndex int      `json:"receiving_player_index"`
	CityName             string   `json:"city_name"`
}

var playerActions = map[string]func(t *testing.T, g *game.GameState, r actionRequest) game.Result{
	"/move": func(_ *testing.T, g *game.GameState, r actionRequest) game.Result {
		return g.Move(r.PlayerIndex, r.Destination, r.CardName)
	},
	"/treat": func(_ *testing.T, g *game.GameState, _ actionRequest) game.Result { return g.TreatDisease() },
	"/cure_disease": func(_ *testing.T, g *game.GameState, r actionRequest) game.Result {
		return g.CureDisease(game.Color(r.Color), r.CardNames)
	},
	"/retrieve": func(_ *testing.T, g *game.GameState, r actionRequest) game.Result {
		return g.Retrieve(r.ActionCardName)
	},
	"/share_knowledge": func(_ *testing.T, g *game.GameState, r actionRequest) game.Result {
		return g.ShareKnowledge(r.GivingPlayerIndex, r.ReceivingPlayerIndex, r.CityName)
	},
	"/pass":                   func(_ *testing.T, g *game.GameState, _ actionRequest) game.Result { return g.Pass() },
	"/build_research_station": func(_ *testing.T, g *game.GameState, _ actionRequest) game.Result { return g.BuildResearchStation() },
}

// httpStatus is the status Rails' render_game_result gives a result.
func httpStatus(res game.Result) int {
	if !res.Success && res.Status != game.StatusCardRequired {
		return http.StatusUnprocessableEntity
	}
	return http.StatusOK
}

// compactJSON compacts a JSON body, keeping its key order.
func compactJSON(t *testing.T, raw []byte) string {
	t.Helper()
	var buf bytes.Buffer
	if err := json.Compact(&buf, raw); err != nil {
		t.Fatal(err)
	}
	return buf.String()
}

func marshal(t *testing.T, v any) []byte {
	t.Helper()
	data, err := json.Marshal(v)
	if err != nil {
		t.Fatal(err)
	}
	return data
}

// TestPlayerActionScenarios replays every contract scenario of a player
// action against the domain: the guards in Rails' order (Forecast, game
// over, then phase), the action's result (key order, null vs missing,
// game_state included, HTTP status) and the save afterwards. Parameter validation and conflicts are
// left to the HTTP layer (cc-422).
func TestPlayerActionScenarios(t *testing.T) {
	names, err := contract.ScenarioNames(fixtureRoot)
	if err != nil {
		t.Fatal(err)
	}
	ran := 0
	for _, name := range names {
		sc, err := contract.LoadScenario(fixtureRoot, name)
		if err != nil {
			t.Fatal(err)
		}
		action, ok := playerActions[sc.Request.Path]
		if !ok {
			continue
		}
		t.Run(name, func(t *testing.T) {
			before := readFixture(t, sc.SaveBefore)
			g := decodeFixture(t, before)
			unchanged := encode(t, g)
			wantBody := compactJSON(t, sc.Response.Body)

			if sc.Response.Status == http.StatusConflict {
				t.Skip("conflict: cc-422")
			}

			var gotStatus int
			var gotBody []byte
			success := false
			if rej := g.CheckForecast(); rej != nil {
				gotStatus, gotBody = http.StatusUnprocessableEntity, marshal(t, rej)
			} else if rej := g.CheckGameOver(); rej != nil {
				gotStatus, gotBody = http.StatusUnprocessableEntity, marshal(t, rej)
			} else if rej := g.CheckAction(); rej != nil {
				gotStatus, gotBody = http.StatusUnprocessableEntity, marshal(t, rej)
			} else {
				if strings.Contains(wantBody, "parameters") {
					t.Skip("parameter validation: cc-422")
				}
				var req actionRequest
				if err := json.Unmarshal(sc.Request.Body, &req); err != nil {
					t.Fatal(err)
				}
				res := action(t, g, req)
				if res.GameState != nil && res.GameState != g {
					t.Error("game_state is not the game")
				}
				gotStatus, gotBody, success = httpStatus(res), marshal(t, res), res.Success
			}

			if gotStatus != sc.Response.Status {
				t.Errorf("status = %d, want %d", gotStatus, sc.Response.Status)
			}
			if got := compactJSON(t, gotBody); got != wantBody {
				t.Errorf("body:\n got %s\nwant %s", got, wantBody)
			}
			checkSave(t, sc, g, unchanged, success)
		})
		ran++
	}
	if ran < 40 {
		t.Fatalf("only %d player-action scenarios", ran)
	}
}
