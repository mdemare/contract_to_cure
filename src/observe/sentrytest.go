package observe

import (
	"embed"
	"errors"
	"html/template"
	"log/slog"
	"net/http"

	"github.com/getsentry/sentry-go"
)

//go:embed views/*.tmpl
var views embed.FS

var sentryTestPage = template.Must(template.ParseFS(views, "views/*.tmpl"))

// backendTestError is the message of the error /test-sentry/backend-error reports.
const backendTestError = "Sentry backend test error"

// SentryTestRoutes adds the Sentry smoke test page and its backend error. Like
// SentryTestController, they skip authentication and the atomic game update,
// so register them on a mux outside those wrappers.
func SentryTestRoutes(mux *http.ServeMux, cfg Config) {
	mux.HandleFunc("GET /test-sentry", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		// The CSRF token stays empty until the HTTP layer (cc-377) adds one.
		data := map[string]any{"Sentry": cfg, "CSRFToken": ""}
		if err := sentryTestPage.ExecuteTemplate(w, "sentry_test.tmpl", data); err != nil {
			slog.ErrorContext(r.Context(), "rendering /test-sentry", "error", err)
		}
	})
	mux.HandleFunc("POST /test-sentry/backend-error", backendError)
}

// backendError reports an error to Sentry and answers 500 with the event ID,
// which is null when Sentry is not configured.
func backendError(w http.ResponseWriter, r *http.Request) {
	hub := sentry.GetHubFromContext(r.Context())
	if hub == nil {
		hub = sentry.CurrentHub()
	}
	err := errors.New(backendTestError)
	var eventID *string
	if reporting(hub) {
		if id := hub.CaptureException(err); id != nil {
			s := string(*id)
			eventID = &s
			hub.Flush(flushTimeout)
		}
	}
	writeJSON(w, http.StatusInternalServerError, map[string]any{
		"error":           err.Error(),
		"sentry_event_id": eventID,
	})
}
