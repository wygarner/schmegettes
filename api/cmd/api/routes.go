package main

import (
	"context"
	"net/http"
	"strings"
	"time"

	openapi_types "github.com/oapi-codegen/runtime/types"

	"schmegettes/api/internal/account"
	"schmegettes/api/internal/admin"
	"schmegettes/api/internal/contracts"
	"schmegettes/api/internal/games"
	"schmegettes/api/internal/hostaccess"
	"schmegettes/api/internal/ratelimit"
	"schmegettes/api/internal/rooms"
	"schmegettes/api/internal/server"
	"schmegettes/api/internal/staffaccess"
	"schmegettes/api/internal/stats"
)

// routes implements the generated contracts.ServerInterface. Operations no task has built yet
// answer 501.
type routes struct {
	admin  admin.Handler
	rooms  rooms.Handler
	games  games.Handler
	host   hostaccess.Handler
	me     account.Handler
	stats  stats.Handler
	staff  staffaccess.Handler
	limits limits
	ping   func(context.Context) error
}

// limits are the per-user rate limits. Every route has one group (routeGroup): a default by
// method, or a stricter group for endpoints that take a code someone could guess or that
// change an account. Starting numbers; revise them from production logs
// (security-model.md, "Rate limits").
type limits struct {
	read        *ratelimit.Limiter // default for GET
	write       *ratelimit.Limiter // default for POST, PATCH, DELETE
	roomOptions *ratelimit.Limiter // a host dragging the season slider
	join        *ratelimit.Limiter // room codes
	hostCode    *ratelimit.Limiter // host codes
	account     *ratelimit.Limiter // merge tickets, merging, deleting an account
	admin       *ratelimit.Limiter // concealed admin api, including unauthenticated attempts
}

func newLimits() limits {
	return limits{
		read:        ratelimit.New("read", 120, 40),
		write:       ratelimit.New("write", 60, 20),
		roomOptions: ratelimit.New("room-options", 120, 40),
		join:        ratelimit.New("join", 10, 10),
		hostCode:    ratelimit.New("host-code", 5, 5),
		account:     ratelimit.New("account", 10, 3),
		admin:       ratelimit.New("admin", 5, 5),
	}
}

// Groups other than the method defaults. Patterns are the generated router's.
var routeGroups = map[string]string{
	"POST /v1/rooms/join":            "join",
	"GET /v1/rooms/by-code/{code}":   "join",
	"POST /v1/games/{gameId}/resume": "join",
	"POST /v1/host-access/redeem":    "host-code",
	"DELETE /v1/me":                  "account",
	"POST /v1/me/merge-tickets":      "account",
	"POST /v1/me/merge":              "account",
	"PATCH /v1/rooms/{roomId}":       "room-options",
}

var groupPatterns = func() *http.ServeMux {
	m := http.NewServeMux()
	for pattern := range routeGroups {
		m.Handle(pattern, http.NotFoundHandler())
	}
	return m
}()

// routeGroup names the limiter group for a request: "" for /healthz and /version, "admin" for
// the admin api (limited during authentication), a stricter group from routeGroups, or
// read/write by method. Unknown paths are limited too.
func routeGroup(r *http.Request) string {
	switch {
	case r.URL.Path == "/healthz" || r.URL.Path == "/version":
		return ""
	case strings.HasPrefix(r.URL.Path, "/v1/admin/"):
		return "admin"
	}
	if _, pattern := groupPatterns.Handler(r); pattern != "" {
		return routeGroups[pattern]
	}
	if r.Method == http.MethodGet || r.Method == http.MethodHead || r.Method == http.MethodOptions {
		return "read"
	}
	return "write"
}

func (l limits) group(name string) *ratelimit.Limiter {
	return map[string]*ratelimit.Limiter{
		"read": l.read, "write": l.write, "room-options": l.roomOptions,
		"join": l.join, "host-code": l.hostCode, "account": l.account,
	}[name]
}

// limit applies each route's group after authentication, keyed by the caller's user id.
func (l limits) limit(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if lim := l.group(routeGroup(r)); lim != nil && !lim.Allow(w, r) {
			return
		}
		next.ServeHTTP(w, r)
	})
}

var _ contracts.ServerInterface = routes{}

func (rt routes) GetHealthz(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()
	if err := rt.ping(ctx); err != nil {
		server.JSON(w, http.StatusServiceUnavailable, contracts.Health{Status: contracts.Degraded})
		return
	}
	server.JSON(w, http.StatusOK, contracts.Health{Status: contracts.Ok})
}

func (routes) GetVersion(w http.ResponseWriter, _ *http.Request) {
	server.JSON(w, http.StatusOK, contracts.Version{Service: "api", Commit: buildCommit()})
}

