package web_test

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/mdemare/contract_to_cure/src/observe"
	"github.com/mdemare/contract_to_cure/src/store"
	"github.com/mdemare/contract_to_cure/src/web"
)

// fixedCSRF renders a fixed token and checks nothing.
type fixedCSRF struct{}

func (fixedCSRF) Token(http.ResponseWriter, *http.Request) string { return "token-123" }
func (fixedCSRF) Protect(next http.Handler) http.Handler          { return next }

// HTTP-level tests from the former Rails test_api_endpoints.rb and
// test_error_handling.rb, and characterization of Rails behavior the contract fixtures do not pin
// (recorded from the Rails app for cc-422).

func TestRootRendersIndex(t *testing.T) {
	ts := newTestServer(t, readFixture(t, "states/base.yaml"), func(c *web.Config) {
		c.CSRF = fixedCSRF{}
	})
	rec := ts.do(http.MethodGet, "/", "", "")
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d", rec.Code)
	}
	if ct := rec.Header().Get("Content-Type"); ct != "text/html; charset=utf-8" {
		t.Errorf("content type %q", ct)
	}
	page := rec.Body.String()
	for _, want := range []string{
		"<title>Contract To Cure</title>",
		`<meta name="csrf-token" content="token-123">`,
		`<script type="module" src="/js/menu.js"></script>`,
		`<strong id="black-disease-name" class="disease-name">Black</strong>`,
		`aria-label="24 of 24 red disease cubes remaining"`,
	} {
		if !strings.Contains(page, want) {
			t.Errorf("index page lacks %s", want)
		}
	}
	for _, unwanted := range []string{"git-hash", "sentry-dsn"} {
		if strings.Contains(page, unwanted) {
			t.Errorf("index page outside production with no DSN has %s", unwanted)
		}
	}
}

// From the former Rails test_menu.rb and test_disease_status_layout.rb.
func TestIndexHasMenuAndDiseaseStatus(t *testing.T) {
	ts := newTestServer(t, readFixture(t, "states/base.yaml"))
	page := ts.do(http.MethodGet, "/", "", "").Body.String()
	want := []string{
		`<div class="menu-container">`,
		`<button id="menu-toggle" class="menu-toggle"`,
		`aria-label="Menu"`,
		`aria-expanded="false"`,
		`<div id="dropdown-menu" class="dropdown-menu"`,
		`role="menu"`,
		`<button id="new-game-btn" class="menu-item"`,
		`<button id="login-menu-btn" class="menu-item"`,
		`<button id="logout-menu-btn" class="menu-item"`,
		`<div id="auth-info-menu" class="user-info"`,
		`<div class="menu-divider">`,
		`<link rel="stylesheet" href="/css/menu.css">`,
		`cure-grid`,
		`cure-info`,
	}
	for _, color := range []string{"blue", "yellow", "black", "red"} {
		want = append(want,
			"cure-item "+color,
			color+"-cure",
			`<span id="`+color+`-cubes" class="cube-count">`)
	}
	for _, w := range want {
		if !strings.Contains(page, w) {
			t.Errorf("index page lacks %s", w)
		}
	}
	for _, unwanted := range []string{
		`<div class="auth-container">`,
		`<button id="login-btn" class="login-button"`,
		`<button id="logout-btn" class="logout-button"`,
	} {
		if strings.Contains(page, unwanted) {
			t.Errorf("index page still has %s", unwanted)
		}
	}
	newGame := strings.Index(page, "new-game-btn")
	if newGame > strings.Index(page, "login-menu-btn") || newGame > strings.Index(page, "logout-menu-btn") {
		t.Error("New Game should come before Login and Logout")
	}
}

func TestIndexShowsGitHashAndSentryInProduction(t *testing.T) {
	ts := newTestServer(t, readFixture(t, "states/base.yaml"), func(c *web.Config) {
		c.Sentry = observe.Config{DSN: "https://key@example.com/1", Environment: "production"}
		c.GitHash = "abc123"
	})
	page := ts.do(http.MethodGet, "/", "", "").Body.String()
	for _, want := range []string{
		`<body data-git-hash="abc123">`,
		`<meta name="sentry-dsn" content="https://key@example.com/1">`,
		`<meta name="sentry-environment" content="production">`,
	} {
		if !strings.Contains(page, want) {
			t.Errorf("index page lacks %s", want)
		}
	}
}

