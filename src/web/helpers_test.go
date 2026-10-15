package web_test

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"math/rand/v2"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"sync/atomic"
	"testing"

	"github.com/alicebob/miniredis/v2"
	"github.com/getsentry/sentry-go"
	"github.com/redis/go-redis/v9"

	"github.com/mdemare/contract_to_cure/src/contract"
	"github.com/mdemare/contract_to_cure/src/game"
	"github.com/mdemare/contract_to_cure/src/store"
	"github.com/mdemare/contract_to_cure/src/web"
)

const (
	fixtureRoot = "../../testdata/contract"
	testKey     = "contract-to-cure/test-game"
	jsonType    = "application/json; charset=utf-8"
)

// TestMain keeps the request log out of the test output.
func TestMain(m *testing.M) {
	slog.SetDefault(slog.New(slog.DiscardHandler))
	os.Exit(m.Run())
}

var (
	boardOnce sync.Once
	board     *game.Map
	boardErr  error
)

func loadBoard(t *testing.T) *game.Map {
	t.Helper()
	boardOnce.Do(func() { board, boardErr = game.LoadMapFile("../../public/cities.json") })
	if boardErr != nil {
		t.Fatal(boardErr)
	}
	return board
}

// testServer is the app on a fresh miniredis, without authentication, like
// the Rails tests.
type testServer struct {
	t       *testing.T
	mr      *miniredis.Miniredis
	client  *redis.Client
	store   *store.Store
	handler http.Handler
}

// newTestServer starts the app with the game key holding save, or no key
// when save is nil. Options adjust the config.
func newTestServer(t *testing.T, save []byte, opts ...func(*web.Config)) *testServer {
	t.Helper()
	mr := miniredis.RunT(t)
	client := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	t.Cleanup(func() { client.Close() })
	if save != nil {
		if err := mr.Set(testKey, string(save)); err != nil {
			t.Fatal(err)
		}
	}
	st := store.NewWithClient(client, testKey, string(game.DefaultDifficulty))
	cfg := web.Config{
		Store:     st,
		Map:       loadBoard(t),
		PublicDir: "../../public",
		RNG:       &lockedRand{r: rand.New(rand.NewPCG(1, 2))},
	}
	for _, opt := range opts {
		opt(&cfg)
	}
	return &testServer{t: t, mr: mr, client: client, store: st,
		handler: web.New(cfg).Handler(sentry.CurrentHub())}
}

// lockedRand is a seeded Shuffler that is safe for concurrent requests.
type lockedRand struct {
	mu sync.Mutex
	r  *rand.Rand
}

func (l *lockedRand) Shuffle(n int, swap func(i, j int)) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.r.Shuffle(n, swap)
}

func (ts *testServer) do(method, path, contentType, body string) *httptest.ResponseRecorder {
	ts.t.Helper()
	var r io.Reader
	if body != "" {
		r = strings.NewReader(body)
	}
	req := httptest.NewRequest(method, path, r)
	if contentType != "" {
		req.Header.Set("Content-Type", contentType)
	}
	rec := httptest.NewRecorder()
	ts.handler.ServeHTTP(rec, req)
	return rec
}

func (ts *testServer) postJSON(path, body string) *httptest.ResponseRecorder {
	ts.t.Helper()
	return ts.do(http.MethodPost, path, "application/json", body)
}

// saved returns the raw save in Redis, or nil when there is none.
func (ts *testServer) saved() []byte {
	ts.t.Helper()
	s, err := ts.mr.Get(testKey)
	if err != nil {
		return nil
	}
	return []byte(s)
}

// savedGame decodes the save in Redis.
func (ts *testServer) savedGame() *game.GameState {
	ts.t.Helper()
	save, err := store.DecodeSave(ts.saved(), string(game.DefaultDifficulty))
	if err != nil {
		ts.t.Fatal(err)
	}
	g, err := game.FromSave(save)
	if err != nil {
		ts.t.Fatal(err)
	}
	return g
}

func (ts *testServer) setGame(g *game.GameState) {
	ts.t.Helper()
	data, err := g.EncodeSave()
	if err != nil {
		ts.t.Fatal(err)
	}
	if err := ts.mr.Set(testKey, string(data)); err != nil {
		ts.t.Fatal(err)
	}
}

// afterFirstGet runs fn once, right after the first GET of the game key
// completes, so a test can commit a concurrent change after a request has
// read its baseline (with_concurrent_save in the Rails fixture runner). fn
// may send another request: its GETs no longer trigger the hook.
func (ts *testServer) afterFirstGet(fn func()) {
	ts.client.AddHook(&afterGetHook{fn: fn})
}

type afterGetHook struct {
	fired atomic.Bool
	fn    func()
}

func (h *afterGetHook) DialHook(next redis.DialHook) redis.DialHook { return next }

func (h *afterGetHook) ProcessPipelineHook(next redis.ProcessPipelineHook) redis.ProcessPipelineHook {
	return next
}

func (h *afterGetHook) ProcessHook(next redis.ProcessHook) redis.ProcessHook {
	return func(ctx context.Context, cmd redis.Cmder) error {
		err := next(ctx, cmd)
		if cmd.Name() == "get" && h.fired.CompareAndSwap(false, true) {
			h.fn()
		}
		return err
	}
}

func readFixture(t *testing.T, path string) []byte {
	t.Helper()
	data, err := contract.ReadSave(fixtureRoot, path)
	if err != nil {
		t.Fatal(err)
	}
	return data
}

func decodeFixture(t *testing.T, path string) *game.GameState {
	t.Helper()
	save, err := store.DecodeSave(readFixture(t, path), string(game.DefaultDifficulty))
	if err != nil {
		t.Fatal(err)
	}
	g, err := game.FromSave(save)
	if err != nil {
		t.Fatal(err)
	}
	return g
}

func compactJSON(t *testing.T, raw []byte) string {
	t.Helper()
	var buf bytes.Buffer
	if err := json.Compact(&buf, raw); err != nil {
		t.Fatalf("invalid JSON %q: %v", raw, err)
	}
	return buf.String()
}

// decodeBody parses a JSON response.
func decodeBody(t *testing.T, rec *httptest.ResponseRecorder) map[string]any {
	t.Helper()
	var body map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("response is not a JSON object: %v\n%s", err, rec.Body)
	}
	return body
}

// checkError asserts an error response {status: error, message} with the
// given status.
func checkError(t *testing.T, rec *httptest.ResponseRecorder, status int, message string) {
	t.Helper()
	if rec.Code != status {
		t.Errorf("status %d, want %d: %s", rec.Code, status, rec.Body)
	}
	if ct := rec.Header().Get("Content-Type"); ct != jsonType {
		t.Errorf("content type %q", ct)
	}
	body := decodeBody(t, rec)
	if success, ok := body["success"]; !ok || success != false || body["status"] != "error" || body["message"] != message {
		t.Errorf("body %s, want error %q with success false", rec.Body, message)
	}
}
