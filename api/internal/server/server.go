// Package server holds the HTTP plumbing every api/ route shares: authentication, CORS,
// request IDs, one log line per request, and RFC 9457 problem responses.
package server

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"schmegettes/golib/auth"
	"schmegettes/golib/db"
)

// Verifier checks an access token. *auth.Verifier implements it.
type Verifier interface {
	Verify(token string) (auth.Claims, error)
}

type ctxKey int

const (
	claimsKey ctxKey = iota
	requestKey
)

// requestInfo is shared between the logging and auth middleware, so the request line can
// carry the user id found by auth.
type requestInfo struct {
	id     string
	userID string
}

// Claims returns the verified caller. Only valid behind Authenticate.
func Claims(ctx context.Context) auth.Claims {
	c, _ := ctx.Value(claimsKey).(auth.Claims)
	return c
}

// RequestID returns the request's id, or "" outside the logging middleware.
func RequestID(ctx context.Context) string {
	if info, ok := ctx.Value(requestKey).(*requestInfo); ok {
		return info.id
	}
	return ""
}

// public routes need no token.
var public = map[string]bool{"/healthz": true, "/version": true}

// Authenticate requires a valid Bearer token on every route except /healthz and /version.
func Authenticate(v Verifier) func(http.Handler) http.Handler {
	return AuthenticateWithAdminLimit(v, nil)
}

// AuthenticateWithAdminLimit conceals every admin authentication failure as not-found and
// lets the caller rate-limit admin attempts after verification. Non-admin routes keep their
// existing 401 behavior. The callback key is a verified user id or "unauthenticated".
func AuthenticateWithAdminLimit(v Verifier, allowAdmin func(http.ResponseWriter, *http.Request, string) bool) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if public[r.URL.Path] {
				next.ServeHTTP(w, r)
				return
			}
			admin := strings.HasPrefix(r.URL.Path, "/v1/admin/")
			token, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
			if !ok || token == "" {
				if admin {
					if allowAdmin == nil || allowAdmin(w, r, "unauthenticated") {
						NotFound(w, r)
					}
					return
				}
				Problem(w, http.StatusUnauthorized, "unauthorized", "Sign in required")
				return
			}
			claims, err := v.Verify(token)
			if err != nil {
				slog.DebugContext(r.Context(), "token rejected", "err", err, "request_id", RequestID(r.Context()))
				if admin {
					if allowAdmin == nil || allowAdmin(w, r, "unauthenticated") {
						NotFound(w, r)
					}
					return
				}
				Problem(w, http.StatusUnauthorized, "unauthorized", "Sign in required")
				return
			}
			if info, ok := r.Context().Value(requestKey).(*requestInfo); ok {
				info.userID = claims.UserID
			}
			r = r.WithContext(context.WithValue(r.Context(), claimsKey, claims))
			if admin && allowAdmin != nil && !allowAdmin(w, r, claims.UserID) {
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// CORS allows the listed origins and answers preflight requests.
func CORS(origins []string) func(http.Handler) http.Handler {
	allowed := map[string]bool{}
	for _, o := range origins {
		if o = strings.TrimSpace(o); o != "" {
			allowed[o] = true
		}
	}
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			origin := r.Header.Get("Origin")
			if allowed[origin] {
				h := w.Header()
				h.Set("Access-Control-Allow-Origin", origin)
				h.Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
				h.Set("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS")
				h.Set("Access-Control-Expose-Headers", "X-Request-Id")
				h.Add("Vary", "Origin")
			}
			if r.Method == http.MethodOptions && r.Header.Get("Access-Control-Request-Method") != "" {
				w.WriteHeader(http.StatusNoContent)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

type statusWriter struct {
	http.ResponseWriter
	status int
}

func (s *statusWriter) WriteHeader(code int) {
	s.status = code
	s.ResponseWriter.WriteHeader(code)
}

// Log assigns a request id (returned as X-Request-Id) and writes one line per request.
// It never logs headers or bodies.
func Log(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		info := &requestInfo{id: newRequestID()}
		w.Header().Set("X-Request-Id", info.id)
		sw := &statusWriter{ResponseWriter: w, status: http.StatusOK}
		// The database records the id with any audit row the request writes.
		ctx := db.WithRequestID(context.WithValue(r.Context(), requestKey, info), info.id)
		next.ServeHTTP(sw, r.WithContext(ctx))
		attrs := []any{
			"request_id", info.id, "method", r.Method, "route", r.URL.Path,
			"status", sw.status, "duration_ms", time.Since(start).Milliseconds(),
		}
		if info.userID != "" {
			attrs = append(attrs, "user_id", info.userID)
		}
		slog.InfoContext(r.Context(), "request", attrs...)
	})
}

func newRequestID() string {
	b := make([]byte, 8)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// ProblemBase prefixes problem types, e.g. https://schmegettes.dev/problems/room-full.
const ProblemBase = "https://schmegettes.dev/problems/"

// Problem writes an RFC 9457 problem response.
func Problem(w http.ResponseWriter, status int, kind, title string) {
	w.Header().Set("Content-Type", "application/problem+json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]any{"type": ProblemBase + kind, "title": title, "status": status})
}

// NotFound is shared by unknown api paths and concealed admin denials.
func NotFound(w http.ResponseWriter, _ *http.Request) {
	Problem(w, http.StatusNotFound, "not-found", "Not found")
}

// JSON writes a JSON response.
func JSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

// DecodeJSON reads a JSON body, rejecting unknown fields. It answers 400 itself and returns
// false when the body is unusable.
func DecodeJSON(w http.ResponseWriter, r *http.Request, into any) bool {
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, 16<<10))
	dec.DisallowUnknownFields()
	if err := dec.Decode(into); err != nil {
		var maxErr *http.MaxBytesError
		if errors.As(err, &maxErr) {
			Problem(w, http.StatusRequestEntityTooLarge, "too-large", "Request body too large")
			return false
		}
		Problem(w, http.StatusBadRequest, "invalid-request", "Invalid request body")
		return false
	}
	return true
}
