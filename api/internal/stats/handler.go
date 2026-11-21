package stats

import (
	"errors"
	"log/slog"
	"net/http"

	"schmegettes/api/internal/server"
)

type Handler struct{ Store Store }

func (h Handler) MyStats(w http.ResponseWriter, r *http.Request) {
	value, err := h.Store.MyStats(r.Context(), server.Claims(r.Context()))
	if h.problem(w, r, err) {
		return
	}
	server.JSON(w, http.StatusOK, value)
}

func (h Handler) Leaderboard(w http.ResponseWriter, r *http.Request) {
	value, err := h.Store.Leaderboard(r.Context(), server.Claims(r.Context()))
	if h.problem(w, r, err) {
		return
	}
	server.JSON(w, http.StatusOK, value)
}

func (h Handler) problem(w http.ResponseWriter, r *http.Request, err error) bool {
	switch {
	case err == nil:
		return false
	case errors.Is(err, ErrNotSignedIn):
		server.Problem(w, http.StatusForbidden, "not-signed-in", "Sign in first")
	case errors.Is(err, ErrNoCountedGame):
		server.Problem(w, http.StatusForbidden, "no-counted-games", "Play a game first")
	default:
		ctx := r.Context()
		slog.ErrorContext(ctx, "stats request failed", "err", err, "request_id", server.RequestID(ctx),
			"user_id", server.Claims(ctx).UserID)
		server.Problem(w, http.StatusInternalServerError, "internal", "Something went wrong")
	}
	return true
}
