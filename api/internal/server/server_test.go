package server

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"schmegettes/golib/auth"
)

type verifier struct{}

func (verifier) Verify(token string) (auth.Claims, error) {
	if token == "good" {
		return auth.Claims{UserID: "u1"}, nil
	}
	return auth.Claims{}, auth.ErrInvalidToken
}

func app() http.Handler {
	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(Claims(r.Context()).UserID))
	})
	return Log(CORS([]string{"http://localhost:5173"})(Authenticate(verifier{})(inner)))
}

func TestAuthenticate(t *testing.T) {
	for header, want := range map[string]int{"": 401, "Bearer bad": 401, "Basic good": 401, "Bearer good": 200} {
		req := httptest.NewRequest("GET", "/v1/rooms/by-code/AAAAA", nil)
		if header != "" {
			req.Header.Set("Authorization", header)
		}
		rec := httptest.NewRecorder()
		app().ServeHTTP(rec, req)
		if rec.Code != want {
			t.Errorf("%q: %d, want %d", header, rec.Code, want)
		}
		if want == 401 && rec.Header().Get("Content-Type") != "application/problem+json" {
			t.Errorf("%q: content type %q", header, rec.Header().Get("Content-Type"))
		}
	}
	rec := httptest.NewRecorder()
	app().ServeHTTP(rec, httptest.NewRequest("GET", "/healthz", nil))
	if rec.Code != 200 {
		t.Errorf("/healthz needs no token, got %d", rec.Code)
	}
	if rec.Header().Get("X-Request-Id") == "" {
		t.Error("no request id")
	}
}

func TestCORS(t *testing.T) {
	req := httptest.NewRequest("OPTIONS", "/v1/rooms", nil)
	req.Header.Set("Origin", "http://localhost:5173")
	req.Header.Set("Access-Control-Request-Method", "POST")
	rec := httptest.NewRecorder()
	app().ServeHTTP(rec, req)
	if rec.Code != 204 || rec.Header().Get("Access-Control-Allow-Origin") != "http://localhost:5173" {
		t.Errorf("preflight: %d %v", rec.Code, rec.Header())
	}

	req.Header.Set("Origin", "https://evil.test")
	rec = httptest.NewRecorder()
	app().ServeHTTP(rec, req)
	if rec.Header().Get("Access-Control-Allow-Origin") != "" {
		t.Error("unknown origin allowed")
	}
}

func TestDecodeJSONRejectsUnknownFields(t *testing.T) {
	rec := httptest.NewRecorder()
	var into struct{ A string }
	if DecodeJSON(rec, httptest.NewRequest("POST", "/", strings.NewReader(`{"A":"x","B":1}`)), &into) || rec.Code != 400 {
		t.Errorf("accepted unknown field: %d", rec.Code)
	}
}
