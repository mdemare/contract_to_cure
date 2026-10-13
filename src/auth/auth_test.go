package auth

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

const testSecret = "test-jwt-secret"

// requiredAuth is with_required_auth in test/test_helper.rb.
var requiredAuth = Config{Environment: "test", JWTSecret: []byte(testSecret), RequireAuth: true}

// testUser is the user of test_helper.rb's auth_token.
var testUser = map[string]any{"id": 123, "email": "test@example.com", "name": "Test User"}

func token(t *testing.T, claims jwt.MapClaims, method jwt.SigningMethod, secret string) string {
	t.Helper()
	s, err := jwt.NewWithClaims(method, claims).SignedString([]byte(secret))
	if err != nil {
		t.Fatal(err)
	}
	return s
}

// authToken is auth_token in test_helper.rb.
func authToken(t *testing.T, user any, exp time.Time) string {
	return token(t, jwt.MapClaims{"user": user, "exp": exp.Unix(), "iat": time.Now().Unix()}, jwt.SigningMethodHS256, testSecret)
}

// gameServer stands in for the game endpoints until the HTTP layer (cc-422):
// game_state.json renders current_user, and restart_game succeeds.
func gameServer(cfg Config) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /game_state.json", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{"current_user": UserFromContext(r.Context())})
	})
	mux.HandleFunc("POST /restart_game", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{"success": true})
	})
	return New(cfg).Require(mux)
}

