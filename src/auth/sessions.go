package auth

import (
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"time"
)

// SessionRoutes adds GET /login, DELETE /logout and GET /auth/failure
// (the former Rails SessionsController). They are not authenticated and do not touch Redis.
func SessionRoutes(mux *http.ServeMux, cfg Config) {
	mux.HandleFunc("GET /login", cfg.login)
	mux.HandleFunc("DELETE /logout", cfg.logout)
	mux.HandleFunc("GET /auth/failure", failure)
}

// login redirects to the auth service, which sends the user back to
// https://{SUBDOMAIN}.{DOMAIN_NAME}. A missing variable is a 500 with the
// message of Rails' ENV.fetch.
func (cfg Config) login(w http.ResponseWriter, r *http.Request) {
	for _, v := range []struct{ name, value string }{
		{"AUTH_SERVICE_URL", cfg.AuthServiceURL},
		{"SUBDOMAIN", cfg.Subdomain},
		{"DOMAIN_NAME", cfg.DomainName},
	} {
		if v.value == "" {
			writeJSON(w, http.StatusInternalServerError,
				errorBody{Status: "error", Message: fmt.Sprintf("key not found: %q", v.name)})
			return
		}
	}
	returnURL := "https://" + cfg.Subdomain + "." + cfg.DomainName
	http.Redirect(w, r, cfg.AuthServiceURL+"/login?return_url="+url.QueryEscape(returnURL), http.StatusFound)
}

// logout deletes auth_token on .{DOMAIN_NAME} (or the host without
// DOMAIN_NAME) and redirects to /.
func (cfg Config) logout(w http.ResponseWriter, r *http.Request) {
	cookie := &http.Cookie{Name: CookieName, Path: "/", MaxAge: -1, Expires: time.Unix(0, 0)}
	if cfg.DomainName != "" {
		cookie.Domain = "." + cfg.DomainName
	}
	http.SetCookie(w, cookie)
	http.Redirect(w, r, "/", http.StatusFound)
}

// failure logs the auth service's message and redirects to /.
func failure(w http.ResponseWriter, r *http.Request) {
	slog.ErrorContext(r.Context(), "authentication failure", "message", r.URL.Query().Get("message"))
	http.Redirect(w, r, "/", http.StatusFound)
}
