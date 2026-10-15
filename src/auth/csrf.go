package auth

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"net/http"
)

const (
	csrfCookie   = "csrf_token"
	csrfHeader   = "X-CSRF-Token"
	csrfParam    = "authenticity_token"
	csrfLength   = 32
	csrfRejected = "Can't verify CSRF token authenticity."
)

// CSRF is Rails' protect_from_forgery for the HTML pages and the requests
// they send. The secret lives in an HttpOnly cookie instead of the Rails
// session, and pages get a masked copy, as with form_authenticity_token.
//
// Only routes that Rails verifies are wrapped with Protect: today that is
// POST /test-sentry/backend-error. Game JSON endpoints skip it
// (GameController skip_before_action :verify_authenticity_token, AUTH.md),
// and so does DELETE /logout.
type CSRF struct {
	enabled bool
	secure  bool
}

// NewCSRF returns the CSRF protection for cfg. As in the former Rails test
// environment (allow_forgery_protection = false), the test environment does
// not verify tokens.
func NewCSRF(cfg Config) *CSRF {
	return &CSRF{enabled: !cfg.test(), secure: !cfg.development() && !cfg.test()}
}

// Token returns a masked token for a page's csrf-token meta tag, and sets
// the secret cookie when the request has none.
func (c *CSRF) Token(w http.ResponseWriter, r *http.Request) string {
	secret, ok := c.secret(r)
	if !ok {
		secret = make([]byte, csrfLength)
		rand.Read(secret)
		http.SetCookie(w, &http.Cookie{
			Name:     csrfCookie,
			Value:    base64.RawURLEncoding.EncodeToString(secret),
			Path:     "/",
			HttpOnly: true,
			Secure:   c.secure,
			SameSite: http.SameSiteLaxMode,
		})
	}
	pad := make([]byte, csrfLength)
	rand.Read(pad)
	masked := make([]byte, 0, 2*csrfLength)
	masked = append(masked, pad...)
	for i := range secret {
		masked = append(masked, pad[i]^secret[i])
	}
	return base64.RawURLEncoding.EncodeToString(masked)
}

// Protect answers 422 {status: "error", message} to a request other than
// GET or HEAD that does not carry a valid token in the X-CSRF-Token header
// or the authenticity_token form field.
func (c *CSRF) Protect(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if c.enabled && r.Method != http.MethodGet && r.Method != http.MethodHead && !c.valid(r) {
			writeJSON(w, http.StatusUnprocessableEntity, errorBody{Status: "error", Message: csrfRejected})
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (c *CSRF) secret(r *http.Request) ([]byte, bool) {
	cookie, err := r.Cookie(csrfCookie)
	if err != nil {
		return nil, false
	}
	secret, err := base64.RawURLEncoding.DecodeString(cookie.Value)
	return secret, err == nil && len(secret) == csrfLength
}

func (c *CSRF) valid(r *http.Request) bool {
	secret, ok := c.secret(r)
	if !ok {
		return false
	}
	token := r.Header.Get(csrfHeader)
	if token == "" {
		token = r.PostFormValue(csrfParam)
	}
	masked, err := base64.RawURLEncoding.DecodeString(token)
	if err != nil || len(masked) != 2*csrfLength {
		return false
	}
	unmasked := make([]byte, csrfLength)
	for i := range unmasked {
		unmasked[i] = masked[i] ^ masked[csrfLength+i]
	}
	return subtle.ConstantTimeCompare(unmasked, secret) == 1
}