// Like every Rails action, the index page loads the game, so it deals and
// saves one when there is none.
func TestIndexStartsAGameWhenNoneIsSaved(t *testing.T) {
	ts := newTestServer(t, nil)
	if rec := ts.do(http.MethodGet, "/", "", ""); rec.Code != http.StatusOK {
		t.Fatalf("status %d", rec.Code)
	}
	if g := ts.savedGame(); len(g.Players) != 4 || g.DifficultyLevel != "heroic" {
		t.Errorf("new game has %d players at %s", len(g.Players), g.DifficultyLevel)
	}
}

func TestHealthChecksDoNotTouchRedis(t *testing.T) {
	ts := newTestServer(t, nil)
	ts.mr.Close()
	for _, path := range []string{"/up", "/health"} {
		rec := ts.do(http.MethodGet, path, "", "")
		if rec.Code != http.StatusOK || rec.Body.String() != `<!DOCTYPE html><html><body style="background-color: green"></body></html>` {
			t.Errorf("%s: %d %s", path, rec.Code, rec.Body)
		}
	}
}

// A Redis error is a 500 with the generic message; the dial error goes to
// Sentry only (cc-493).
func TestRedisErrorIs500(t *testing.T) {
	ts := newTestServer(t, nil)
	events := ts.withSentry()
	ts.mr.Close()
	for _, tc := range []struct{ method, path string }{
		{http.MethodGet, "/game_state.json"},
		{http.MethodPost, "/pass"},
	} {
		rec := ts.do(tc.method, tc.path, "", "")
		checkError(t, rec, http.StatusInternalServerError, "Internal server error")
		if strings.Contains(rec.Body.String(), "dial") {
			t.Errorf("%s: body leaks the Go error: %s", tc.path, rec.Body)
		}
	}
	sent := events()
	if len(sent) != 2 {
		t.Fatalf("%d Sentry events, want 2", len(sent))
	}
	for _, e := range sent {
		if len(e.Exception) == 0 || !strings.Contains(e.Exception[len(e.Exception)-1].Value, "dial") {
			t.Errorf("event lacks the Redis error: %+v", e.Exception)
		}
		if e.Request == nil || e.Request.URL == "" {
			t.Error("event has no request")
		}
	}
}