func request(h http.Handler, method, path, authToken string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, strings.NewReader("{}"))
	req.Header.Set("Content-Type", "application/json")
	if authToken != "" {
		req.AddCookie(&http.Cookie{Name: CookieName, Value: authToken})
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func assertError(t *testing.T, rec *httptest.ResponseRecorder, status int, message string) {
	t.Helper()
	if rec.Code != status {
		t.Fatalf("status %d, want %d", rec.Code, status)
	}
	if ct := rec.Header().Get("Content-Type"); ct != "application/json; charset=utf-8" {
		t.Errorf("content type %q", ct)
	}
	want := `{"status":"error","message":"` + message + `"}`
	if got := strings.TrimSpace(rec.Body.String()); got != want {
		t.Errorf("body %s, want %s", got, want)
	}
}

func currentUser(t *testing.T, rec *httptest.ResponseRecorder) string {
	t.Helper()
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d: %s", rec.Code, rec.Body)
	}
	var body struct {
		CurrentUser json.RawMessage `json:"current_user"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	return string(body.CurrentUser)
}

// Ports of test/test_api_authentication.rb.

func TestGameStateRequiresAuthWhenBypassDisabled(t *testing.T) {
	assertError(t, request(gameServer(requiredAuth), "GET", "/game_state.json", ""), 401, "Authentication required")
}

func TestMutatingEndpointRequiresAuthWhenBypassDisabled(t *testing.T) {
	assertError(t, request(gameServer(requiredAuth), "POST", "/restart_game", ""), 401, "Authentication required")
}

func TestInvalidAuthTokenIsRejected(t *testing.T) {
	assertError(t, request(gameServer(requiredAuth), "GET", "/game_state.json", "not-a-jwt"), 401, "Invalid authentication token")
}

func TestExpiredAuthTokenIsRejected(t *testing.T) {
	rec := request(gameServer(requiredAuth), "GET", "/game_state.json", authToken(t, testUser, time.Now().Add(-time.Hour)))
	assertError(t, rec, 401, "Authentication token has expired")
}

func TestValidAuthTokenAllowsGameState(t *testing.T) {
	rec := request(gameServer(requiredAuth), "GET", "/game_state.json", authToken(t, testUser, time.Now().Add(time.Hour)))
	if got, want := currentUser(t, rec), `{"uid":"123","email":"test@example.com","name":"Test User"}`; got != want {
		t.Errorf("current_user %s, want %s", got, want)
	}
}

func TestTestEnvironmentBypassRemainsExplicit(t *testing.T) {
	rec := request(gameServer(Config{Environment: "test"}), "GET", "/game_state.json", "")
	if got := currentUser(t, rec); got != "null" {
		t.Errorf("current_user %s, want null", got)
	}
}

// Ports of the current_user tests in test/test_sessions_controller.rb.

func TestCurrentUserHelper(t *testing.T) {
	rec := request(gameServer(Config{Environment: "test", SkipAuth: true}), "GET", "/game_state.json", "")
	if got, want := currentUser(t, rec), `{"uid":"dev_user","email":"dev@example.com","name":"Development User"}`; got != want {
		t.Errorf("current_user %s, want %s", got, want)
	}
}

func TestCurrentUserHelperWithoutSession(t *testing.T) {
	rec := request(gameServer(Config{Environment: "test"}), "GET", "/game_state.json", "")
	if got := currentUser(t, rec); got != "null" {
		t.Errorf("current_user %s, want null", got)
	}
}

// Characterization of ApplicationController#current_user and
// auth_bypass_enabled? beyond the Rails tests.

func TestBypassAndDevelopmentUser(t *testing.T) {
	dev := `{"uid":"dev_user","email":"dev@example.com","name":"Development User"}`
	for _, tc := range []struct {
		name   string
		cfg    Config
		status int
		user   string
	}{
		{"production", Config{Environment: "production"}, 401, ""},
		{"staging", Config{Environment: "staging"}, 401, ""},
		{"production SKIP_AUTH", Config{Environment: "production", SkipAuth: true}, 200, dev},
		{"development", Config{Environment: "development"}, 200, dev},
		{"development REQUIRE_AUTH", Config{Environment: "development", RequireAuth: true}, 200, dev},
		{"test", Config{Environment: "test"}, 200, "null"},
		// REQUIRE_AUTH turns off the bypass, but SKIP_AUTH still supplies a user.
		{"test REQUIRE_AUTH SKIP_AUTH", Config{Environment: "test", RequireAuth: true, SkipAuth: true}, 200, dev},
	} {
		t.Run(tc.name, func(t *testing.T) {
			rec := request(gameServer(tc.cfg), "GET", "/game_state.json", "")
			if tc.status == 401 {
				assertError(t, rec, 401, "Authentication required")
				return
			}
			if got := currentUser(t, rec); got != tc.user {
				t.Errorf("current_user %s, want %s", got, tc.user)
			}
		})
	}
}

func TestBadTokenGetsNoDevelopmentUser(t *testing.T) {
	cfg := Config{Environment: "test", JWTSecret: []byte(testSecret), SkipAuth: true}
	if got := currentUser(t, request(gameServer(cfg), "GET", "/game_state.json", "not-a-jwt")); got != "null" {
		t.Errorf("current_user %s, want null", got)
	}
	cfg.RequireAuth = true
	assertError(t, request(gameServer(cfg), "GET", "/game_state.json", "not-a-jwt"), 401, "Invalid authentication token")
}

func TestBlankCookieIsNoToken(t *testing.T) {
	assertError(t, request(gameServer(requiredAuth), "GET", "/game_state.json", " "), 401, "Authentication required")
}

func TestValidateJWT(t *testing.T) {
	later := time.Now().Add(time.Hour).Unix()
	hs256 := func(claims jwt.MapClaims) string { return token(t, claims, jwt.SigningMethodHS256, testSecret) }
	for _, tc := range []struct {
		name  string
		token string
		uid   string
		err   error
	}{
		{"integer id", hs256(jwt.MapClaims{"user": map[string]any{"id": 7}, "exp": later}), "7", nil},
		{"string id", hs256(jwt.MapClaims{"user": map[string]any{"id": "abc"}}), "abc", nil},
		{"no exp", hs256(jwt.MapClaims{"user": map[string]any{"id": 1}}), "1", nil},
		{"iat is not checked", hs256(jwt.MapClaims{"user": map[string]any{"id": 1}, "iat": later}), "1", nil},
		{"missing user", hs256(jwt.MapClaims{"exp": later}), "", ErrInvalid},
		{"user not an object", hs256(jwt.MapClaims{"user": 5}), "", ErrInvalid},
		{"missing id", hs256(jwt.MapClaims{"user": map[string]any{"email": "a@b"}}), "", ErrInvalid},
		{"blank id", hs256(jwt.MapClaims{"user": map[string]any{"id": " "}}), "", ErrInvalid},
		{"null id", hs256(jwt.MapClaims{"user": map[string]any{"id": nil}}), "", ErrInvalid},
		{"not yet valid", hs256(jwt.MapClaims{"user": map[string]any{"id": 1}, "nbf": later}), "", ErrInvalid},
		{"wrong secret", token(t, jwt.MapClaims{"user": map[string]any{"id": 1}}, jwt.SigningMethodHS256, "other"), "", ErrInvalid},
		{"expired with wrong secret", token(t, jwt.MapClaims{"user": map[string]any{"id": 1}, "exp": 1}, jwt.SigningMethodHS256, "other"), "", ErrInvalid},
		{"HS512", token(t, jwt.MapClaims{"user": map[string]any{"id": 1}}, jwt.SigningMethodHS512, testSecret), "", ErrInvalid},
		{"expired", hs256(jwt.MapClaims{"user": map[string]any{"id": 1}, "exp": 1}), "", ErrExpired},
	} {
		t.Run(tc.name, func(t *testing.T) {
			user, err := ValidateJWT(tc.token, []byte(testSecret))
			if err != tc.err {
				t.Fatalf("error %v, want %v", err, tc.err)
			}
			if err == nil && user.UID != tc.uid {
				t.Errorf("uid %q, want %q", user.UID, tc.uid)
			}
		})
	}
	if _, err := ValidateJWT(hs256(jwt.MapClaims{"user": map[string]any{"id": 1}}), nil); err != ErrInvalid {
		t.Errorf("empty secret: error %v, want ErrInvalid", err)
	}
}

func TestMissingEmailAndNameAreNull(t *testing.T) {
	rec := request(gameServer(requiredAuth), "GET", "/game_state.json", authToken(t, map[string]any{"id": 9}, time.Now().Add(time.Hour)))
	if got, want := currentUser(t, rec), `{"uid":"9","email":null,"name":null}`; got != want {
		t.Errorf("current_user %s, want %s", got, want)
	}
}

func TestConfigFromEnv(t *testing.T) {
	env := func(m map[string]string) func(string) string { return func(k string) string { return m[k] } }

	if _, err := ConfigFromEnv(env(nil)); err == nil {
		t.Error("missing DEPLOYMENT_ENV and JWT_SECRET: want an error, since that is production")
	}
	if _, err := ConfigFromEnv(env(map[string]string{"DEPLOYMENT_ENV": "staging"})); err == nil {
		t.Error("staging without JWT_SECRET: want an error")
	}
	cfg, err := ConfigFromEnv(env(map[string]string{"JWT_SECRET": "s"}))
	if err != nil || cfg.Environment != "production" || cfg.bypass() {
		t.Errorf("default: %+v, %v; want production without bypass", cfg, err)
	}
	for _, e := range []string{"development", "test"} {
		cfg, err := ConfigFromEnv(env(map[string]string{"DEPLOYMENT_ENV": e}))
		if err != nil || !cfg.bypass() {
			t.Errorf("%s: %+v, %v; want bypass without JWT_SECRET", e, cfg, err)
		}
	}
	cfg, _ = ConfigFromEnv(env(map[string]string{"DEPLOYMENT_ENV": "test", "REQUIRE_AUTH": "true", "SKIP_AUTH": "1"}))
	if !cfg.RequireAuth || cfg.SkipAuth {
		t.Errorf("flags: %+v; only the value true counts", cfg)
	}
}
