package main

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/getsentry/sentry-go"
	"github.com/golang-jwt/jwt/v5"
	"github.com/redis/go-redis/v9"

	"github.com/mdemare/contract_to_cure/src/auth"
	"github.com/mdemare/contract_to_cure/src/game"
	"github.com/mdemare/contract_to_cure/src/store"
	"github.com/mdemare/contract_to_cure/src/web"
)

const (
	testSecret = "production-jwt-secret"
	testKey    = "contract-to-cure/main-test"
)

func TestMain(m *testing.M) {
	slog.SetDefault(slog.New(slog.DiscardHandler))
	os.Exit(m.Run())
}

// productionServer is main's handler with DEPLOYMENT_ENV=production on a
// fresh miniredis. The web and contract tests run without authentication, so
// only this test sees whether main wires it in (cc-456).
func productionServer(t *testing.T) (http.Handler, *miniredis.Miniredis) {
	t.Helper()
	return serverWithEnv(t, map[string]string{"DEPLOYMENT_ENV": "production", "JWT_SECRET": testSecret})
}

// serverWithEnv is main's handler with the auth config read from env.
func serverWithEnv(t *testing.T, env map[string]string) (http.Handler, *miniredis.Miniredis) {
	t.Helper()
	authConfig, err := auth.ConfigFromEnv(func(k string) string { return env[k] })
	if err != nil {
		t.Fatal(err)
	}
	board, err := game.LoadMapFile("../public/cities.json")
	if err != nil {
		t.Fatal(err)
	}
	mr := miniredis.RunT(t)
	client := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	t.Cleanup(func() { client.Close() })
	st := store.NewWithClient(client, testKey, string(game.DefaultDifficulty))
	return newHandler(authConfig, web.Config{Store: st, Map: board, PublicDir: "../public"}, sentry.NewHub(nil, sentry.NewScope())), mr
}

func send(h http.Handler, method, path, cookie string) *httptest.ResponseRecorder {
	var body io.Reader
	if method == http.MethodPost {
		body = strings.NewReader("{}")
	}
	req := httptest.NewRequest(method, path, body)
	req.Header.Set("Content-Type", "application/json")
	if cookie != "" {
		req.AddCookie(&http.Cookie{Name: auth.CookieName, Value: cookie})
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func validToken(t *testing.T) string {
	t.Helper()
	claims := jwt.MapClaims{
		"user": map[string]any{"id": 123, "email": "test@example.com", "name": "Test User"},
		"exp":  time.Now().Add(time.Hour).Unix(),
		"iat":  time.Now().Unix(),
	}
	s, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(testSecret))
	if err != nil {
		t.Fatal(err)
	}
	return s
}

func TestProductionRequiresAuthentication(t *testing.T) {
	h, mr := productionServer(t)
	cases := []struct {
		method, path, cookie, message string
	}{
		{http.MethodGet, "/game_state.json", "", "Authentication required"},
		{http.MethodGet, "/game_state.json", "garbage", "Invalid authentication token"},
		{http.MethodPost, "/pass", "", "Authentication required"},
		{http.MethodPost, "/restart_game", "", "Authentication required"},
	}
	for _, c := range cases {
		rec := send(h, c.method, c.path, c.cookie)
		want := `{"status":"error","message":"` + c.message + `"}`
		if rec.Code != http.StatusUnauthorized || strings.TrimSpace(rec.Body.String()) != want {
			t.Errorf("%s %s cookie %q: %d %s, want 401 %s", c.method, c.path, c.cookie, rec.Code, rec.Body, want)
		}
	}
	if mr.Exists(testKey) {
		t.Error("an unauthenticated request saved a game")
	}
}

func TestProductionRendersCurrentUser(t *testing.T) {
	h, _ := productionServer(t)
	rec := send(h, http.MethodGet, "/game_state.json", validToken(t))
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d: %s", rec.Code, rec.Body)
	}
	var body struct {
		CurrentUser json.RawMessage `json:"current_user"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	want := `{"uid":"123","email":"test@example.com","name":"Test User"}`
	if string(body.CurrentUser) != want {
		t.Errorf("current_user %s, want %s", body.CurrentUser, want)
	}
}

// The game JSON POSTs skip CSRF, as GameController skips
// verify_authenticity_token: a logged-in POST without a token succeeds.
func TestProductionGamePostsSkipCSRF(t *testing.T) {
	h, _ := productionServer(t)
	if rec := send(h, http.MethodPost, "/restart_game", validToken(t)); rec.Code != http.StatusOK {
		t.Errorf("POST /restart_game: %d %s", rec.Code, rec.Body)
	}
}

// The session routes sit outside the game guards and never read the game:
// they redirect during a Forecast and while Redis is down
// (test_sessions_controller.rb).
func TestSessionRoutesDoNotTouchTheGame(t *testing.T) {
	h, mr := serverWithEnv(t, map[string]string{
		"DEPLOYMENT_ENV":   "production",
		"JWT_SECRET":       testSecret,
		"AUTH_SERVICE_URL": "https://auth.example.com",
		"SUBDOMAIN":        "game",
		"DOMAIN_NAME":      "example.com",
	})
	forecast, err := os.ReadFile("../testdata/contract/states/forecast_active.yaml")
	if err != nil {
		t.Fatal(err)
	}
	if err := mr.Set(testKey, string(forecast)); err != nil {
		t.Fatal(err)
	}
	check := func(when string) {
		t.Helper()
		rec := send(h, http.MethodGet, "/login", "")
		if want := "https://auth.example.com/login?return_url=https%3A%2F%2Fgame.example.com"; rec.Code != http.StatusFound || rec.Header().Get("Location") != want {
			t.Errorf("%s: GET /login: %d to %q, want 302 to %s", when, rec.Code, rec.Header().Get("Location"), want)
		}
		for _, r := range []struct{ method, path string }{
			{http.MethodDelete, "/logout"},
			{http.MethodGet, "/auth/failure?message=invalid_credentials"},
		} {
			if rec := send(h, r.method, r.path, ""); rec.Code != http.StatusFound || rec.Header().Get("Location") != "/" {
				t.Errorf("%s: %s %s: %d to %q, want 302 to /", when, r.method, r.path, rec.Code, rec.Header().Get("Location"))
			}
		}
	}
	check("during a Forecast")
	mr.Close()
	check("with Redis down")
}
