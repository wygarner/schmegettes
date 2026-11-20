package rooms

import (
	"encoding/json"
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

func contractRoom(room Room) contracts.Room {
	out := contracts.Room{
		RoomId:          uuid.MustParse(room.ID),
		Code:            room.Code,
		Status:          contracts.RoomStatus(room.Status),
		HostUserId:      uuid.MustParse(room.HostUserID),
		HostDisplayName: room.HostDisplayName,
		HostPlays:       room.HostPlays,
		MaxPlayers:      room.MaxPlayers,
		Timers:          contracts.RoomTimers(room.Timers),
		DoubleRound:     room.DoubleRound,
		QuickPicks:      room.QuickPicks,
	}
	if room.Seasons != nil {
		out.Seasons = &room.Seasons
	}
	return out
}

func (h Handler) respond(w http.ResponseWriter, status int, room Room) {
	server.JSON(w, status, contracts.RoomJoin{
		GameSocketUrl: strings.TrimRight(h.SocketBase, "/") + "/rooms/" + room.ID + "/ws",
		Room:          contractRoom(room),
	})
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
	case errors.Is(err, ErrNotTheHost):
		server.Problem(w, http.StatusForbidden, "not-the-host", "Only the host can do that")
	case errors.Is(err, ErrNotResumable):
		server.Problem(w, http.StatusConflict, "not-resumable", "This game can't be resumed")
	case errors.Is(err, ErrNotInGame):
		server.Problem(w, http.StatusForbidden, "not-in-game", "This game is being resumed. Only its players can join.")
	case errors.Is(err, ErrInvalidSettings):
		server.Problem(w, http.StatusBadRequest, "invalid-settings", "Pick at least one season, from 1 to 40")
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
	role := contracts.PostV1RoomsJoinJSONBodyRoleContestant
	if body.Role != nil {
		role = *body.Role
	}
	if role != contracts.PostV1RoomsJoinJSONBodyRoleContestant && role != contracts.PostV1RoomsJoinJSONBodyRoleSpectator {
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

// optionsBody is PATCH /v1/rooms/{roomId}'s body. Seasons stays raw so an absent key (leave
// it) and null (every season) differ.
type optionsBody struct {
	Seasons     json.RawMessage                             `json:"seasons"`
	MaxPlayers  *int                                        `json:"maxPlayers"`
	Timers      *contracts.PatchV1RoomsRoomIdJSONBodyTimers `json:"timers"`
	DoubleRound *bool                                       `json:"doubleRound"`
	QuickPicks  *bool                                       `json:"quickPicks"`
}

// Patch handles PATCH /v1/rooms/{roomId}: the host's game options, before Start.
func (h Handler) Patch(w http.ResponseWriter, r *http.Request, roomID string) {
	var body optionsBody
	if !server.DecodeJSON(w, r, &body) {
		return
	}
	var o Options
	if len(body.Seasons) > 0 {
		o.SetSeasons = true
		if err := json.Unmarshal(body.Seasons, &o.Seasons); err != nil {
			server.Problem(w, http.StatusBadRequest, "invalid-request", "Invalid request body")
			return
		}
	}
	if body.Timers != nil {
		switch *body.Timers {
		case contracts.PatchV1RoomsRoomIdJSONBodyTimersRelaxed, contracts.PatchV1RoomsRoomIdJSONBodyTimersStandard,
			contracts.PatchV1RoomsRoomIdJSONBodyTimersFast:
			pace := string(*body.Timers)
			o.Timers = &pace
		default:
			server.Problem(w, http.StatusBadRequest, "invalid-request", "Unknown timer pace")
			return
		}
	}
	o.DoubleRound, o.MaxPlayers, o.QuickPicks = body.DoubleRound, body.MaxPlayers, body.QuickPicks
	if !o.SetSeasons && o.Timers == nil && o.DoubleRound == nil && o.MaxPlayers == nil && o.QuickPicks == nil {
		server.Problem(w, http.StatusBadRequest, "invalid-request", "Nothing to change")
		return
	}
	room, err := h.Store.SetOptions(r.Context(), server.Claims(r.Context()), roomID, o)
	if err != nil {
		h.fail(w, r, err)
		return
	}
	slog.InfoContext(r.Context(), "room options changed", "room_id", room.ID, "timers", room.Timers,
		"double_round", room.DoubleRound, "quick_picks", room.QuickPicks, "request_id", server.RequestID(r.Context()))
	server.JSON(w, http.StatusOK, contractRoom(room))
}

// Current handles GET /v1/me/current-room: the room Home offers to rejoin, or 204.
func (h Handler) Current(w http.ResponseWriter, r *http.Request) {
	cur, err := h.Store.Current(r.Context(), server.Claims(r.Context()))
	if errors.Is(err, ErrNoCurrentRoom) {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if err != nil {
		h.fail(w, r, err)
		return
	}
	names := cur.PlayerNames
	if names == nil {
		names = []string{}
	}
	server.JSON(w, http.StatusOK, contracts.CurrentRoom{
		Kind: contracts.CurrentRoomKind(cur.Kind), RoomId: uuid.MustParse(cur.RoomID), Code: cur.Code,
		Role: contracts.CurrentRoomRole(cur.Role), HostDisplayName: cur.HostDisplayName, PlayerNames: names,
	})
}

// Resume handles POST /v1/games/{gameId}/resume: the host opens a resume lobby.
func (h Handler) Resume(w http.ResponseWriter, r *http.Request, gameID string) {
	room, err := h.Store.Resume(r.Context(), server.Claims(r.Context()), gameID)
	if err != nil {
		h.fail(w, r, err)
		return
	}
	slog.InfoContext(r.Context(), "game resume opened", "game_id", gameID, "room_id", room.ID,
		"request_id", server.RequestID(r.Context()))
	h.respond(w, http.StatusCreated, room)
}
