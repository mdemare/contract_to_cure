package auth

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"

	"github.com/golang-jwt/jwt/v5"
)

// Messages of the 401 responses and token errors.
const (
	msgRequired = "Authentication required"
	msgExpired  = "Authentication token has expired"
	msgInvalid  = "Invalid authentication token"
)

// CookieName is the cookie the auth service sets on .{DOMAIN_NAME}.
const CookieName = "auth_token"

var (
	// ErrExpired is a token whose exp has passed.
	ErrExpired = errors.New(msgExpired)
	// ErrInvalid is any other bad token, including one without user.id.
	ErrInvalid = errors.New(msgInvalid)
)

// User is current_user as game_state.json renders it. Email and Name are the
// claim values as given (null when missing), like the Rails hash.
type User struct {
	UID   string `json:"uid"`
	Email any    `json:"email"`
	Name  any    `json:"name"`
}

// DevelopmentUser is the user of SKIP_AUTH=true and the development
// environment.
var DevelopmentUser = User{UID: "dev_user", Email: "dev@example.com", Name: "Development User"}

// ValidateJWT verifies an HS256 token signed with secret and returns its
// user. It returns ErrExpired or ErrInvalid. As with ruby-jwt, exp and nbf
// are checked when present and iat is not.
func ValidateJWT(tokenString string, secret []byte) (*User, error) {
	if len(secret) == 0 {
		return nil, ErrInvalid
	}
	claims := jwt.MapClaims{}
	_, err := jwt.ParseWithClaims(tokenString, claims, func(*jwt.Token) (any, error) {
		return secret, nil
	}, jwt.WithValidMethods([]string{"HS256"}), jwt.WithJSONNumber())
	if errors.Is(err, jwt.ErrTokenExpired) {
		return nil, ErrExpired
	}
	if err != nil {
		return nil, ErrInvalid
	}
	data, _ := claims["user"].(map[string]any)
	uid, ok := uidString(data["id"])
	if !ok {
		return nil, ErrInvalid
	}
	return &User{UID: uid, Email: data["email"], Name: data["name"]}, nil
}

// uidString is user_data['id'].to_s, and false when the id is blank.
func uidString(id any) (string, bool) {
	switch v := id.(type) {
	case string:
		return v, strings.TrimSpace(v) != ""
	case json.Number:
		return v.String(), true
	case bool:
		return "true", v
	}
	return "", false
}

// Authenticator decides who sends a request (current_user) and guards the
// game endpoints (authenticate_request!).
type Authenticator struct {
	cfg Config
}

// New returns an Authenticator for cfg.
func New(cfg Config) *Authenticator {
	return &Authenticator{cfg: cfg}
}

// CurrentUser returns the token's user, or the Development User when there
// is no token and the config allows it. Without a user, the message says
// why. A bad token never falls back to the Development User.
func (a *Authenticator) CurrentUser(r *http.Request) (*User, string) {
	if cookie, err := r.Cookie(CookieName); err == nil && strings.TrimSpace(cookie.Value) != "" {
		user, err := ValidateJWT(cookie.Value, a.cfg.JWTSecret)
		if err != nil {
			return nil, err.Error()
		}
		return user, ""
	}
	if a.cfg.developmentUser() {
		user := DevelopmentUser
		return &user, ""
	}
	return nil, msgRequired
}

type userKey struct{}

// UserFromContext is current_user for a request that passed Require. It is
// nil when the bypass let a request without a user through.
func UserFromContext(ctx context.Context) *User {
	user, _ := ctx.Value(userKey{}).(*User)
	return user
}

// Require answers 401 {status: "error", message} unless the request has a
// user or the bypass is on. Like Rails' prepend_before_action, wrap it
// outside the atomic game update, so a rejected request never reads Redis.
func (a *Authenticator) Require(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		user, message := a.CurrentUser(r)
		if user == nil && !a.cfg.bypass() {
			writeJSON(w, http.StatusUnauthorized, errorBody{Status: "error", Message: message})
			return
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), userKey{}, user)))
	})
}

// errorBody is Rails' {status: 'error', message} in that key order.
type errorBody struct {
	Status  string `json:"status"`
	Message string `json:"message"`
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(body); err != nil {
		slog.Error("writing JSON response", "error", err)
	}
}
