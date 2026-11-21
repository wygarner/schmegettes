package main

import (
	"net/http"
	"net/http/httptest"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/getkin/kin-openapi/openapi3"

	"schmegettes/api/internal/ratelimit"
	"schmegettes/api/internal/server"
	"schmegettes/golib/auth"
)

// Every operation in the contract lands in a limiter group; only /healthz and /version are
// exempt, and admin routes are limited during authentication.
func TestEveryRouteHasAGroup(t *testing.T) {
	doc, err := openapi3.NewLoader().LoadFromFile("../../internal/contracts/openapi30.gen.yaml")
	if err != nil {
		t.Fatal(err)
	}
	want := map[string]string{
		"GET /healthz":                   "",
		"GET /version":                   "",
		"PATCH /v1/rooms/{roomId}":       "room-options",
		"POST /v1/rooms/join":            "join",
		"GET /v1/rooms/by-code/{code}":   "join",
		"POST /v1/games/{gameId}/resume": "join",
		"POST /v1/host-access/redeem":    "host-code",
		"DELETE /v1/me":                  "account",
		"POST /v1/me/merge-tickets":      "account",
		"POST /v1/me/merge":              "account",
	}
	l := newLimits()
	var ops []string
	for path, item := range doc.Paths.Map() {
		for method := range item.Operations() {
			ops = append(ops, method+" "+path)
		}
	}
	sort.Strings(ops)
	if len(ops) < 25 {
		t.Fatalf("only %d operations found", len(ops))
	}
	for _, op := range ops {
		method, path, _ := strings.Cut(op, " ")
		concrete := path
		for _, p := range []string{"{roomId}", "{gameId}", "{userId}", "{grantId}"} {
			concrete = strings.ReplaceAll(concrete, p, "22222222-2222-4222-8222-222222222222")
		}
		concrete = strings.ReplaceAll(concrete, "{code}", "ABCDE")
		got := routeGroup(httptest.NewRequest(method, concrete, nil))

		expected, listed := want[op]
		switch {
		case listed:
		case strings.HasPrefix(path, "/v1/admin/"):
			expected = "admin"
		case method == http.MethodGet:
			expected = "read"
		default:
			expected = "write"
		}
		if got != expected {
			t.Errorf("%s → group %q, want %q", op, got, expected)
		}
		if got != "" && got != "admin" && l.group(got) == nil {
			t.Errorf("%s → group %q has no limiter", op, got)
		}
	}
	if g := routeGroup(httptest.NewRequest("GET", "/v1/no-such-page", nil)); g != "read" {
		t.Errorf("unknown paths are limited too: %q", g)
	}
}

// anyUser accepts any token as that user's id.
type anyUser struct{}

func (anyUser) Verify(token string) (auth.Claims, error) {
	return auth.Claims{UserID: token, Raw: []byte(`{}`)}, nil
}

type fakeClock struct{ t time.Time }

func (c *fakeClock) now() time.Time { return c.t }

// limited runs requests through real authentication and the limiter, with a handler that
// always succeeds, on a clock the test moves.
func limited(t *testing.T) (http.Handler, *fakeClock) {
	t.Helper()
	l := newLimits()
	c := &fakeClock{t: time.Date(2026, 11, 21, 19, 0, 0, 0, time.UTC)}
	for _, lim := range []*ratelimit.Limiter{l.read, l.write, l.roomOptions, l.join, l.hostCode, l.account, l.admin} {
		lim.SetClock(c.now)
	}
	ok := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) })
	return server.Authenticate(anyUser{})(l.limit(ok)), c
}

// One user hammering a route gets the group's burst, then 429 with Retry-After.
func TestOneUserIsLimitedPerGroup(t *testing.T) {
	cases := []struct {
		method, path string
		burst        int
	}{
		{"GET", "/v1/me", 40},
		{"PATCH", "/v1/me", 20},
		{"POST", "/v1/rooms", 20},
		{"PATCH", "/v1/rooms/22222222-2222-4222-8222-222222222222", 40},
		{"POST", "/v1/rooms/join", 10},
		{"POST", "/v1/host-access/redeem", 5},
		{"POST", "/v1/me/merge", 3},
	}
	for _, c := range cases {
		h, _ := limited(t)
		for i := range c.burst {
			if rec := do(h, c.method, c.path, "hammer", ""); rec.Code != http.StatusOK {
				t.Fatalf("%s %s: call %d → %d", c.method, c.path, i+1, rec.Code)
			}
		}
		rec := do(h, c.method, c.path, "hammer", "")
		if rec.Code != http.StatusTooManyRequests || rec.Header().Get("Retry-After") == "" {
			t.Errorf("%s %s: call %d → %d, Retry-After %q", c.method, c.path, c.burst+1, rec.Code, rec.Header().Get("Retry-After"))
		}
		if rec := do(h, c.method, c.path, "someone-else", ""); rec.Code != http.StatusOK {
			t.Errorf("%s %s: another user was limited too", c.method, c.path)
		}
	}
}

