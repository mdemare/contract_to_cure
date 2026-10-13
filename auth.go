package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

type User struct {
	ID             int      `json:"id"`
	Email          string   `json:"email"`
	Name           string   `json:"name"`
	Role           string   `json:"role"`
	AppPermissions []string `json:"app_permissions"`
}

type Claims struct {
	User User `json:"user"`
	jwt.RegisteredClaims
}

// handleLogin redirects the user to the external authentication service with a return URL.
// It reads the AUTH_SERVICE_URL, SUBDOMAIN, and DOMAIN_NAME from environment variables
// to construct the appropriate login and return URLs.
// Returns HTTP 500 if required environment variables are not configured.
func handleLogin(w http.ResponseWriter, r *http.Request) {
	authServiceURL := os.Getenv("AUTH_SERVICE_URL")
	if authServiceURL == "" {
		http.Error(w, "AUTH_SERVICE_URL not configured", http.StatusInternalServerError)
		return
	}

	subdomain := os.Getenv("SUBDOMAIN")
	domainName := os.Getenv("DOMAIN_NAME")
	if subdomain == "" || domainName == "" {
		http.Error(w, "SUBDOMAIN and DOMAIN_NAME must be configured", http.StatusInternalServerError)
		return
	}

	returnURL := fmt.Sprintf("https://%s.%s", subdomain, domainName)
	loginURL := fmt.Sprintf("%s/login?return_url=%s", authServiceURL, returnURL)

	http.Redirect(w, r, loginURL, http.StatusTemporaryRedirect)
}

// requireAuthMiddleware is an HTTP middleware that validates JWT authentication and admin authorization.
// It checks for an auth_token cookie, validates the JWT, verifies the user has admin role,
// and adds the User to the request context if successful.
// Returns HTTP 500 if JWT authentication is not configured, HTTP 401 if authentication
// fails, or HTTP 403 if the user is not an admin.
func requireAuthMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		jwtSecret := []byte(os.Getenv("JWT_SECRET"))
		if len(jwtSecret) == 0 {
			http.Error(w, "Authentication unavailable", http.StatusInternalServerError)
			return
		}

		cookie, err := r.Cookie("auth_token")
		if err != nil || cookie.Value == "" {
			http.Error(w, "Authentication required", http.StatusUnauthorized)
			return
		}

		user, err := ValidateJWT(cookie.Value, jwtSecret)
		if err != nil {
			http.Error(w, "Invalid token", http.StatusUnauthorized)
			return
		}

		if user.Role != "admin" {
			http.Error(w, "Admin access required", http.StatusForbidden)
			return
		}

		ctx := context.WithValue(r.Context(), "user", user)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// ValidateJWT parses and validates a JWT token string using the provided secret.
// It verifies the signing method is HMAC, checks token validity and expiration,
// and returns the User information from the token claims.
// Returns an error if the secret is empty or the token is invalid, expired, or uses an
// unexpected signing method.
func ValidateJWT(tokenString string, jwtSecret []byte) (*User, error) {
	if len(jwtSecret) == 0 {
		return nil, fmt.Errorf("JWT secret must not be empty")
	}

	token, err := jwt.ParseWithClaims(tokenString, &Claims{}, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return jwtSecret, nil
	})

	if err != nil {
		return nil, fmt.Errorf("failed to parse token: %w", err)
	}

	if claims, ok := token.Claims.(*Claims); ok && token.Valid {
		if claims.ExpiresAt != nil && claims.ExpiresAt.Before(time.Now()) {
			return nil, fmt.Errorf("token has expired")
		}
		return &claims.User, nil
	}

	return nil, fmt.Errorf("invalid token")
}
