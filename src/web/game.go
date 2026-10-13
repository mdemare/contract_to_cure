package web

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"

	"github.com/mdemare/contract_to_cure/src/game"
	"github.com/mdemare/contract_to_cure/src/store"
)

// conflictMessage is render_game_conflict's message.
const conflictMessage = "The game was changed by another request. No changes were made; please retry."

// reply is what an endpoint renders. save marks the game as changed, so the
// update writes it before the reply is sent.
type reply struct {
	status int
	body   any
	// html, when set, is sent as the page instead of body as JSON.
	html []byte
	save bool
}

func jsonReply(status int, body any) reply { return reply{status: status, body: body} }

func rejected(rej *game.Rejection) reply { return jsonReply(http.StatusUnprocessableEntity, rej) }

// resultReply is render_game_result: a failed result is 422, except
// card_required, which is 200. The game changed exactly when the result
// succeeded.
func resultReply(res game.Result) reply {
	status := http.StatusOK
	if !res.Success && res.Status != game.StatusCardRequired {
		status = http.StatusUnprocessableEntity
	}
	return reply{status: status, body: res, save: res.Success}
}

// call is one request to a game endpoint, inside its atomic update.
type call struct {
	s *Server
	w http.ResponseWriter
	r *http.Request
	g *game.GameState
}

// validate reads the request's params and checks them against sc
// (validate_request). On failure it returns the reply to render instead:
// 400 for a body that does not parse, 422 for a schema failure.
func (c *call) validate(sc schema) (values, *reply) {
	params, err := readParams(c.r)
	switch {
	case errors.Is(err, errInvalidJSON):
		rep := jsonReply(http.StatusBadRequest, errorBody("Invalid JSON"))
		return nil, &rep
	case errors.Is(err, errBadRequest):
		return nil, &reply{status: http.StatusBadRequest}
	case err != nil:
		rep := jsonReply(http.StatusInternalServerError, errorBody(err.Error()))
		return nil, &rep
	}
	v, msg := sc.validate(params)
	if msg != "" {
		rep := jsonReply(http.StatusUnprocessableEntity, errorBody(msg))
		return nil, &rep
	}
	return v, nil
}

// route is a game endpoint: the before_actions it runs, in Rails' order,
// and the action.
type route struct {
	// forecastGuard is check_forecast_active.
	forecastGuard bool
	// gameOverGuard is check_game_over.
	gameOverGuard bool
	// playerAction is check_action (render_player_action_phase_error).
	playerAction bool
	action       func(*call) reply
}

// gameRoutes are GameController's actions, by pattern.
func (s *Server) gameRoutes() map[string]route {
	playerAction := func(action func(*call) reply) route {
		return route{forecastGuard: true, gameOverGuard: true, playerAction: true, action: action}
	}
	return map[string]route{
		"GET /game_state.json":         {action: (*call).state},
		"POST /move":                   playerAction((*call).move),
		"POST /treat":                  playerAction(func(c *call) reply { return resultReply(c.g.TreatDisease()) }),
		"POST /cure_disease":           playerAction((*call).cureDisease),
		"POST /retrieve":               playerAction((*call).retrieve),
		"POST /share_knowledge":        playerAction((*call).shareKnowledge),
		"POST /pass":                   playerAction(func(c *call) reply { return resultReply(c.g.Pass()) }),
		"POST /build_research_station": playerAction(func(c *call) reply { return resultReply(c.g.BuildResearchStation()) }),
		"POST /draw_cards":             {forecastGuard: true, gameOverGuard: true, action: (*call).drawCards},
		"POST /infect_cities":          {forecastGuard: true, gameOverGuard: true, action: (*call).infectCities},
		"POST /discard_cards":          {forecastGuard: true, gameOverGuard: true, action: (*call).discardCards},
		"POST /action_card":            {gameOverGuard: true, action: (*call).actionCard},
		"POST /restart_game":           {forecastGuard: true, action: (*call).restartGame},
	}
}

// run applies the route's guards and then its action.
func (rt route) run(c *call) reply {
	if rt.forecastGuard {
		if rej := c.g.CheckForecast(); rej != nil {
			return rejected(rej)
		}
	}
	if rt.gameOverGuard {
		if rej := c.g.CheckGameOver(); rej != nil {
			return rejected(rej)
		}
	}
	if rt.playerAction {
		if rej := c.g.CheckAction(); rej != nil {
			return rejected(rej)
		}
	}
	return rt.action(c)
}

// gameHandler runs a request as one atomic update of the game
// (atomically_update_game_state and load_game_state): it loads the game, or
// deals and saves a new one, and lets fn reply. AtomicUpdate commits the
// pending save before the reply is written, so success is only sent for a
// stored write (Rails' render override). If another request committed first,
// nothing is written and the client gets 409 with the current game.
func (s *Server) gameHandler(fn func(*call) reply) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var rep reply
		err := s.cfg.Store.AtomicUpdate(r.Context(), func(ctx context.Context) error {
			g, err := game.Load(ctx, s.cfg.Store, s.cfg.Map, s.cfg.Players, s.cfg.Difficulty, s.cfg.RNG)
			if err != nil {
				return err
			}
			rep = fn(&call{s: s, w: w, r: r, g: g})
			if rep.save {
				return s.cfg.Store.Save(ctx, g)
			}
			return nil
		})
		switch {
		case errors.Is(err, store.ErrConflict):
			slog.InfoContext(r.Context(), "Rejected stale game update", "error", err)
			s.renderConflict(w, r)
		case err != nil:
			slog.ErrorContext(r.Context(), "game request failed", "method", r.Method, "path", r.URL.Path, "error", err)
			writeJSON(w, http.StatusInternalServerError, errorBody(err.Error()))
		case rep.html != nil:
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			w.WriteHeader(rep.status)
			w.Write(rep.html)
		case rep.body == nil:
			w.WriteHeader(rep.status)
		default:
			writeJSON(w, rep.status, rep.body)
		}
	})
}