func (rt routes) PostV1Rooms(w http.ResponseWriter, r *http.Request)        { rt.rooms.Create(w, r) }
func (rt routes) GetV1MeCurrentRoom(w http.ResponseWriter, r *http.Request) { rt.rooms.Current(w, r) }
func (rt routes) PostV1GamesGameIdResume(w http.ResponseWriter, r *http.Request, id openapi_types.UUID) {
	rt.rooms.Resume(w, r, id.String())
}
func (rt routes) PostV1RoomsJoin(w http.ResponseWriter, r *http.Request) {
	rt.rooms.Join(w, r)
}
func (rt routes) GetV1RoomsByCodeCode(w http.ResponseWriter, r *http.Request, code string) {
	rt.rooms.ByCode(w, r, code)
}

func (rt routes) GetV1HostAccess(w http.ResponseWriter, r *http.Request) { rt.host.Status(w, r) }
func (rt routes) PostV1HostAccessRedeem(w http.ResponseWriter, r *http.Request) {
	rt.host.Redeem(w, r)
}

func (rt routes) GetV1AdminHostCode(w http.ResponseWriter, r *http.Request) {
	rt.admin.CurrentCode(w, r)
}
func (rt routes) PostV1AdminHostCodeRotate(w http.ResponseWriter, r *http.Request) {
	rt.admin.Rotate(w, r)
}
func (rt routes) GetV1AdminCleanupRuns(w http.ResponseWriter, r *http.Request) {
	rt.admin.CleanupRuns(w, r)
}
func (rt routes) PostV1AdminQaAccounts(w http.ResponseWriter, r *http.Request) {
	rt.admin.MarkQA(w, r)
}
func (rt routes) PostV1AdminQaCleanup(w http.ResponseWriter, r *http.Request) {
	rt.admin.CleanupQA(w, r)
}
func (rt routes) GetV1AdminHosts(w http.ResponseWriter, r *http.Request) {
	rt.admin.Hosts(w, r)
}
func (rt routes) PatchV1AdminHostsUserId(w http.ResponseWriter, r *http.Request, id openapi_types.UUID) {
	rt.admin.SetNote(w, r, id)
}
func (rt routes) DeleteV1AdminHostsUserId(w http.ResponseWriter, r *http.Request, id openapi_types.UUID) {
	rt.admin.Remove(w, r, id)
}

func (rt routes) PostV1AdminStaffAccess(w http.ResponseWriter, r *http.Request) { rt.staff.Grant(w, r) }
func (rt routes) GetV1AdminStaffAccessGrantId(w http.ResponseWriter, r *http.Request, id openapi_types.UUID) {
	rt.staff.Read(w, r, id)
}
func (rt routes) DeleteV1AdminStaffAccessGrantId(w http.ResponseWriter, r *http.Request, id openapi_types.UUID) {
	rt.staff.Revoke(w, r, id)
}
func (rt routes) GetV1AdminAudit(w http.ResponseWriter, r *http.Request, params contracts.GetV1AdminAuditParams) {
	rt.staff.Audit(w, r, params)
}

func notImplemented(w http.ResponseWriter) {
	server.Problem(w, http.StatusNotImplemented, "not-implemented", "Not implemented yet")
}

func (rt routes) GetV1Games(w http.ResponseWriter, r *http.Request, params contracts.GetV1GamesParams) {
	rt.games.List(w, r, params)
}
func (rt routes) GetV1GamesGameId(w http.ResponseWriter, r *http.Request, id openapi_types.UUID) {
	rt.games.Detail(w, r, id)
}
func (rt routes) GetV1Me(w http.ResponseWriter, r *http.Request)          { rt.me.Me(w, r) }
func (rt routes) PatchV1Me(w http.ResponseWriter, r *http.Request)        { rt.me.Update(w, r) }
func (rt routes) GetV1MeStats(w http.ResponseWriter, r *http.Request)     { rt.stats.MyStats(w, r) }
func (rt routes) GetV1Leaderboard(w http.ResponseWriter, r *http.Request) { rt.stats.Leaderboard(w, r) }
func (rt routes) DeleteV1Me(w http.ResponseWriter, r *http.Request) {
	rt.me.Delete(w, r)
}
func (rt routes) PostV1MeMergeTickets(w http.ResponseWriter, r *http.Request) {
	rt.me.CreateTicket(w, r)
}
func (rt routes) PostV1MeMerge(w http.ResponseWriter, r *http.Request) {
	rt.me.Merge(w, r)
}
func (routes) GetV1RoomsRoomId(w http.ResponseWriter, _ *http.Request, _ openapi_types.UUID) {
	notImplemented(w)
}
func (rt routes) PatchV1RoomsRoomId(w http.ResponseWriter, r *http.Request, id openapi_types.UUID) {
	rt.rooms.Patch(w, r, id.String())
}

// handler wires the routes behind logging, CORS, and authentication.
func handler(rt routes, verifier server.Verifier, origins []string) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/", server.NotFound)
	h := contracts.HandlerWithOptions(rt, contracts.StdHTTPServerOptions{
		BaseRouter: mux,
		ErrorHandlerFunc: func(w http.ResponseWriter, _ *http.Request, _ error) {
			server.Problem(w, http.StatusBadRequest, "invalid-request", "Invalid request")
		},
	})
	return server.Log(server.CORS(origins)(server.AuthenticateWithAdminLimit(verifier, rt.limits.admin.AllowKey)(rt.limits.limit(h))))
}
