// Package observe reports errors to Sentry and logs requests (cc-379). It
// replaces the former Rails Sentry initializer and sentry_test_controller.
package observe

import (
	"os"
	"strings"
	"time"

	"github.com/getsentry/sentry-go"
)

// VersionFile holds the deployed commit count (Q7-xx). It is untracked and
// written by the deploy scripts, so it is often missing locally.
const VersionFile = ".version"

// flushTimeout bounds how long a request waits for Sentry to accept an event.
const flushTimeout = 2 * time.Second

// Config is how errors are reported. A blank DSN disables reporting.
type Config struct {
	DSN         string
	Environment string
	Release     string
}

// ConfigFromEnv reads SENTRY_DSN (or its DSN alias, Q13-xx), DEPLOYMENT_ENV
// and the release from versionFile. A missing DEPLOYMENT_ENV means production,
// as for authentication (cc-378); a missing or empty version file means no
// release.
func ConfigFromEnv(getenv func(string) string, versionFile string) Config {
	dsn := strings.TrimSpace(getenv("SENTRY_DSN"))
	if dsn == "" {
		dsn = strings.TrimSpace(getenv("DSN"))
	}
	env := strings.TrimSpace(getenv("DEPLOYMENT_ENV"))
	if env == "" {
		env = "production"
	}
	var release string
	if b, err := os.ReadFile(versionFile); err == nil {
		release = strings.TrimSpace(string(b))
	}
	return Config{DSN: dsn, Environment: env, Release: release}
}

// ClientOptions are the sentry-go options for cfg. Like Rails, no personal
// data is sent.
func (cfg Config) ClientOptions() sentry.ClientOptions {
	return sentry.ClientOptions{
		Dsn:            cfg.DSN,
		Environment:    cfg.Environment,
		Release:        cfg.Release,
		SendDefaultPII: false,
	}
}

// Init configures the global Sentry hub. It succeeds without a DSN; events are
// then dropped.
func Init(cfg Config) error {
	return sentry.Init(cfg.ClientOptions())
}

// reporting reports whether hub sends events anywhere.
func reporting(hub *sentry.Hub) bool {
	client := hub.Client()
	return client != nil && client.Options().Dsn != ""
}