// renderConflict is render_game_conflict: 409 with the game that is saved
// now, read outside the failed update. game_state is left out when there is
// no readable save.
func (s *Server) renderConflict(w http.ResponseWriter, r *http.Request) {
	body := struct {
		Success   bool            `json:"success"`
		Status    string          `json:"status"`
		Message   string          `json:"message"`
		GameState *game.GameState `json:"game_state,omitempty"`
	}{Status: "conflict", Message: conflictMessage}
	save, err := s.cfg.Store.Load(r.Context())
	if err != nil {
		slog.ErrorContext(r.Context(), "loading game after conflict", "error", err)
	}
	if save != nil {
		if g, err := game.FromSave(save); err == nil {
			body.GameState = g
		}
	}
	writeJSON(w, http.StatusConflict, body)
}

type errorResponse struct {
	Status  string `json:"status"`
	Message string `json:"message"`
}

func errorBody(message string) errorResponse {
	return errorResponse{Status: game.StatusError, Message: message}
}

// writeJSON renders body as Rails' render json: does: no trailing newline,
// and the charset in the content type.
func writeJSON(w http.ResponseWriter, status int, body any) {
	data, err := json.Marshal(body)
	if err != nil {
		panic(err)
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	w.Write(data)
}

// state is GET /game_state.json: the client view plus current_user, which
// is null when nobody is logged in.
func (c *call) state() reply {
	view, err := json.Marshal(c.g)
	if err != nil {
		panic(err)
	}
	user, err := json.Marshal(c.s.cfg.CurrentUser(c.r))
	if err != nil {
		panic(err)
	}
	var buf bytes.Buffer
	buf.Write(bytes.TrimSuffix(view, []byte("}")))
	buf.WriteString(`,"current_user":`)
	buf.Write(user)
	buf.WriteByte('}')
	return jsonReply(http.StatusOK, json.RawMessage(buf.Bytes()))
}

func (c *call) move() reply {
	v, rep := c.validate(moveSchema)
	if rep != nil {
		return *rep
	}
	return resultReply(c.g.Move(v.int("player_index"), v.string("destination"), v.string("card_name")))
}

func (c *call) cureDisease() reply {
	v, rep := c.validate(cureDiseaseSchema)
	if rep != nil {
		return *rep
	}
	return resultReply(c.g.CureDisease(game.Color(v.string("color")), v.strings("card_names")))
}

func (c *call) retrieve() reply {
	v, rep := c.validate(retrieveSchema)
	if rep != nil {
		return *rep
	}
	return resultReply(c.g.Retrieve(v.string("action_card_name")))
}

func (c *call) shareKnowledge() reply {
	v, rep := c.validate(shareKnowledgeSchema)
	if rep != nil {
		return *rep
	}
	return resultReply(c.g.ShareKnowledge(v.int("giving_player_index"), v.int("receiving_player_index"), v.string("city_name")))
}

func (c *call) drawCards() reply {
	return endTurnReply(c.g.DrawCards(c.s.cfg.RNG))
}

func (c *call) infectCities() reply {
	return endTurnReply(c.g.InfectCities())
}

func endTurnReply(res game.EndTurnResponse) reply {
	return reply{status: res.HTTPStatus, body: res.Body, save: res.Changed}
}

func (c *call) discardCards() reply {
	v, rep := c.validate(discardCardsSchema)
	if rep != nil {
		return *rep
	}
	return resultReply(c.g.DiscardCards(v.int("player_index"), v.strings("card_names")))
}

// actionCard is POST /action_card. PlayEventCard dispatches on the card name
// and decides the status, since Forecast and unknown cards break the usual
// mapping.
func (c *call) actionCard() reply {
	v, rep := c.validate(actionCardSchema)
	if rep != nil {
		return *rep
	}
	res := c.g.PlayEventCard(game.EventCardRequest{
		Card:        v.string("card"),
		City:        v.string("city"),
		PlayerIndex: v.intPtr("player_index"),
		CardOrder:   v.strings("card_order"),
	})
	return reply{status: res.HTTPStatus, body: res.Body, save: res.Changed}
}

// restartGame is POST /restart_game: a new game with the same players, and
// the given difficulty or the current one. It has no game_state.
func (c *call) restartGame() reply {
	v, rep := c.validate(restartGameSchema)
	if rep != nil {
		return *rep
	}
	if err := c.g.Reset(c.s.cfg.Map, game.Difficulty(v.string("difficulty_level")), c.s.cfg.RNG); err != nil {
		return jsonReply(http.StatusInternalServerError, errorBody(err.Error()))
	}
	return reply{
		status: http.StatusOK,
		body:   game.Result{Success: true, Status: game.StatusSuccess, Message: "Game restarted successfully"},
		save:   true,
	}
}
