// Package auth ports JWT authentication (AUTH.md, Q17-cc; cc-423) from
// app/controllers/application_controller.rb and sessions_controller.rb: the
// auth_token cookie check for game endpoints, the /login, /logout and
// /auth/failure routes, and CSRF tokens for the HTML pages.
package auth

import (
	"errors"
	"strings"
)

// Config is how requests are authenticated. Read it once at startup with
// ConfigFromEnv.
type Config struct {
	// Environment is DEPLOYMENT_ENV: development, test, staging or production.
	Environment string
	JWTSecret   []byte
	// SkipAuth (SKIP_AUTH=true) forces the development user and the bypass.
	SkipAuth bool
	// RequireAuth (REQUIRE_AUTH=true) turns the development/test bypass off.
	RequireAuth bool

	AuthServiceURL string
	Subdomain      string
	DomainName     string
}

// ConfigFromEnv reads the auth settings. A missing DEPLOYMENT_ENV means
// production, as for Sentry (src/observe), so a missing variable never
// enables the bypass. JWT_SECRET is required outside development and test;
// unlike Rails there is no credentials fallback.
func ConfigFromEnv(getenv func(string) string) (Config, error) {
	env := strings.TrimSpace(getenv("DEPLOYMENT_ENV"))
	if env == "" {
		env = "production"
	}
	cfg := Config{
		Environment:    env,
		JWTSecret:      []byte(getenv("JWT_SECRET")),
		SkipAuth:       getenv("SKIP_AUTH") == "true",
		RequireAuth:    getenv("REQUIRE_AUTH") == "true",
		AuthServiceURL: getenv("AUTH_SERVICE_URL"),
		Subdomain:      getenv("SUBDOMAIN"),
		DomainName:     getenv("DOMAIN_NAME"),
	}
	if len(cfg.JWTSecret) == 0 && !cfg.development() && !cfg.test() {
		return cfg, errors.New("JWT_SECRET must be set in " + env)
	}
	return cfg, nil
}

func (cfg Config) development() bool { return cfg.Environment == "development" }
func (cfg Config) test() bool        { return cfg.Environment == "test" }

// bypass reports whether game endpoints skip authentication
// (auth_bypass_enabled?).
func (cfg Config) bypass() bool {
	if cfg.RequireAuth {
		return false
	}
	return cfg.SkipAuth || cfg.development() || cfg.test()
}

// developmentUser reports whether a request without a token gets the
// Development User (fallback_user). The legacy session[:user_id] fallback is
// not ported: nothing sets it since OmniAuth was removed.
func (cfg Config) developmentUser() bool {
	return cfg.SkipAuth || cfg.development()
}
