package main

import (
	"bytes"
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"schmegettes/api/internal/admin"
	"schmegettes/golib/auth"
)

// Tokens the fake verifier accepts, and which of them is on the admin list.
const (
	adminID    = "11111111-1111-4111-8111-111111111111"
	nonAdminID = "22222222-2222-4222-8222-222222222222"
	guestID    = "33333333-3333-4333-8333-333333333333"
)

type tokens struct{}

func (tokens) Verify(token string) (auth.Claims, error) {
	id := map[string]string{"admin": adminID, "member": nonAdminID, "guest": guestID}[token]
	if id == "" {
		return auth.Claims{}, errors.New("bad token")
	}
	return auth.Claims{UserID: id, Raw: []byte(`{}`)}, nil
}

// adminStore stands in for the database: only adminID passes the allowlist.
type adminStore struct{}

func check(c auth.Claims) error {
	if c.UserID != adminID {
		return admin.ErrNotFound
	}
	return nil
}
func (adminStore) CurrentCode(_ context.Context, c auth.Claims) (admin.HostCode, error) {
	return admin.HostCode{Code: "K7RXM2PQ"}, check(c)
}
func (adminStore) Rotate(_ context.Context, c auth.Claims, _ string) (admin.HostCode, error) {
	return admin.HostCode{Code: "K7RXM2PQ"}, check(c)
}
func (adminStore) Hosts(_ context.Context, c auth.Claims) ([]admin.Host, error) { return nil, check(c) }
func (adminStore) SetNote(_ context.Context, c auth.Claims, _ string, _ *string) (admin.Host, error) {
	return admin.Host{}, check(c)
}
func (adminStore) Remove(_ context.Context, c auth.Claims, _ string) error { return check(c) }
func (adminStore) CleanupRuns(_ context.Context, c auth.Claims) ([]admin.CleanupRun, error) {
	return nil, check(c)
}
func (adminStore) MarkQA(_ context.Context, c auth.Claims, _ []admin.QAAccount) error {
	return check(c)
}
func (adminStore) CleanupQA(_ context.Context, c auth.Claims, _ int, _ bool) ([]admin.QACleanupItem, error) {
	return nil, check(c)
}

func app() http.Handler {
	return handler(routes{admin: admin.Handler{Store: adminStore{}}, limits: newLimits()}, tokens{}, []string{"http://localhost:5174"})
}

func do(h http.Handler, method, path, token, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, bytes.NewBufferString(body))
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

var adminCalls = []struct{ method, path, body string }{
	{"GET", "/v1/admin/host-code", ""},
	{"POST", "/v1/admin/host-code/rotate", `{"expectedCode":"K7RXM2PQ"}`},
	{"GET", "/v1/admin/hosts", ""},
	{"PATCH", "/v1/admin/hosts/" + nonAdminID, `{"note":"x"}`},
	{"DELETE", "/v1/admin/hosts/" + nonAdminID, ""},
	{"GET", "/v1/admin/cleanup-runs", ""},
	{"POST", "/v1/admin/qa-accounts", `{"accounts":[{"userId":"22222222-2222-4222-8222-222222222222","role":"contestant","label":"QA 1"}]}`},
	{"POST", "/v1/admin/qa-cleanup", `{"olderThanHours":0,"dryRun":true}`},
}

// Everyone but an admin gets exactly what an unknown path gets: same status, type, and body.
func TestAdminDenialsLookLikeAMissingPage(t *testing.T) {
	missing := do(app(), "GET", "/v1/no-such-page", "member", "")
	if missing.Code != http.StatusNotFound {
		t.Fatalf("unknown path → %d", missing.Code)
	}
	for _, token := range []string{"", "bad", "guest", "member"} {
		for _, c := range adminCalls {
			rec := do(app(), c.method, c.path, token, c.body) // a fresh limiter per call
			if rec.Code != missing.Code || rec.Header().Get("Content-Type") != missing.Header().Get("Content-Type") ||
				!bytes.Equal(rec.Body.Bytes(), missing.Body.Bytes()) {
				t.Errorf("token %q %s %s → %d %s, want the unknown-path response %s",
					token, c.method, c.path, rec.Code, rec.Body, missing.Body)
			}
		}
	}
}

func TestAdminSucceeds(t *testing.T) {
	for _, c := range adminCalls {
		if rec := do(app(), c.method, c.path, "admin", c.body); rec.Code >= 300 {
			t.Errorf("%s %s → %d %s", c.method, c.path, rec.Code, rec.Body)
		}
	}
}

// Other routes keep answering 401 without a token.
func TestOtherRoutesStill401(t *testing.T) {
	if rec := do(app(), "GET", "/v1/host-access", "", ""); rec.Code != http.StatusUnauthorized {
		t.Errorf("→ %d", rec.Code)
	}
}

func TestAdminRateLimit(t *testing.T) {
	for _, token := range []string{"admin", "", "bad"} {
		h := app()
		for i := range 5 {
			if rec := do(h, "GET", "/v1/admin/hosts", token, ""); rec.Code == http.StatusTooManyRequests {
				t.Fatalf("token %q: limited after %d calls", token, i)
			}
		}
		rec := do(h, "GET", "/v1/admin/hosts", token, "")
		if rec.Code != http.StatusTooManyRequests || rec.Header().Get("Retry-After") == "" {
			t.Errorf("token %q: 6th call → %d, Retry-After %q", token, rec.Code, rec.Header().Get("Retry-After"))
		}
	}
	// Missing and bad tokens share one bucket; an admin's own bucket is separate.
	h := app()
	for range 5 {
		do(h, "GET", "/v1/admin/hosts", "bad", "")
	}
	if rec := do(h, "GET", "/v1/admin/hosts", "", ""); rec.Code != http.StatusTooManyRequests {
		t.Errorf("unauthenticated attempts should share a bucket: %d", rec.Code)
	}
	if rec := do(h, "GET", "/v1/admin/hosts", "admin", ""); rec.Code != http.StatusOK {
		t.Errorf("admin limited by others: %d", rec.Code)
	}
}
