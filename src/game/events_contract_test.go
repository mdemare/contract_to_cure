package game_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"github.com/mdemare/contract_to_cure/src/contract"
	"github.com/mdemare/contract_to_cure/src/game"
)

// eventCardRequest is the body of POST /action_card.
type eventCardRequest struct {
	Card        string   `json:"card"`
	City        string   `json:"city"`
	PlayerIndex *int     `json:"player_index"`
	CardOrder   []string `json:"card_order"`
}

// checkSave compares the game after a request with the scenario's
// save_after: the starting save when unchanged, else after.json.
func checkSave(t *testing.T, sc *contract.Scenario, g *game.GameState, unchanged []byte, changed bool) {
	t.Helper()
	after := encode(t, g)
	if sc.SaveAfter == contract.Unchanged {
		if changed {
			t.Error("a changed game must be saved")
		}
		if !bytes.Equal(after, unchanged) {
			t.Errorf("the game changed:\n%s", after)
		}
		return
	}
	if !changed {
		t.Error("an unchanged game must not be saved")
	}
	if want := readFixture(t, sc.SaveAfter); !bytes.Equal(after, want) {
		t.Errorf("save differs from %s:\n%s", sc.SaveAfter, after)
	}
}

func loadScenarios(t *testing.T, match func(*contract.Scenario) bool) map[string]*contract.Scenario {
	t.Helper()
	names, err := contract.ScenarioNames(fixtureRoot)
	if err != nil {
		t.Fatal(err)
	}
	out := map[string]*contract.Scenario{}
	for _, name := range names {
		sc, err := contract.LoadScenario(fixtureRoot, name)
		if err != nil {
			t.Fatal(err)
		}
		if match(sc) {
			out[name] = sc
		}
	}
	return out
}

// TestEventCardScenarios replays every /action_card contract scenario
// against the domain: the game-over guard, then PlayEventCard, comparing the
// body (key order, null vs missing), HTTP status and the save afterwards.
// Parameter validation is left to the HTTP layer (cc-422).
func TestEventCardScenarios(t *testing.T) {
	scenarios := loadScenarios(t, func(sc *contract.Scenario) bool { return sc.Request.Path == "/action_card" })
	if len(scenarios) < 17 {
		t.Fatalf("only %d event-card scenarios", len(scenarios))
	}
	for name, sc := range scenarios {
		t.Run(name, func(t *testing.T) {
			before := readFixture(t, sc.SaveBefore)
			g := decodeFixture(t, before)
			unchanged := encode(t, g)
			wantBody := compactJSON(t, sc.Response.Body)

			var gotStatus int
			var body any
			changed := false
			if rej := g.CheckGameOver(); rej != nil {
				gotStatus, body = http.StatusUnprocessableEntity, rej
			} else {
				if strings.Contains(wantBody, "parameters") {
					t.Skip("parameter validation: cc-422")
				}
				var req eventCardRequest
				if err := json.Unmarshal(sc.Request.Body, &req); err != nil {
					t.Fatal(err)
				}
				resp := g.PlayEventCard(game.EventCardRequest(req))
				gotStatus, body, changed = resp.HTTPStatus, resp.Body, resp.Changed
			}

			if gotStatus != sc.Response.Status {
				t.Errorf("status = %d, want %d", gotStatus, sc.Response.Status)
			}
			if got := compactJSON(t, marshal(t, body)); got != wantBody {
				t.Errorf("body:\n got %s\nwant %s", got, wantBody)
			}
			checkSave(t, sc, g, unchanged, changed)
		})
	}
}

// TestForecastGuardScenarios replays the scenarios of every other endpoint
// that start with a Forecast active: CheckForecast rejects them with 422
// before anything else runs.
func TestForecastGuardScenarios(t *testing.T) {
	scenarios := loadScenarios(t, func(sc *contract.Scenario) bool {
		return sc.SaveBefore == "states/forecast_active.json" && sc.Request.Path != "/action_card"
	})
	if len(scenarios) < 3 {
		t.Fatalf("only %d Forecast guard scenarios", len(scenarios))
	}
	for name, sc := range scenarios {
		t.Run(name, func(t *testing.T) {
			g := decodeFixture(t, readFixture(t, sc.SaveBefore))
			unchanged := encode(t, g)
			rej := g.CheckForecast()
			if rej == nil {
				t.Fatal("not rejected")
			}
			if sc.Response.Status != http.StatusUnprocessableEntity {
				t.Errorf("want status %d, the guard gives 422", sc.Response.Status)
			}
			if got, want := compactJSON(t, marshal(t, rej)), compactJSON(t, sc.Response.Body); got != want {
				t.Errorf("body:\n got %s\nwant %s", got, want)
			}
			checkSave(t, sc, g, unchanged, false)
		})
	}
}
