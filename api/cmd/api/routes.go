package main

import (
	"context"
	"net/http"
	"time"

	openapi_types "github.com/oapi-codegen/runtime/types"

	"schmegettes/api/internal/contracts"
	"schmegettes/api/internal/rooms"
	"schmegettes/api/internal/server"
)

// routes implements the generated contracts.ServerInterface. Operations no task has built yet
// answer 501.
type routes struct {
	rooms rooms.Handler
	ping  func(context.Context) error
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
	rt.rooms.Join(w, r)
}
func (rt routes) GetV1RoomsByCodeCode(w http.ResponseWriter, r *http.Request, code string) {
	rt.rooms.ByCode(w, r, code)
}

func notImplemented(w http.ResponseWriter) {
	server.Problem(w, http.StatusNotImplemented, "not-implemented", "Not implemented yet")
}

func (routes) GetV1Games(w http.ResponseWriter, _ *http.Request, _ contracts.GetV1GamesParams) {
	notImplemented(w)
}
func (routes) GetV1GamesGameId(w http.ResponseWriter, _ *http.Request, _ openapi_types.UUID) {
	notImplemented(w)
}
func (routes) GetV1Me(w http.ResponseWriter, _ *http.Request)   { notImplemented(w) }
func (routes) PatchV1Me(w http.ResponseWriter, _ *http.Request) { notImplemented(w) }
func (routes) GetV1RoomsRoomId(w http.ResponseWriter, _ *http.Request, _ openapi_types.UUID) {
	notImplemented(w)
}
func (routes) PatchV1RoomsRoomId(w http.ResponseWriter, _ *http.Request, _ openapi_types.UUID) {
	notImplemented(w)
}

// handler wires the routes behind logging, CORS, and authentication.
func handler(rt routes, verifier server.Verifier, origins []string) http.Handler {
	mux := http.NewServeMux()
	h := contracts.HandlerWithOptions(rt, contracts.StdHTTPServerOptions{
		BaseRouter: mux,
		ErrorHandlerFunc: func(w http.ResponseWriter, _ *http.Request, _ error) {
			server.Problem(w, http.StatusBadRequest, "invalid-request", "Invalid request")
		},
	})
	return server.Log(server.CORS(origins)(server.Authenticate(verifier)(h)))
}
