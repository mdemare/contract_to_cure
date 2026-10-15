package auth

import (
	"bytes"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

var sessionConfig = Config{
	Environment:    "test",
	AuthServiceURL: "https://auth.example.com",
	Subdomain:      "cure",
	DomainName:     "example.com",
}

func sessions(cfg Config) http.Handler {
	mux := http.NewServeMux()
	SessionRoutes(mux, cfg)
	return mux
}

func assertRedirect(t *testing.T, rec *httptest.ResponseRecorder, location string) {
	t.Helper()
	if rec.Code != http.StatusFound {
		t.Fatalf("status %d, want 302", rec.Code)
	}
	if got := rec.Header().Get("Location"); got != location {
		t.Errorf("Location %q, want %q", got, location)
	}
}

// Ports of the former Rails test_sessions_controller.rb (current_user is in auth_test.go).

func TestDestroySession(t *testing.T) {
	rec := request(sessions(sessionConfig), "DELETE", "/logout", "")
	assertRedirect(t, rec, "/")
	if got, want := rec.Header().Get("Set-Cookie"), "auth_token=; Path=/; Domain=example.com; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0"; got != want {
		t.Errorf("Set-Cookie %q, want %q", got, want)
	}
}

func TestAuthenticationFailure(t *testing.T) {
	var logs bytes.Buffer
	prev := slog.Default()
	slog.SetDefault(slog.New(slog.NewJSONHandler(&logs, nil)))
	t.Cleanup(func() { slog.SetDefault(prev) })

	assertRedirect(t, request(sessions(sessionConfig), "GET", "/auth/failure?message=invalid_credentials", ""), "/")
	if !strings.Contains(logs.String(), `"level":"ERROR","msg":"authentication failure","message":"invalid_credentials"`) {
		t.Errorf("log %s", logs.String())
	}
}

// Characterization of the former Rails SessionsController beyond the Rails tests.

func TestLogoutWithoutDomainName(t *testing.T) {
	cfg := sessionConfig
	cfg.DomainName = ""
	rec := request(sessions(cfg), "DELETE", "/logout", "")
	assertRedirect(t, rec, "/")
	if got := rec.Header().Get("Set-Cookie"); strings.Contains(got, "Domain") || !strings.HasPrefix(got, "auth_token=;") {
		t.Errorf("Set-Cookie %q, want auth_token deleted on the host", got)
	}
}

func TestLoginRedirectsToAuthService(t *testing.T) {
	rec := request(sessions(sessionConfig), "GET", "/login", "")
	assertRedirect(t, rec, "https://auth.example.com/login?return_url=https%3A%2F%2Fcure.example.com")
}

func TestLoginWithoutConfiguration(t *testing.T) {
	for _, missing := range []string{"AUTH_SERVICE_URL", "SUBDOMAIN", "DOMAIN_NAME"} {
		cfg := sessionConfig
		switch missing {
		case "AUTH_SERVICE_URL":
			cfg.AuthServiceURL = ""
		case "SUBDOMAIN":
			cfg.Subdomain = ""
		case "DOMAIN_NAME":
			cfg.DomainName = ""
		}
		assertError(t, request(sessions(cfg), "GET", "/login", ""), 500, `key not found: \"`+missing+`\"`)
	}
}

func TestSessionRoutesSkipAuthentication(t *testing.T) {
	cfg := sessionConfig
	cfg.Environment = "production"
	h := sessions(cfg)
	if rec := request(h, "GET", "/login", ""); rec.Code != http.StatusFound {
		t.Errorf("/login status %d", rec.Code)
	}
	if rec := request(h, "DELETE", "/logout", ""); rec.Code != http.StatusFound {
		t.Errorf("/logout status %d", rec.Code)
	}
}
