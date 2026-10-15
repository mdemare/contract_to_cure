package observe

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/getsentry/sentry-go"
)

// statusWriter remembers the status a handler sent.
type statusWriter struct {
	http.ResponseWriter
	status int
}

func (w *statusWriter) WriteHeader(status int) {
	if w.status == 0 {
		w.status = status
	}
	w.ResponseWriter.WriteHeader(status)
}

func (w *statusWriter) Write(b []byte) (int, error) {
	if w.status == 0 {
		w.status = http.StatusOK
	}
	return w.ResponseWriter.Write(b)
}

func (w *statusWriter) Unwrap() http.ResponseWriter { return w.ResponseWriter }

func wrap(w http.ResponseWriter) *statusWriter {
	if sw, ok := w.(*statusWriter); ok {
		return sw
	}
	return &statusWriter{ResponseWriter: w}
}

// Recover gives each request its own clone of hub and reports panics to it.
// A panic becomes 500 {success: false, status: 'error', message}, unless the handler already started its response.
func Recover(hub *sentry.Hub, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		reqHub := hub.Clone()
		reqHub.Scope().SetRequest(r)
		ctx := sentry.SetHubOnContext(r.Context(), reqHub)
		sw := wrap(w)
		defer func() {
			v := recover()
			if v == nil {
				return
			}
			// net/http's sentinel for aborting a response is not an error.
			if err, ok := v.(error); ok && errors.Is(err, http.ErrAbortHandler) {
				panic(v)
			}
			reqHub.RecoverWithContext(ctx, v)
			message := fmt.Sprint(v)
			if err, ok := v.(error); ok {
				message = err.Error()
			}
			slog.ErrorContext(ctx, "panic in handler", "method", r.Method, "path", r.URL.Path, "error", message)
			if sw.status != 0 {
				return
			}
			writeJSON(sw, http.StatusInternalServerError, panicBody{Status: "error", Message: message})
		}()
		next.ServeHTTP(sw, r.WithContext(ctx))
	})
}

// LogRequests logs one line per request with its method, path, status,
// duration and outcome: "conflict" for 409, "validation" for 422, "error" for
// 5xx and "ok" otherwise. Put it outside Recover so recovered panics are
// logged with their 500.
func LogRequests(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		sw := wrap(w)
		next.ServeHTTP(sw, r)
		status := sw.status
		if status == 0 {
			status = http.StatusOK
		}
		level := slog.LevelInfo
		if status >= 500 {
			level = slog.LevelError
		}
		slog.Log(r.Context(), level, "request",
			"method", r.Method,
			"path", r.URL.Path,
			"status", status,
			"duration_ms", float64(time.Since(start).Microseconds())/1000,
			"outcome", outcome(status),
		)
	})
}

func outcome(status int) string {
	switch {
	case status == http.StatusConflict:
		return "conflict"
	case status == http.StatusUnprocessableEntity:
		return "validation"
	case status >= 500:
		return "error"
	default:
		return "ok"
	}
}

// LogNewGame is logged when no saved game was found and a new one starts,
// like load_game_state in Rails.
func LogNewGame(ctx context.Context, difficulty string) {
	slog.InfoContext(ctx, "No saved game found in Redis, starting new game", "difficulty", difficulty)
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(body); err != nil {
		slog.Error("writing JSON response", "error", err)
	}
}

// panicBody is the 500 body: the same error shape as the game endpoints.
type panicBody struct {
	Success bool   `json:"success"`
	Status  string `json:"status"`
	Message string `json:"message"`
}
