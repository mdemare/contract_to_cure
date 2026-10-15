// Command main is the Go port of the former Rails backend (epic cc-368). `make`
// builds it and the Docker image runs it (cc-425). The Rails code was removed
// in cc-428; see git history before that commit.
package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/getsentry/sentry-go"

	"github.com/mdemare/contract_to_cure/src/auth"
	"github.com/mdemare/contract_to_cure/src/game"
	"github.com/mdemare/contract_to_cure/src/observe"
	"github.com/mdemare/contract_to_cure/src/store"
	"github.com/mdemare/contract_to_cure/src/web"
)

// gitHash is shown on the index page in production. Set it at build time with
// -ldflags "-X main.gitHash=<hash>" (make build passes the short SHA of HEAD);
// without it the release from .version is shown.
var gitHash string

// shutdownTimeout bounds how long requests in flight may finish after
// SIGTERM.
const shutdownTimeout = 25 * time.Second

func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, nil)))

	port := os.Getenv("PORT")
	if port == "" {
		port = "2583"
	}

	sentryConfig := observe.ConfigFromEnv(os.Getenv, observe.VersionFile)
	if err := observe.Init(sentryConfig); err != nil {
		slog.Error("initializing Sentry", "error", err)
	}

	authConfig, err := auth.ConfigFromEnv(os.Getenv)
	if err != nil {
		slog.Error("configuring authentication", "error", err)
		os.Exit(1)
	}

	st, err := store.New(store.ConfigFromEnv(os.Getenv))
	if err != nil {
		slog.Error("configuring Redis", "error", err)
		os.Exit(1)
	}
	defer st.Close()

	board, err := game.LoadMapFile("public/cities.json")
	if err != nil {
		slog.Error("loading the map", "error", err)
		os.Exit(1)
	}

	if gitHash == "" {
		gitHash = sentryConfig.Release
	}
	handler := newHandler(authConfig, web.Config{
		Store:   st,
		Map:     board,
		Sentry:  sentryConfig,
		GitHash: gitHash,
	}, sentry.CurrentHub())
	srv := &http.Server{Addr: ":" + port, Handler: handler}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGTERM, os.Interrupt)
	defer stop()
	stopped := make(chan struct{})
	go func() {
		defer close(stopped)
		<-ctx.Done()
		slog.Info("shutting down")
		shutdownCtx, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
		defer cancel()
		if err := srv.Shutdown(shutdownCtx); err != nil {
			slog.Error("shutting down", "error", err)
		}
	}()

	slog.Info("listening", "port", port, "environment", sentryConfig.Environment, "release", sentryConfig.Release)
	if err := srv.ListenAndServe(); !errors.Is(err, http.ErrServerClosed) {
		slog.Error("server stopped", "error", err)
		os.Exit(1)
	}
	<-stopped
}

// newHandler is the app as main serves it: cfg with authentication and CSRF
// from authConfig, plus the session routes. The game endpoints get
// authenticate_request! and current_user; their JSON POSTs skip CSRF, as
// GameController skips verify_authenticity_token (cc-456).
func newHandler(authConfig auth.Config, cfg web.Config, hub *sentry.Hub) http.Handler {
	a := auth.New(authConfig)
	cfg.Authenticate = a.Require
	cfg.CurrentUser = func(r *http.Request) any {
		if user, _ := a.CurrentUser(r); user != nil {
			return user
		}
		return nil
	}
	cfg.CSRF = auth.NewCSRF(authConfig)
	sessionRoutes := func(mux *http.ServeMux) { auth.SessionRoutes(mux, authConfig) }
	return web.New(cfg).Handler(hub, sessionRoutes)
}
