package account

import (
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"unicode/utf8"

	openapi_types "github.com/oapi-codegen/runtime/types"

	"schmegettes/api/internal/contracts"
	"schmegettes/api/internal/server"
	"schmegettes/golib/auth"
)

// maxTicketLength is far above a real ticket (43 characters), so junk never reaches the
// database.
const maxTicketLength = 64

// Handler serves /v1/me and its merge routes.
type Handler struct {
	Store Store
}

// Me handles GET /v1/me.
func (h Handler) Me(w http.ResponseWriter, r *http.Request) {
	c := server.Claims(r.Context())
	p, err := h.Store.Profile(r.Context(), c)
	if err != nil {
		h.internal(w, r, "profile request failed", err)
		return
	}
	server.JSON(w, http.StatusOK, profile(c, p))
}

// Update handles PATCH /v1/me.
func (h Handler) Update(w http.ResponseWriter, r *http.Request) {
	var body contracts.PatchV1MeJSONBody
	if !server.DecodeJSON(w, r, &body) {
		return
	}
	if body.AccountName == nil && body.ShowOnLeaderboard == nil {
		server.Problem(w, http.StatusBadRequest, "invalid-request", "Change at least one setting")
		return
	}
	var name *string
	if body.AccountName != nil {
		cleaned := strings.TrimSpace(*body.AccountName)
		if n := utf8.RuneCountInString(cleaned); n < 1 || n > 20 {
			server.Problem(w, http.StatusBadRequest, "invalid-name", "A name is 1 to 20 characters")
			return
		}
		name = &cleaned
	}
	c := server.Claims(r.Context())
	p, err := h.Store.Update(r.Context(), c, name, body.ShowOnLeaderboard)
	switch {
	case errors.Is(err, ErrForbidden):
		notSignedIn(w)
	case errors.Is(err, ErrInvalid):
		server.Problem(w, http.StatusBadRequest, "invalid-name", "A name is 1 to 20 characters")
	case err != nil:
		h.internal(w, r, "set account name failed", err)
	default:
		if body.ShowOnLeaderboard != nil {
			slog.InfoContext(r.Context(), "leaderboard visibility changed", "user_id", c.UserID,
				"shown", *body.ShowOnLeaderboard, "request_id", server.RequestID(r.Context()))
		}
		server.JSON(w, http.StatusOK, profile(c, p))
	}
}

// CreateTicket handles POST /v1/me/merge-tickets. Never log the ticket.
func (h Handler) CreateTicket(w http.ResponseWriter, r *http.Request) {
	ticket, expires, err := h.Store.CreateTicket(r.Context(), server.Claims(r.Context()))
	switch {
	case errors.Is(err, ErrForbidden):
		server.Problem(w, http.StatusConflict, "not-a-guest", "Only a guest needs a merge ticket")
	case err != nil:
		h.internal(w, r, "merge ticket failed", err)
	default:
		server.JSON(w, http.StatusCreated, contracts.MergeTicket{Ticket: ticket, ExpiresAt: expires})
	}
}

// Merge handles POST /v1/me/merge. Never log the ticket.
func (h Handler) Merge(w http.ResponseWriter, r *http.Request) {
	var body contracts.PostV1MeMergeJSONBody
	if !server.DecodeJSON(w, r, &body) {
		return
	}
	ctx := r.Context()
	c := server.Claims(ctx)
	if body.Ticket == "" || len(body.Ticket) > maxTicketLength {
		h.refused(w, r, "invalid_ticket")
		return
	}
	m, err := h.Store.Merge(ctx, c, body.Ticket)
	switch {
	case errors.Is(err, ErrForbidden):
		slog.InfoContext(ctx, "merge refused", "reason", "not_signed_in", "user_id", c.UserID, "request_id", server.RequestID(ctx))
		notSignedIn(w)
	case errors.Is(err, ErrInvalid):
		h.refused(w, r, "invalid_ticket")
	case errors.Is(err, ErrInGame):
		slog.InfoContext(ctx, "merge refused", "reason", "guest_in_game", "user_id", c.UserID, "request_id", server.RequestID(ctx))
		server.Problem(w, http.StatusConflict, "guest-in-game", "Finish or leave the game on this phone first")
	case err != nil:
		h.internal(w, r, "merge failed", err)
	default:
		slog.InfoContext(ctx, "guest merged", "user_id", c.UserID, "games_added", m.GamesAdded,
			"host_access_added", m.HostAccessAdded, "request_id", server.RequestID(ctx))
		server.JSON(w, http.StatusOK, contracts.MergeResult{
			GamesAdded: m.GamesAdded, HostAccessAdded: m.HostAccessAdded, AccountWasNew: m.AccountWasNew,
		})
	}
}

// Delete handles DELETE /v1/me.
func (h Handler) Delete(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	c := server.Claims(ctx)
	err := h.Store.Delete(ctx, c)
	switch {
	case errors.Is(err, ErrForbidden):
		notSignedIn(w)
	case errors.Is(err, ErrInGame):
		server.Problem(w, http.StatusConflict, "in-game", "Finish or leave your game first")
	case err != nil:
		h.internal(w, r, "account delete failed", err)
	default:
		slog.InfoContext(ctx, "account deleted", "user_id", c.UserID, "request_id", server.RequestID(ctx))
		w.WriteHeader(http.StatusNoContent)
	}
}

func profile(c auth.Claims, p Profile) contracts.Profile {
	var id openapi_types.UUID
	_ = id.UnmarshalText([]byte(c.UserID)) // a verified subject is always a UUID
	out := contracts.Profile{
		UserId: id, DisplayName: p.DisplayName, AccountName: p.AccountName, IsAnonymous: c.IsAnonymous,
		ShowOnLeaderboard: p.ShowOnLeaderboard,
	}
	// Only an admin gets the field at all; everyone else's profile looks as it always has.
	if p.IsAdmin {
		admin := true
		out.IsAdmin = &admin
	}
	return out
}

func notSignedIn(w http.ResponseWriter) {
	server.Problem(w, http.StatusForbidden, "not-signed-in", "Sign in first")
}

func (h Handler) refused(w http.ResponseWriter, r *http.Request, reason string) {
	ctx := r.Context()
	slog.InfoContext(ctx, "merge refused", "reason", reason,
		"user_id", server.Claims(ctx).UserID, "request_id", server.RequestID(ctx))
	server.Problem(w, http.StatusBadRequest, "invalid-ticket", "That sign-in link has expired")
}

func (h Handler) internal(w http.ResponseWriter, r *http.Request, msg string, err error) {
	ctx := r.Context()
	slog.ErrorContext(ctx, msg, "err", err, "request_id", server.RequestID(ctx), "user_id", server.Claims(ctx).UserID)
	server.Problem(w, http.StatusInternalServerError, "internal", "Something went wrong")
}
