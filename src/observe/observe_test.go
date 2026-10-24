package observe

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/getsentry/sentry-go"
)

const testDSN = "https://public@example.ingest.sentry.io/123"

// recordingTransport keeps events instead of sending them.
type recordingTransport struct {
	mu     sync.Mutex
	events []*sentry.Event
}

func (t *recordingTransport) Flush(time.Duration) bool              { return true }
func (t *recordingTransport) FlushWithContext(context.Context) bool { return true }
func (t *recordingTransport) Configure(sentry.ClientOptions)        {}
func (t *recordingTransport) Close()                                {}
func (t *recordingTransport) SendEvent(e *sentry.Event) {
	t.mu.Lock()
	t.events = append(t.events, e)
	t.mu.Unlock()
}
func (t *recordingTransport) sent() []*sentry.Event {
	t.mu.Lock()
	defer t.mu.Unlock()
	return t.events
}

func newHub(t *testing.T, cfg Config) (*sentry.Hub, *recordingTransport) {
	t.Helper()
	transport := &recordingTransport{}
	opts := cfg.ClientOptions()
	opts.Transport = transport
	client, err := sentry.NewClient(opts)
	if err != nil {
		t.Fatal(err)
	}
	return sentry.NewHub(client, sentry.NewScope()), transport
}

// fixedCSRF renders a fixed token and verifies nothing, like the test
// environment's CSRF.
type fixedCSRF struct{}

func (fixedCSRF) Token(http.ResponseWriter, *http.Request) string { return "test-csrf-token" }
func (fixedCSRF) Protect(next http.Handler) http.Handler          { return next }

func server(hub *sentry.Hub, cfg Config) http.Handler {
	mux := http.NewServeMux()
	SentryTestRoutes(mux, cfg, fixedCSRF{})
	mux.HandleFunc("GET /panic", func(http.ResponseWriter, *http.Request) { panic("boom") })
	return LogRequests(Recover(hub, mux))
}

func serve(h http.Handler, method, path string) *httptest.ResponseRecorder {
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(method, path, nil))
	return rec
}

// captureLogs sends slog output to a buffer for the rest of the test.
func captureLogs(t *testing.T) *bytes.Buffer {
	t.Helper()
	var buf bytes.Buffer
	prev := slog.Default()
	slog.SetDefault(slog.New(slog.NewJSONHandler(&buf, nil)))
	t.Cleanup(func() { slog.SetDefault(prev) })
	return &buf
}

func logLines(t *testing.T, buf *bytes.Buffer) []map[string]any {
	t.Helper()
	var lines []map[string]any
	for _, line := range strings.Split(strings.TrimSpace(buf.String()), "\n") {
		if line == "" {
			continue
		}
		var m map[string]any
		if err := json.Unmarshal([]byte(line), &m); err != nil {
			t.Fatalf("log line %q: %v", line, err)
		}
		lines = append(lines, m)
	}
	return lines
}

// Ports of the former Rails test_sentry.rb.

func TestSmokeTestPageHasBothErrorControls(t *testing.T) {
	cfg := Config{Environment: "test"}
	hub, _ := newHub(t, cfg)
	rec := serve(server(hub, cfg), "GET", "/test-sentry")
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d", rec.Code)
	}
	body := rec.Body.String()
	for _, want := range []string{
		"Simulate frontend error",
		"Simulate backend error",
		"Sentry is not configured because SENTRY_DSN is not set.",
		`<meta name="csrf-token" content="test-csrf-token">`,
	} {
		if !strings.Contains(body, want) {
			t.Errorf("page lacks %q", want)
		}
	}
	if strings.Contains(body, "sentry-dsn") {
		t.Error("page loads Sentry without a DSN")
	}
}

func TestSmokeTestPageLoadsFrontendSentryWhenConfigured(t *testing.T) {
	cfg := Config{DSN: testDSN, Environment: "staging"}
	hub, _ := newHub(t, cfg)
	rec := serve(server(hub, cfg), "GET", "/test-sentry")
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d", rec.Code)
	}
	body := rec.Body.String()
	for _, want := range []string{
		`name="sentry-dsn" content="` + testDSN + `"`,
		`name="sentry-environment" content="staging"`,
		"/js/error_reporting.js",
		"browser.sentry-cdn.com",
	} {
		if !strings.Contains(body, want) {
			t.Errorf("page lacks %q", want)
		}
	}
	if strings.Contains(body, "Sentry is not configured") {
		t.Error("page says Sentry is not configured")
	}
}

