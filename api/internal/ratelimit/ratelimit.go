// Package ratelimit limits how often one player can call an endpoint, to stop code guessing
// (room codes, host codes). Buckets are keyed by the caller's user id: a new anonymous
// identity costs an anonymous sign-in, which Supabase Auth limits per IP, so per-user limits
// also bound one address without trusting a client-IP header.
//
// Buckets live in this process. With more than one api instance, move them to Redis.
package ratelimit

import (
	"log/slog"
	"math"
	"net/http"
	"strconv"
	"sync"
	"time"

	"golang.org/x/time/rate"

	"schmegettes/api/internal/server"
)

// idleAfter is how long an unused bucket is kept. A bucket idle this long is full again
// anyway, so dropping it changes nothing.
const idleAfter = 10 * time.Minute

// Limiter allows perMinute calls per user, with bursts up to burst.
type Limiter struct {
	group string
	every rate.Limit
	burst int
	now   func() time.Time

	mu        sync.Mutex
	buckets   map[string]*bucket
	lastSweep time.Time
}

type bucket struct {
	limiter *rate.Limiter
	seen    time.Time
}

// New returns a limiter for one group of endpoints. The group is the only field logged.
func New(group string, perMinute, burst int) *Limiter {
	return &Limiter{
		group:   group,
		every:   rate.Limit(float64(perMinute) / 60),
		burst:   burst,
		now:     time.Now,
		buckets: map[string]*bucket{},
	}
}

// Allow takes one token for the caller. When none is left it answers 429 with Retry-After
// and returns false; the handler must then stop.
func (l *Limiter) Allow(w http.ResponseWriter, r *http.Request) bool {
	return l.AllowKey(w, r, server.Claims(r.Context()).UserID)
}

// AllowKey applies the limiter to an explicit non-secret key. It is used before admin auth
// completes so invalid tokens share one bounded "unauthenticated" bucket.
func (l *Limiter) AllowKey(w http.ResponseWriter, r *http.Request, key string) bool {
	wait := l.take(key)
	if wait == 0 {
		return true
	}
	// No IP or user id: rejection logs say only which group (security-model.md, Rate limits).
	slog.InfoContext(r.Context(), "rate limited", "group", l.group, "request_id", server.RequestID(r.Context()))
	w.Header().Set("Retry-After", strconv.Itoa(wait))
	server.Problem(w, http.StatusTooManyRequests, "rate-limited", "Too many tries. Wait a minute and try again.")
	return false
}

// take returns 0 when a token was taken, or the whole seconds until one is available.
func (l *Limiter) take(key string) int {
	now := l.now()
	l.mu.Lock()
	defer l.mu.Unlock()
	l.sweep(now)

	b, ok := l.buckets[key]
	if !ok {
		b = &bucket{limiter: rate.NewLimiter(l.every, l.burst)}
		l.buckets[key] = b
	}
	b.seen = now
	res := b.limiter.ReserveN(now, 1)
	delay := res.DelayFrom(now)
	if delay == 0 {
		return 0
	}
	res.CancelAt(now)
	return int(math.Ceil(delay.Seconds()))
}

func (l *Limiter) sweep(now time.Time) {
	if now.Sub(l.lastSweep) < time.Minute {
		return
	}
	l.lastSweep = now
	for key, b := range l.buckets {
		if now.Sub(b.seen) > idleAfter {
			delete(l.buckets, key)
		}
	}
}
