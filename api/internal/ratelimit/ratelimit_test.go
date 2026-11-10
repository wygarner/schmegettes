package ratelimit

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"schmegettes/api/internal/server"
	"schmegettes/golib/auth"
)

type clock struct{ t time.Time }

func (c *clock) now() time.Time        { return c.t }
func (c *clock) add(d time.Duration)   { c.t = c.t.Add(d) }
func newTestLimiter(c *clock) *Limiter { l := New("test", 10, 10); l.now = c.now; return l }
func start() *clock                    { return &clock{t: time.Date(2026, 11, 10, 12, 0, 0, 0, time.UTC)} }
func takeN(l *Limiter, key string, n int) (allowed int) {
	for range n {
		if l.take(key) == 0 {
			allowed++
		}
	}
	return allowed
}

func TestBurstThenRefill(t *testing.T) {
	c := start()
	l := newTestLimiter(c)
	if got := takeN(l, "alice", 11); got != 10 {
		t.Fatalf("burst allowed %d, want 10", got)
	}
	if wait := l.take("alice"); wait != 6 {
		t.Errorf("wait %ds, want 6 (10 per minute)", wait)
	}
	c.add(6 * time.Second)
	if l.take("alice") != 0 {
		t.Error("a token should be back after 6 s")
	}
}

func TestUsersAreLimitedSeparately(t *testing.T) {
	l := newTestLimiter(start())
	takeN(l, "alice", 10)
	if l.take("bob") != 0 {
		t.Error("bob is limited by alice's tries")
	}
}

func TestRejectedTriesDoNotQueue(t *testing.T) {
	c := start()
	l := newTestLimiter(c)
	takeN(l, "alice", 10)
	takeN(l, "alice", 50) // all refused; they must not push the next token further out
	c.add(6 * time.Second)
	if l.take("alice") != 0 {
		t.Error("refused tries delayed the refill")
	}
}

func TestIdleBucketsAreDropped(t *testing.T) {
	c := start()
	l := newTestLimiter(c)
	takeN(l, "alice", 3)
	c.add(idleAfter + 2*time.Minute)
	l.take("bob")
	if _, ok := l.buckets["alice"]; ok {
		t.Error("idle bucket kept")
	}
	if len(l.buckets) != 1 {
		t.Errorf("%d buckets, want 1", len(l.buckets))
	}
}

func TestAllowAnswers429WithRetryAfter(t *testing.T) {
	l := newTestLimiter(start())
	h := server.Authenticate(alice{})(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if l.Allow(w, r) {
			w.WriteHeader(http.StatusNoContent)
		}
	}))
	var last *httptest.ResponseRecorder
	for range 11 {
		req := httptest.NewRequest("POST", "/v1/rooms/join", nil)
		req.Header.Set("Authorization", "Bearer x")
		last = httptest.NewRecorder()
		h.ServeHTTP(last, req)
	}
	if last.Code != http.StatusTooManyRequests {
		t.Fatalf("11th call: %d", last.Code)
	}
	if last.Header().Get("Retry-After") != "6" {
		t.Errorf("Retry-After %q", last.Header().Get("Retry-After"))
	}
	if !strings.Contains(last.Body.String(), "/problems/rate-limited") {
		t.Errorf("body %s", last.Body)
	}
}

type alice struct{}

func (alice) Verify(string) (auth.Claims, error) {
	return auth.Claims{UserID: "11111111-1111-4111-8111-111111111111", Raw: []byte(`{}`)}, nil
}