func TestBackendSmokeTestCapturesAReportableError(t *testing.T) {
	cfg := Config{DSN: testDSN, Environment: "test", Release: "42"}
	hub, transport := newHub(t, cfg)
	rec := serve(server(hub, cfg), "POST", "/test-sentry/backend-error")
	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("status %d", rec.Code)
	}
	events := transport.sent()
	if len(events) != 1 {
		t.Fatalf("sent %d events", len(events))
	}
	event := events[0]
	if len(event.Exception) == 0 || event.Exception[len(event.Exception)-1].Value != "Sentry backend test error" {
		t.Errorf("exception %+v", event.Exception)
	}
	if event.Environment != "test" || event.Release != "42" {
		t.Errorf("environment %q release %q", event.Environment, event.Release)
	}
	var body map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body["error"] != "Sentry backend test error" || body["sentry_event_id"] != string(event.EventID) {
		t.Errorf("body %v, event %s", body, event.EventID)
	}
}

func TestBackendSmokeTestWithoutDSNReturnsNullEventID(t *testing.T) {
	cfg := Config{Environment: "test"}
	hub, transport := newHub(t, cfg)
	rec := serve(server(hub, cfg), "POST", "/test-sentry/backend-error")
	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("status %d", rec.Code)
	}
	if got := strings.TrimSpace(rec.Body.String()); got != `{"error":"Sentry backend test error","sentry_event_id":null}` {
		t.Errorf("body %s", got)
	}
	if n := len(transport.sent()); n != 0 {
		t.Errorf("sent %d events", n)
	}
}

func TestInitDoesNotRequireADSN(t *testing.T) {
	cfg := ConfigFromEnv(func(string) string { return "" }, filepath.Join(t.TempDir(), ".version"))
	if cfg.DSN != "" {
		t.Fatalf("DSN %q", cfg.DSN)
	}
	if err := Init(cfg); err != nil {
		t.Fatal(err)
	}
	if reporting(sentry.CurrentHub()) {
		t.Error("reporting without a DSN")
	}
}

func TestConfigFromEnv(t *testing.T) {
	dir := t.TempDir()
	versionFile := filepath.Join(dir, ".version")
	env := func(vars map[string]string) func(string) string {
		return func(k string) string { return vars[k] }
	}

	cfg := ConfigFromEnv(env(nil), versionFile)
	if cfg != (Config{Environment: "production"}) {
		t.Errorf("defaults: %+v", cfg)
	}

	if err := os.WriteFile(versionFile, []byte("1234\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	cfg = ConfigFromEnv(env(map[string]string{"DSN": "alias", "DEPLOYMENT_ENV": "staging"}), versionFile)
	if cfg != (Config{DSN: "alias", Environment: "staging", Release: "1234"}) {
		t.Errorf("alias: %+v", cfg)
	}

	cfg = ConfigFromEnv(env(map[string]string{"DSN": "alias", "SENTRY_DSN": "primary"}), versionFile)
	if cfg.DSN != "primary" {
		t.Errorf("SENTRY_DSN should win over DSN: %q", cfg.DSN)
	}
}

func TestPanicIsReportedAndAnswered500(t *testing.T) {
	logs := captureLogs(t)
	cfg := Config{DSN: testDSN, Environment: "test"}
	hub, transport := newHub(t, cfg)
	rec := serve(server(hub, cfg), "GET", "/panic")
	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("status %d", rec.Code)
	}
	if got := strings.TrimSpace(rec.Body.String()); got != `{"success":false,"status":"error","message":"Internal server error"}` {
		t.Errorf("body %s", got)
	}
	if ct := rec.Header().Get("Content-Type"); !strings.HasPrefix(ct, "application/json") {
		t.Errorf("content type %q", ct)
	}
	events := transport.sent()
	if len(events) != 1 || events[0].Message != "boom" {
		t.Fatalf("events %+v", events)
	}
	if events[0].Request == nil || events[0].Request.URL == "" {
		t.Error("event has no request")
	}
	lines := logLines(t, logs)
	if len(lines) < 2 || lines[len(lines)-2]["msg"] != "panic in handler" || lines[len(lines)-2]["error"] != "boom" {
		t.Errorf("panic log %v", lines)
	}
	last := lines[len(lines)-1]
	if last["msg"] != "request" || last["status"] != float64(500) || last["outcome"] != "error" {
		t.Errorf("request log %v", last)
	}
}

func TestReportErrorLogsAndReportsToRequestHub(t *testing.T) {
	logs := captureLogs(t)
	hub, transport := newHub(t, Config{DSN: testDSN})
	h := Recover(hub, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ReportError(r.Context(), "request failed", errors.New("dial tcp: refused"), "path", r.URL.Path)
	}))
	serve(h, "GET", "/game_state.json")
	events := transport.sent()
	if len(events) != 1 || len(events[0].Exception) == 0 || events[0].Exception[0].Value != "dial tcp: refused" {
		t.Fatalf("events %+v", events)
	}
	if events[0].Request == nil || !strings.HasSuffix(events[0].Request.URL, "/game_state.json") {
		t.Errorf("event request %+v", events[0].Request)
	}
	lines := logLines(t, logs)
	if len(lines) != 1 || lines[0]["msg"] != "request failed" || lines[0]["error"] != "dial tcp: refused" || lines[0]["path"] != "/game_state.json" || lines[0]["level"] != "ERROR" {
		t.Errorf("log %v", lines)
	}
}

