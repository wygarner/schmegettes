package main

import (
	"context"
	"net/http"
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
)

// routes implements the generated contracts.ServerInterface. Operations no task has built yet
// answer 501.
type routes struct {
	admin  admin.Handler
	rooms  rooms.Handler
	games  games.Handler
	host   hostaccess.Handler
	me     account.Handler
	limits limits
	ping   func(context.Context) error
}

// limits are the per-user rate limits on endpoints that take a code someone could guess, or
// that change an account.
type limits struct {
	join     *ratelimit.Limiter // room codes
	hostCode *ratelimit.Limiter // host codes
	account  *ratelimit.Limiter // merge tickets, merging, deleting an account
	admin    *ratelimit.Limiter // concealed admin api, including unauthenticated attempts
}

func newLimits() limits {
	return limits{
		join:     ratelimit.New("join", 10, 10),
		hostCode: ratelimit.New("host-code", 5, 5),
		account:  ratelimit.New("account", 10, 3),
		admin:    ratelimit.New("admin", 5, 5),
	}
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

func (rt routes) PostV1Rooms(w http.ResponseWriter, r *http.Request) { rt.rooms.Create(w, r) }
func (rt routes) PostV1RoomsJoin(w http.ResponseWriter, r *http.Request) {
	if rt.limits.join.Allow(w, r) {
		rt.rooms.Join(w, r)
	}
}
func (rt routes) GetV1RoomsByCodeCode(w http.ResponseWriter, r *http.Request, code string) {
	if rt.limits.join.Allow(w, r) {
		rt.rooms.ByCode(w, r, code)
	}
}

func (rt routes) GetV1HostAccess(w http.ResponseWriter, r *http.Request) { rt.host.Status(w, r) }
func (rt routes) PostV1HostAccessRedeem(w http.ResponseWriter, r *http.Request) {
	if rt.limits.hostCode.Allow(w, r) {
		rt.host.Redeem(w, r)
	}
}

func (rt routes) GetV1AdminHostCode(w http.ResponseWriter, r *http.Request) {
	rt.admin.CurrentCode(w, r)
}
func (rt routes) PostV1AdminHostCodeRotate(w http.ResponseWriter, r *http.Request) {
	rt.admin.Rotate(w, r)
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

func notImplemented(w http.ResponseWriter) {
	server.Problem(w, http.StatusNotImplemented, "not-implemented", "Not implemented yet")
}

func (rt routes) GetV1Games(w http.ResponseWriter, r *http.Request, params contracts.GetV1GamesParams) {
	rt.games.List(w, r, params)
}
func (rt routes) GetV1GamesGameId(w http.ResponseWriter, r *http.Request, id openapi_types.UUID) {
	rt.games.Detail(w, r, id)
}
func (rt routes) GetV1Me(w http.ResponseWriter, r *http.Request)   { rt.me.Me(w, r) }
func (rt routes) PatchV1Me(w http.ResponseWriter, r *http.Request) { rt.me.SetName(w, r) }
func (rt routes) DeleteV1Me(w http.ResponseWriter, r *http.Request) {
	if rt.limits.account.Allow(w, r) {
		rt.me.Delete(w, r)
	}
}
func (rt routes) PostV1MeMergeTickets(w http.ResponseWriter, r *http.Request) {
	if rt.limits.account.Allow(w, r) {
		rt.me.CreateTicket(w, r)
	}
}
func (rt routes) PostV1MeMerge(w http.ResponseWriter, r *http.Request) {
	if rt.limits.account.Allow(w, r) {
		rt.me.Merge(w, r)
	}
}
func (routes) GetV1RoomsRoomId(w http.ResponseWriter, _ *http.Request, _ openapi_types.UUID) {
	notImplemented(w)
}
func (routes) PatchV1RoomsRoomId(w http.ResponseWriter, _ *http.Request, _ openapi_types.UUID) {
	notImplemented(w)
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
	return server.Log(server.CORS(origins)(server.AuthenticateWithAdminLimit(verifier, rt.limits.admin.AllowKey)(h)))
}
