package hostaccess

import (
	"log/slog"
	"net/http"

	"schmegettes/api/internal/contracts"
	"schmegettes/api/internal/server"
)

// maxCodeLength allows the 8 characters plus a dash and stray spaces.
const maxCodeLength = 16

// Handler serves /v1/host-access.
type Handler struct {
	Store Store
}

// Status handles GET /v1/host-access.
func (h Handler) Status(w http.ResponseWriter, r *http.Request) {
	ok, err := h.Store.CanHost(r.Context(), server.Claims(r.Context()))
	if err != nil {
		h.internal(w, r, err)
		return
	}
	server.JSON(w, http.StatusOK, contracts.HostAccess{CanHost: ok})
}

// Redeem handles POST /v1/host-access/redeem. Wrong, spent, and malformed codes get the same
// answer, so a reply never tells a guesser which.
func (h Handler) Redeem(w http.ResponseWriter, r *http.Request) {
	var body contracts.PostV1HostAccessRedeemJSONBody
	if !server.DecodeJSON(w, r, &body) {
		return
	}
	ok := false
	if body.Code != "" && len(body.Code) <= maxCodeLength {
		var err error
		if ok, err = h.Store.Redeem(r.Context(), server.Claims(r.Context()), body.Code); err != nil {
			h.internal(w, r, err)
			return
		}
	}
	// Never log the code.
	if !ok {
		slog.DebugContext(r.Context(), "host code rejected", "request_id", server.RequestID(r.Context()))
		server.Problem(w, http.StatusBadRequest, "invalid-code", "That code didn't work")
		return
	}
	slog.InfoContext(r.Context(), "host code redeemed", "request_id", server.RequestID(r.Context()))
	server.JSON(w, http.StatusOK, contracts.HostAccess{CanHost: true})
}

func (h Handler) internal(w http.ResponseWriter, r *http.Request, err error) {
	slog.ErrorContext(r.Context(), "host access request failed", "err", err,
		"request_id", server.RequestID(r.Context()), "user_id", server.Claims(r.Context()).UserID)
	server.Problem(w, http.StatusInternalServerError, "internal", "Something went wrong")
}