func TestHealthAndVersionAreExempt(t *testing.T) {
	h, _ := limited(t)
	for range 500 {
		for _, path := range []string{"/healthz", "/version"} {
			if rec := do(h, "GET", path, "", ""); rec.Code != http.StatusOK {
				t.Fatalf("%s → %d", path, rec.Code)
			}
		}
	}
}

// A full game night: a host and six contestants over 30 minutes, with a frantic lobby (60
// season-slider changes in a minute), rejoins, a rematch, and the history screens after.
// Nobody is ever limited.
func TestGameNightIsNeverLimited(t *testing.T) {
	const (
		room = "a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1"
		game = "b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1"
	)
	type step struct {
		at           time.Duration
		user         string
		method, path string
	}
	var steps []step
	add := func(at time.Duration, user, method, path string) {
		steps = append(steps, step{at, user, method, path})
	}
	players := []string{"p1", "p2", "p3", "p4", "p5", "p6"}

	// Opening the app and the lobby.
	for _, u := range append([]string{"host"}, players...) {
		add(0, u, "GET", "/v1/me")
		add(time.Second, u, "GET", "/v1/me/current-room")
	}
	add(2*time.Second, "host", "GET", "/v1/host-access")
	add(3*time.Second, "host", "POST", "/v1/rooms")
	// The host drags the season slider: 60 changes in one minute, plus the other options.
	for i := range 60 {
		add(5*time.Second+time.Duration(i)*time.Second, "host", "PATCH", "/v1/rooms/"+room)
	}
	for i, u := range players {
		at := 10*time.Second + time.Duration(i)*time.Second
		add(at, u, "GET", "/v1/rooms/by-code/ABCDE")
		add(at+time.Second, u, "POST", "/v1/rooms/join")
		add(at+2*time.Second, u, "PATCH", "/v1/me")
	}
	// Rejoining: each contestant drops and comes back three times during the game.
	for r := range 3 {
		for i, u := range players {
			at := time.Duration(5+r*7)*time.Minute + time.Duration(i)*time.Second
			add(at, u, "GET", "/v1/me/current-room")
			add(at+time.Second, u, "POST", "/v1/games/"+game+"/resume")
		}
	}
	// Rematch: a new lobby and a few option changes, then everyone joins again.
	add(25*time.Minute, "host", "POST", "/v1/rooms")
	for i := range 10 {
		add(25*time.Minute+time.Duration(i)*time.Second, "host", "PATCH", "/v1/rooms/"+room)
	}
	for i, u := range players {
		add(25*time.Minute+time.Duration(20+i)*time.Second, u, "POST", "/v1/rooms/join")
	}
	// After the game: history, stats, leaderboard.
	for _, u := range append([]string{"host"}, players...) {
		add(29*time.Minute, u, "GET", "/v1/games")
		add(29*time.Minute+time.Second, u, "GET", "/v1/games/"+game)
		add(29*time.Minute+2*time.Second, u, "GET", "/v1/me/stats")
		add(29*time.Minute+3*time.Second, u, "GET", "/v1/leaderboard")
		add(29*time.Minute+4*time.Second, u, "GET", "/v1/me")
	}
	sort.SliceStable(steps, func(i, j int) bool { return steps[i].at < steps[j].at })
	if len(steps) < 180 {
		t.Fatalf("only %d requests; the night should be about 200", len(steps))
	}

	h, c := limited(t)
	start := c.t
	for _, s := range steps {
		c.t = start.Add(s.at)
		if rec := do(h, s.method, s.path, s.user, ""); rec.Code != http.StatusOK {
			t.Errorf("%v %s %s %s → %d", s.at, s.user, s.method, s.path, rec.Code)
		}
	}
}