// Without a hub on the context, ReportError falls back to the global hub and
// does not panic.
func TestReportErrorWithoutRequestHub(t *testing.T) {
	captureLogs(t)
	ReportError(context.Background(), "failed", errors.New("x"))
}

func TestPanicAfterResponseStartedKeepsResponse(t *testing.T) {
	captureLogs(t)
	hub, transport := newHub(t, Config{DSN: testDSN})
	h := Recover(hub, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusAccepted)
		panic("late")
	}))
	rec := serve(h, "GET", "/")
	if rec.Code != http.StatusAccepted || rec.Body.Len() != 0 {
		t.Errorf("status %d body %q", rec.Code, rec.Body.String())
	}
	if len(transport.sent()) != 1 {
		t.Error("late panic not reported")
	}
}

func TestAbortHandlerIsNotReported(t *testing.T) {
	hub, transport := newHub(t, Config{DSN: testDSN})
	h := Recover(hub, http.HandlerFunc(func(http.ResponseWriter, *http.Request) { panic(http.ErrAbortHandler) }))
	defer func() {
		if recover() != http.ErrAbortHandler {
			t.Error("ErrAbortHandler was swallowed")
		}
		if len(transport.sent()) != 0 {
			t.Error("ErrAbortHandler was reported")
		}
	}()
	serve(h, "GET", "/")
}

func TestRequestLogOutcomes(t *testing.T) {
	logs := captureLogs(t)
	for _, status := range []int{200, 409, 422, 404, 503} {
		h := LogRequests(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(status) }))
		serve(h, "POST", "/discard")
	}
	// A handler that writes nothing answers 200.
	serve(LogRequests(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {})), "GET", "/up")

	want := []struct {
		status  float64
		outcome string
		level   string
	}{
		{200, "ok", "INFO"}, {409, "conflict", "INFO"}, {422, "validation", "INFO"},
		{404, "ok", "INFO"}, {503, "error", "ERROR"}, {200, "ok", "INFO"},
	}
	lines := logLines(t, logs)
	if len(lines) != len(want) {
		t.Fatalf("%d log lines", len(lines))
	}
	for i, w := range want {
		l := lines[i]
		if l["msg"] != "request" || l["status"] != w.status || l["outcome"] != w.outcome || l["level"] != w.level {
			t.Errorf("line %d: %v", i, l)
		}
		if _, ok := l["duration_ms"].(float64); !ok {
			t.Errorf("line %d has no duration: %v", i, l)
		}
	}
	if lines[0]["method"] != "POST" || lines[0]["path"] != "/discard" {
		t.Errorf("line 0: %v", lines[0])
	}
}

func TestLogNewGame(t *testing.T) {
	logs := captureLogs(t)
	LogNewGame(context.Background(), "heroic")
	lines := logLines(t, logs)
	if len(lines) != 1 || lines[0]["msg"] != "No saved game found in Redis, starting new game" || lines[0]["difficulty"] != "heroic" {
		t.Errorf("logs %v", lines)
	}
}
