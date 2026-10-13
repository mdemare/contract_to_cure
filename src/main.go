// Command main is the Go port of the Rails backend (epic cc-368). It is built
// and tested next to Rails but not deployed until the cutover ticket.
package main

import (
	"log/slog"
	"net/http"
	"os"

	"github.com/getsentry/sentry-go"

	"github.com/mdemare/contract_to_cure/src/observe"
)

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

	mux := http.NewServeMux()
	mux.HandleFunc("GET /up", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	observe.SentryTestRoutes(mux, sentryConfig)

	handler := observe.LogRequests(observe.Recover(sentry.CurrentHub(), mux))
	slog.Info("listening", "port", port, "environment", sentryConfig.Environment, "release", sentryConfig.Release)
	if err := http.ListenAndServe(":"+port, handler); err != nil {
		slog.Error("server stopped", "error", err)
		os.Exit(1)
	}
}
