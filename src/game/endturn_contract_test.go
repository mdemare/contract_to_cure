package game_test

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"github.com/mdemare/contract_to_cure/src/contract"
	"github.com/mdemare/contract_to_cure/src/game"
)

// discardRequest is the body of POST /discard_cards.
type discardRequest struct {
	PlayerIndex int      `json:"player_index"`
	CardNames   []string `json:"card_names"`
}

// endTurnSteps run each end-turn endpoint after the Forecast and game-over
// guards, returning the body, HTTP status and whether Rails saved.
var endTurnSteps = map[string]func(t *testing.T, g *game.GameState, body json.RawMessage) (any, int, bool){
	"/draw_cards": func(_ *testing.T, g *game.GameState, _ json.RawMessage) (any, int, bool) {
		resp := g.DrawCards(seeded(1))
		return resp.Body, resp.HTTPStatus, resp.Changed
	},
	"/infect_cities": func(_ *testing.T, g *game.GameState, _ json.RawMessage) (any, int, bool) {
		resp := g.InfectCities()
		return resp.Body, resp.HTTPStatus, resp.Changed
	},
	"/discard_cards": func(t *testing.T, g *game.GameState, body json.RawMessage) (any, int, bool) {
		var req discardRequest
		if err := json.Unmarshal(body, &req); err != nil {
			t.Fatal(err)
		}
		res := g.DiscardCards(req.PlayerIndex, req.CardNames)
		return res, httpStatus(res), res.Success
	},
}

// TestEndTurnScenarios replays every /draw_cards, /infect_cities and
// /discard_cards contract scenario against the domain: the guards in Rails'
// order (Forecast, game over, then the step's own checks), the body (key
// order, null vs missing, game_state included), the HTTP status
// and the save afterwards. Parameter validation is left to cc-422. The only
// epidemic in the fixtures intensifies a one-card discard, so the shuffle
// cannot change the save.
func TestEndTurnScenarios(t *testing.T) {
	scenarios := loadScenarios(t, func(sc *contract.Scenario) bool {
		_, ok := endTurnSteps[sc.Request.Path]
		return ok
	})
	if len(scenarios) < 22 {
		t.Fatalf("only %d end-turn scenarios", len(scenarios))
	}
	for name, sc := range scenarios {
		t.Run(name, func(t *testing.T) {
			g := decodeFixture(t, readFixture(t, sc.SaveBefore))
			unchanged := encode(t, g)
			wantBody := compactJSON(t, sc.Response.Body)

			var gotStatus int
			var body any
			changed := false
			if rej := g.CheckForecast(); rej != nil {
				gotStatus, body = http.StatusUnprocessableEntity, rej
			} else if rej := g.CheckGameOver(); rej != nil {
				gotStatus, body = http.StatusUnprocessableEntity, rej
			} else {
				if strings.Contains(wantBody, "parameters") {
					t.Skip("parameter validation: cc-422")
				}
				body, gotStatus, changed = endTurnSteps[sc.Request.Path](t, g, sc.Request.Body)
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
