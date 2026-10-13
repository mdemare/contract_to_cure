package auth

import (
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
)

// csrfServer is a page that renders a token and a POST that Protect guards.
func csrfServer(c *CSRF) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /page", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(c.Token(w, r)))
	})
	mux.Handle("POST /protected", c.Protect(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})))
	return mux
}

// page fetches a token and the secret cookie it came with.
func page(t *testing.T, h http.Handler, cookies ...*http.Cookie) (string, []*http.Cookie) {
	t.Helper()
	req := httptest.NewRequest("GET", "/page", nil)
	for _, c := range cookies {
		req.AddCookie(c)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec.Body.String(), rec.Result().Cookies()
}

func post(h http.Handler, header, form string, cookies []*http.Cookie) *httptest.ResponseRecorder {
	req := httptest.NewRequest("POST", "/protected", strings.NewReader(form))
	if form != "" {
		req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	}
	if header != "" {
		req.Header.Set("X-CSRF-Token", header)
	}
	for _, c := range cookies {
		req.AddCookie(c)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func TestCSRFTokenIsAccepted(t *testing.T) {
	h := csrfServer(NewCSRF(Config{Environment: "production"}))
	token, cookies := page(t, h)
	if len(cookies) != 1 || cookies[0].Name != "csrf_token" || !cookies[0].HttpOnly || !cookies[0].Secure || cookies[0].SameSite != http.SameSiteLaxMode {
		t.Fatalf("cookies %+v", cookies)
	}
	if rec := post(h, token, "", cookies); rec.Code != http.StatusOK {
		t.Errorf("header token: status %d", rec.Code)
	}
	if rec := post(h, "", "authenticity_token="+url.QueryEscape(token), cookies); rec.Code != http.StatusOK {
		t.Errorf("form token: status %d", rec.Code)
	}
}

func TestCSRFTokensAreMaskedPerPage(t *testing.T) {
	h := csrfServer(NewCSRF(Config{Environment: "production"}))
	first, cookies := page(t, h)
	second, again := page(t, h, cookies...)
	if first == second {
		t.Error("the same token twice; want a fresh mask")
	}
	if len(again) != 0 {
		t.Errorf("secret cookie set again: %+v", again)
	}
	if rec := post(h, first, "", cookies); rec.Code != http.StatusOK {
		t.Errorf("older token: status %d", rec.Code)
	}
}

func TestCSRFRejectsMissingOrForeignToken(t *testing.T) {
	h := csrfServer(NewCSRF(Config{Environment: "development"}))
	token, cookies := page(t, h)
	if cookies[0].Secure {
		t.Error("development cookie is Secure")
	}
	_, otherCookies := page(t, h)
	for name, rec := range map[string]*httptest.ResponseRecorder{
		"no token":       post(h, "", "", cookies),
		"no cookie":      post(h, token, "", nil),
		"other secret":   post(h, token, "", otherCookies),
		"garbage token":  post(h, "not-a-token", "", cookies),
		"unmasked token": post(h, cookies[0].Value, "", cookies),
	} {
		t.Run(name, func(t *testing.T) {
			assertError(t, rec, 422, "Can't verify CSRF token authenticity.")
		})
	}
}

func TestCSRFIsOffInTest(t *testing.T) {
	h := csrfServer(NewCSRF(Config{Environment: "test"}))
	if rec := post(h, "", "", nil); rec.Code != http.StatusOK {
		t.Errorf("status %d", rec.Code)
	}
}