func TestNestedUpdateIs500(t *testing.T) {
	ts := newTestServer(t, readFixture(t, "states/base.yaml"))
	err := ts.store.AtomicUpdate(context.Background(), func(ctx context.Context) error {
		req := httptest.NewRequestWithContext(ctx, http.MethodGet, "/game_state.json", nil)
		w := httptest.NewRecorder()
		ts.handler.ServeHTTP(w, req)
		checkError(t, w, http.StatusInternalServerError, "Internal server error")
		if strings.Contains(w.Body.String(), store.ErrNestedUpdate.Error()) {
			t.Errorf("body leaks the Go error: %s", w.Body)
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
}

func TestStaticFiles(t *testing.T) {
	ts := newTestServer(t, readFixture(t, "states/base.yaml"))
	for _, tc := range []struct {
		method, path string
		status       int
	}{
		{http.MethodGet, "/logo.svg", http.StatusOK},
		{http.MethodHead, "/css/menu.css", http.StatusOK},
		{http.MethodGet, "/js/menu.js", http.StatusOK},
		{http.MethodPost, "/logo.svg", http.StatusNotFound},
		{http.MethodGet, "/css/", http.StatusNotFound},
		{http.MethodGet, "/css", http.StatusNotFound},
		{http.MethodGet, "/go.mod", http.StatusNotFound},
		{http.MethodGet, "/nothing-here", http.StatusNotFound},
		// Known paths with another method are unknown routes, as in Rails.
		{http.MethodPost, "/game_state.json", http.StatusNotFound},
		{http.MethodGet, "/move", http.StatusNotFound},
		{http.MethodGet, "/game_state", http.StatusNotFound},
		{http.MethodHead, "/game_state.json", http.StatusOK},
	} {
		if rec := ts.do(tc.method, tc.path, "", ""); rec.Code != tc.status {
			t.Errorf("%s %s: %d, want %d", tc.method, tc.path, rec.Code, tc.status)
		}
	}
}

func TestGameStateIncludesCurrentUser(t *testing.T) {
	ts := newTestServer(t, readFixture(t, "states/base.yaml"), func(c *web.Config) {
		c.CurrentUser = func(*http.Request) any {
			return map[string]string{"uid": "7", "email": "a@example.com", "name": "A"}
		}
	})
	body := ts.do(http.MethodGet, "/game_state.json", "", "").Body.String()
	if !strings.HasSuffix(body, `,"current_user":{"email":"a@example.com","name":"A","uid":"7"}}`) {
		t.Errorf("body ends %s", body[max(0, len(body)-100):])
	}
}

// authentication runs outside the atomic update: a rejected request does not
// even load the game. The index page, health checks and Sentry test page are
// not authenticated.
func TestAuthenticateGuardsGameRoutesOnly(t *testing.T) {
	ts := newTestServer(t, nil, func(c *web.Config) {
		c.Authenticate = func(http.Handler) http.Handler {
			return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(http.StatusUnauthorized)
			})
		}
	})
	for _, path := range []string{"/game_state.json"} {
		if rec := ts.do(http.MethodGet, path, "", ""); rec.Code != http.StatusUnauthorized {
			t.Errorf("GET %s: %d", path, rec.Code)
		}
	}
	for _, path := range []string{"/move", "/treat", "/cure_disease", "/retrieve", "/share_knowledge", "/pass",
		"/draw_cards", "/infect_cities", "/build_research_station", "/discard_cards", "/action_card", "/restart_game"} {
		if rec := ts.postJSON(path, `{}`); rec.Code != http.StatusUnauthorized {
			t.Errorf("POST %s: %d", path, rec.Code)
		}
	}
	if ts.saved() != nil {
		t.Error("a rejected request saved a game")
	}
	for _, path := range []string{"/up", "/test-sentry", "/"} {
		if rec := ts.do(http.MethodGet, path, "", ""); rec.Code != http.StatusOK {
			t.Errorf("GET %s: %d", path, rec.Code)
		}
	}
}

// check_forecast_active blocks every endpoint but the index, the state and
// /action_card; check_game_over every one but the state and /restart_game.
// Both run before the phase checks and before params are read.
func TestGuardsRunBeforePhaseChecksAndParams(t *testing.T) {
	const forecast = "Cannot perform action while Forecast is active. Please complete the Forecast action first."
	posts := []string{"/move", "/treat", "/cure_disease", "/retrieve", "/share_knowledge", "/pass",
		"/draw_cards", "/infect_cities", "/build_research_station", "/discard_cards", "/action_card", "/restart_game"}
	for _, path := range posts {
		ts := newTestServer(t, readFixture(t, "states/forecast_active.yaml"))
		rec := ts.postJSON(path, "invalid json")
		if path == "/action_card" {
			checkError(t, rec, http.StatusBadRequest, "Invalid JSON")
		} else {
			checkError(t, rec, http.StatusUnprocessableEntity, forecast)
		}

		ts = newTestServer(t, readFixture(t, "states/game_over_draw_phase.yaml"))
		rec = ts.postJSON(path, "invalid json")
		if path == "/restart_game" {
			checkError(t, rec, http.StatusBadRequest, "Invalid JSON")
		} else {
			checkError(t, rec, http.StatusUnprocessableEntity, "The game is over")
		}
	}
	ts := newTestServer(t, readFixture(t, "states/forecast_active.yaml"))
	if rec := ts.do(http.MethodGet, "/", "", ""); rec.Code != http.StatusOK {
		t.Errorf("index during a Forecast: %d", rec.Code)
	}
}

// A Forecast started by one request is finished by the next.
func TestForecastPersistsAcrossRequests(t *testing.T) {
	ts := newTestServer(t, readFixture(t, "states/event_cards.yaml"))
	rec := ts.postJSON("/action_card", `{"card":"Forecast"}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("forecast: %d %s", rec.Code, rec.Body)
	}
	var names []string
	for _, c := range decodeBody(t, rec)["cards"].([]any) {
		names = append(names, c.(map[string]any)["name"].(string))
	}
	if !ts.savedGame().ForecastActive {
		t.Fatal("the Forecast is not saved as active")
	}
	checkError(t, ts.postJSON("/move", `{"player_index":0,"destination":"Bangkok"}`), http.StatusUnprocessableEntity,
		"Cannot perform action while Forecast is active. Please complete the Forecast action first.")

	order := `["` + strings.Join(names, `","`) + `"]`
	rec = ts.postJSON("/action_card", `{"card":"Forecast","card_order":`+order+`}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("apply: %d %s", rec.Code, rec.Body)
	}
	body := decodeBody(t, rec)
	if body["success"] != true || body["status"] != "success" || body["message"] == "" || body["game_state"] == nil {
		t.Errorf("finishing the Forecast should return a success with game_state: %s", rec.Body)
	}
	if ts.savedGame().ForecastActive {
		t.Error("the Forecast is still active")
	}
}

// An undecodable save (here a current player out of range, cc-439) starts a
// new game.
func TestUndecodableSaveStartsNewGame(t *testing.T) {
	bad := strings.Replace(string(readFixture(t, "states/base.yaml")), ":current_player_idx: 0", ":current_player_idx: 9", 1)
	ts := newTestServer(t, []byte(bad))
	if rec := ts.do(http.MethodGet, "/game_state.json", "", ""); rec.Code != http.StatusOK {
		t.Fatalf("%d %s", rec.Code, rec.Body)
	}
	if g := ts.savedGame(); g.CurrentPlayerIdx != 0 || g.Turn != 1 {
		t.Errorf("not a new game: player %d, turn %d", g.CurrentPlayerIdx, g.Turn)
	}
}

// From the former Rails test_api_endpoints.rb: the player-action endpoints reject requests
// outside player_actions with check_action's error object,
// before reading their params, and save nothing.
func TestPlayerActionsOutsideTheirPhase(t *testing.T) {
	requests := map[string]string{
		"/cure_disease":           `{"color":"blue","card_names":[]}`,
		"/retrieve":               `{"action_card_name":"Airlift"}`,
		"/share_knowledge":        `{"giving_player_index":0,"receiving_player_index":1,"city_name":"Chicago"}`,
		"/build_research_station": ``,
	}
	for path, body := range requests {
		before := readFixture(t, "states/draw_phase.yaml")
		ts := newTestServer(t, before)
		rec := ts.postJSON(path, body)
		if want := `{"success":false,"status":"error","message":"No more actions allowed"}`; rec.Code != http.StatusUnprocessableEntity || compactJSON(t, rec.Body.Bytes()) != want {
			t.Errorf("POST %s: %d %s, want 422 %s", path, rec.Code, rec.Body, want)
		}
		if !bytes.Equal(ts.saved(), before) {
			t.Errorf("POST %s changed the save", path)
		}
	}
}

// From the former Rails test_api_endpoints.rb: once the game is over, every mutating endpoint
// but /restart_game is rejected in every phase and saves nothing.
func TestMutatingEndpointsRejectedAfterGameOver(t *testing.T) {
	requests := map[string]string{
		"/move":                   `{"player_index":0,"destination":"Chicago"}`,
		"/treat":                  `{}`,
		"/cure_disease":           `{"color":"blue","card_names":["Atlanta","Chicago","Montreal","New York"]}`,
		"/retrieve":               `{"action_card_name":"Airlift"}`,
		"/share_knowledge":        `{"giving_player_index":0,"receiving_player_index":1,"city_name":"Atlanta"}`,
		"/pass":                   `{}`,
		"/draw_cards":             `{}`,
		"/infect_cities":          `{}`,
		"/build_research_station": `{}`,
		"/discard_cards":          `{"player_index":0,"card_names":["Atlanta"]}`,
		"/action_card":            `{"card":"One Quiet Night"}`,
	}
	for _, state := range []string{"game_over_victory", "game_over_draw_phase", "game_over_infect_phase"} {
		before := readFixture(t, "states/"+state+".yaml")
		ts := newTestServer(t, before)
		for path, body := range requests {
			rec := ts.postJSON(path, body)
			if want := `{"success":false,"status":"error","message":"The game is over"}`; rec.Code != http.StatusUnprocessableEntity || compactJSON(t, rec.Body.Bytes()) != want {
				t.Errorf("%s: POST %s: %d %s, want 422 %s", state, path, rec.Code, rec.Body, want)
			}
			if !bytes.Equal(ts.saved(), before) {
				t.Errorf("%s: POST %s changed the save", state, path)
			}
		}
	}
}

// restart_game returns the new game, so the client need not fetch it (cc-488).
func TestRestartGameReturnsGameState(t *testing.T) {
	ts := newTestServer(t, readFixture(t, "states/game_over_victory.yaml"))
	rec := ts.postJSON("/restart_game", `{}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("restart: %d %s", rec.Code, rec.Body)
	}
	body := decodeBody(t, rec)
	if body["success"] != true || body["status"] != "success" {
		t.Errorf("body %s", rec.Body)
	}
	state, ok := body["game_state"].(map[string]any)
	if !ok {
		t.Fatalf("no game_state: %s", rec.Body)
	}
	if status := state["gameStatus"].(map[string]any); status["gameOver"] != false || status["phase"] != "player_actions" {
		t.Errorf("gameStatus = %v", status)
	}
	if _, ok := state["current_user"]; ok {
		t.Error("game_state has current_user")
	}
}
