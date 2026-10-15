// Package web is the HTTP layer of the Go backend (cc-422). It replaces the
// former Rails ApplicationController, GameController and GameRequestSchemas,
// renders the index page, and serves public/.
package web

import (
	"bytes"
	"embed"
	"html/template"
	"math/rand/v2"
	"net/http"
	"os"
	"path"
	"path/filepath"

	"github.com/getsentry/sentry-go"

	"github.com/mdemare/contract_to_cure/src/game"
	"github.com/mdemare/contract_to_cure/src/observe"
	"github.com/mdemare/contract_to_cure/src/store"
)

// Config is what the server needs. New fills in the optional fields.
type Config struct {
	Store *store.Store
	Map   *game.Map
	// Players and Difficulty are used for a new game when there is no save
	// (config.default_players and default_difficulty).
	Players    int
	Difficulty game.Difficulty
	// RNG deals new games and shuffles at epidemics. It must be safe for
	// concurrent use. Default: math/rand/v2's global source.
	RNG game.Shuffler
	// PublicDir holds the static files. Default: "public".
	PublicDir string
	Sentry    observe.Config
	// GitHash is shown on the index page in production.
	GitHash string

	// Authenticate guards the game endpoints (authenticate_request!). It
	// wraps the atomic update. Default: no authentication; main sets
	// auth.New(cfg).Require (cc-456).
	Authenticate func(http.Handler) http.Handler
	// CurrentUser is game_state.json's current_user; nil renders null.
	// Default: nil.
	CurrentUser func(*http.Request) any
	// CSRF fills the csrf-token meta tags of the index and Sentry test pages
	// and guards the Sentry test POST (*auth.CSRF). The game JSON POSTs are
	// not checked, as GameController skips verify_authenticity_token.
	// Default: an empty token and no checks.
	CSRF observe.CSRF
}

// noCSRF renders an empty token and checks nothing.
type noCSRF struct{}

func (noCSRF) Token(http.ResponseWriter, *http.Request) string { return "" }
func (noCSRF) Protect(next http.Handler) http.Handler          { return next }

// globalRand shuffles with math/rand/v2's global source, which is safe for
// concurrent use.
type globalRand struct{}

func (globalRand) Shuffle(n int, swap func(i, j int)) { rand.Shuffle(n, swap) }

// Server handles the app's routes.
type Server struct {
	cfg Config
}

// New returns a server for cfg.
func New(cfg Config) *Server {
	if cfg.Players == 0 {
		cfg.Players = game.DefaultPlayers
	}
	if cfg.Difficulty == "" {
		cfg.Difficulty = game.DefaultDifficulty
	}
	if cfg.RNG == nil {
		cfg.RNG = globalRand{}
	}
	if cfg.PublicDir == "" {
		cfg.PublicDir = "public"
	}
	if cfg.Authenticate == nil {
		cfg.Authenticate = func(h http.Handler) http.Handler { return h }
	}
	if cfg.CurrentUser == nil {
		cfg.CurrentUser = func(*http.Request) any { return nil }
	}
	if cfg.CSRF == nil {
		cfg.CSRF = noCSRF{}
	}
	return &Server{cfg: cfg}
}

// Handler returns every route of the game, wrapped in the request
// log and panic recovery (LogRequests(Recover(hub, mux))). The Sentry test
// routes skip authentication and the atomic update, as they did in Rails. extra adds
// routes registered elsewhere, such as auth.SessionRoutes.
func (s *Server) Handler(hub *sentry.Hub, extra ...func(*http.ServeMux)) http.Handler {
	mux := http.NewServeMux()
	s.Register(mux)
	observe.SentryTestRoutes(mux, s.cfg.Sentry, s.cfg.CSRF)
	for _, register := range extra {
		register(mux)
	}
	return observe.LogRequests(observe.Recover(hub, mux))
}

// Register adds the index page, the health checks, the game endpoints and
// the static files to mux.
func (s *Server) Register(mux *http.ServeMux) {
	mux.HandleFunc("GET /up", health)
	mux.HandleFunc("GET /health", health)
	mux.Handle("GET /{$}", s.gameHandler((*call).index))
	for pattern, rt := range s.gameRoutes() {
		mux.Handle(pattern, s.cfg.Authenticate(s.gameHandler(rt.run)))
	}
	mux.Handle("/", staticFiles(s.cfg.PublicDir))
}

// healthPage is what the former Rails::HealthController rendered.
const healthPage = `<!DOCTYPE html><html><body style="background-color: green"></body></html>`

// health answers the deployment health checks without touching Redis.
func health(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Write([]byte(healthPage))
}

// staticFiles serves the regular files in dir to GET and HEAD, like
// ActionDispatch::Static. Anything else is a 404 with an empty body, as
// Rails gives without a public/404.html; directories are not listed.
func staticFiles(dir string) http.Handler {
	files := http.FileServer(http.Dir(dir))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet || r.Method == http.MethodHead {
			name := filepath.Join(dir, filepath.FromSlash(path.Clean("/"+r.URL.Path)))
			if info, err := os.Stat(name); err == nil && info.Mode().IsRegular() {
				files.ServeHTTP(w, r)
				return
			}
		}
		w.WriteHeader(http.StatusNotFound)
	})
}

//go:embed resources/views/*.tmpl
var views embed.FS

var indexPage = template.Must(template.Must(
	template.ParseFS(observe.Views, "views/sentry.tmpl")).ParseFS(views, "resources/views/index.html.tmpl"))

// diseaseColors are the rows of the index page's disease supply.
var diseaseColors = []struct{ Color, Name string }{
	{"blue", "Blue"}, {"yellow", "Yellow"}, {"black", "Black"}, {"red", "Red"},
}

// index is GET /. Like every action of the former Rails app it
// loads the game, so it deals and saves one when there is none.
func (c *call) index() reply {
	data := map[string]any{
		"CSRFToken":  c.s.cfg.CSRF.Token(c.w, c.r),
		"Sentry":     c.s.cfg.Sentry,
		"Production": c.s.cfg.Sentry.Environment == "production",
		"GitHash":    c.s.cfg.GitHash,
		"Colors":     diseaseColors,
	}
	var buf bytes.Buffer
	if err := indexPage.ExecuteTemplate(&buf, "index.html.tmpl", data); err != nil {
		return jsonReply(http.StatusInternalServerError, errorBody(err.Error()))
	}
	return reply{status: http.StatusOK, html: buf.Bytes()}
}
