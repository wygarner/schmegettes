package rooms

import (
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"unicode/utf8"

	"github.com/google/uuid"

	"schmegettes/api/internal/contracts"
	"schmegettes/api/internal/server"
)

// Handler serves /v1/rooms.
type Handler struct {
	Store Store
	// SocketBase is game/'s public URL, e.g. wss://game.example.com.
	SocketBase string
}

func validName(name string) bool {
	n := utf8.RuneCountInString(strings.TrimSpace(name))
	return n >= 1 && n <= 20
}

func (h Handler) respond(w http.ResponseWriter, status int, room Room) {
	body := contracts.RoomJoin{
		GameSocketUrl: strings.TrimRight(h.SocketBase, "/") + "/rooms/" + room.ID + "/ws",
		Room: contracts.Room{
			RoomId:          uuid.MustParse(room.ID),
			Code:            room.Code,
			Status:          contracts.RoomStatus(room.Status),
			HostUserId:      uuid.MustParse(room.HostUserID),
			HostDisplayName: room.HostDisplayName,
			HostPlays:       room.HostPlays,
			MaxPlayers:      room.MaxPlayers,
		},
	}
	if room.Seasons != nil {
		body.Room.Seasons = &room.Seasons
	}
	server.JSON(w, status, body)
}

func (h Handler) fail(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, ErrNotFound):
		server.Problem(w, http.StatusNotFound, "room-not-found", "No room with that code")
	case errors.Is(err, ErrRoomFull):
		server.Problem(w, http.StatusConflict, "room-full", "This room is full")
	case errors.Is(err, ErrGameStarted):
		server.Problem(w, http.StatusConflict, "game-started", "This game has already started")
	case errors.Is(err, ErrInvalidName):
		server.Problem(w, http.StatusBadRequest, "invalid-name", "Names are 1 to 20 characters")
	case errors.Is(err, ErrNotAHost):
		server.Problem(w, http.StatusForbidden, "not-a-host", "Hosting is invite-only")
	default:
		slog.ErrorContext(r.Context(), "room request failed", "err", err,
			"request_id", server.RequestID(r.Context()), "user_id", server.Claims(r.Context()).UserID)
		server.Problem(w, http.StatusInternalServerError, "internal", "Something went wrong")
		return
	}
	slog.DebugContext(r.Context(), "room request refused", "reason", err.Error(),
		"request_id", server.RequestID(r.Context()), "user_id", server.Claims(r.Context()).UserID)
}

// Create handles POST /v1/rooms.
func (h Handler) Create(w http.ResponseWriter, r *http.Request) {
	var body contracts.PostV1RoomsJSONBody
	if !server.DecodeJSON(w, r, &body) {
		return
	}
	if !validName(body.DisplayName) {
		h.fail(w, r, ErrInvalidName)
		return
	}
	room, err := h.Store.Create(r.Context(), server.Claims(r.Context()), body.DisplayName)
	if err != nil {
		h.fail(w, r, err)
		return
	}
	slog.InfoContext(r.Context(), "room created", "room_id", room.ID, "user_id", room.HostUserID,
		"request_id", server.RequestID(r.Context()))
	h.respond(w, http.StatusCreated, room)
}

// Join handles POST /v1/rooms/join.
func (h Handler) Join(w http.ResponseWriter, r *http.Request) {
	var body contracts.PostV1RoomsJoinJSONBody
	if !server.DecodeJSON(w, r, &body) {
		return
	}
	role := contracts.Contestant
	if body.Role != nil {
		role = *body.Role
	}
	if role != contracts.Contestant && role != contracts.Spectator {
		server.Problem(w, http.StatusBadRequest, "invalid-request", "Unknown role")
		return
	}
	if !validName(body.DisplayName) {
		h.fail(w, r, ErrInvalidName)
		return
	}
	room, err := h.Store.Join(r.Context(), server.Claims(r.Context()), body.Code, body.DisplayName, string(role))
	if err != nil {
		h.fail(w, r, err)
		return
	}
	h.respond(w, http.StatusOK, room)
}

// ByCode handles GET /v1/rooms/by-code/{code}.
func (h Handler) ByCode(w http.ResponseWriter, r *http.Request, code string) {
	room, err := h.Store.ByCode(r.Context(), server.Claims(r.Context()), code)
	if err != nil {
		h.fail(w, r, err)
		return
	}
	h.respond(w, http.StatusOK, room)
}
