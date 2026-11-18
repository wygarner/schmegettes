package admin

import (
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	openapi_types "github.com/oapi-codegen/runtime/types"

	"schmegettes/api/internal/contracts"
	"schmegettes/api/internal/server"
)

const maxCodeLength = 16

type Handler struct{ Store Store }

func (h Handler) CurrentCode(w http.ResponseWriter, r *http.Request) {
	code, err := h.Store.CurrentCode(r.Context(), server.Claims(r.Context()))
	if h.handleError(w, r, "admin host code failed", err) {
		return
	}
	server.JSON(w, http.StatusOK, contractCode(code))
}

func (h Handler) Rotate(w http.ResponseWriter, r *http.Request) {
	var body contracts.PostV1AdminHostCodeRotateJSONBody
	if !server.DecodeJSON(w, r, &body) {
		return
	}
	if body.ExpectedCode == "" || len(body.ExpectedCode) > maxCodeLength {
		server.Problem(w, http.StatusBadRequest, "invalid-request", "Invalid request body")
		return
	}
	code, err := h.Store.Rotate(r.Context(), server.Claims(r.Context()), body.ExpectedCode)
	if h.handleError(w, r, "admin host-code rotation failed", err) {
		return
	}
	slog.InfoContext(r.Context(), "host code rotated", "request_id", server.RequestID(r.Context()),
		"user_id", server.Claims(r.Context()).UserID)
	server.JSON(w, http.StatusOK, contractCode(code))
}

func (h Handler) Hosts(w http.ResponseWriter, r *http.Request) {
	hosts, err := h.Store.Hosts(r.Context(), server.Claims(r.Context()))
	if h.handleError(w, r, "admin hosts failed", err) {
		return
	}
	result := make([]contracts.AdminHost, 0, len(hosts))
	for _, host := range hosts {
		result = append(result, contractHost(host))
	}
	server.JSON(w, http.StatusOK, struct {
		Hosts []contracts.AdminHost `json:"hosts"`
	}{Hosts: result})
}

func (h Handler) SetNote(w http.ResponseWriter, r *http.Request, userID openapi_types.UUID) {
	var body contracts.PatchV1AdminHostsUserIdJSONBody
	if !server.DecodeJSON(w, r, &body) {
		return
	}
	if body.Note != nil {
		trimmed := strings.TrimSpace(*body.Note)
		if utf8.RuneCountInString(trimmed) > 200 {
			server.Problem(w, http.StatusBadRequest, "invalid-note", "A note is at most 200 characters")
			return
		}
		body.Note = &trimmed
	}
	host, err := h.Store.SetNote(r.Context(), server.Claims(r.Context()), userID.String(), body.Note)
	if h.handleError(w, r, "admin host-note update failed", err) {
		return
	}
	slog.InfoContext(r.Context(), "host note updated", "request_id", server.RequestID(r.Context()),
		"user_id", server.Claims(r.Context()).UserID, "target_user_id", userID.String())
	server.JSON(w, http.StatusOK, contractHost(host))
}

func (h Handler) Remove(w http.ResponseWriter, r *http.Request, userID openapi_types.UUID) {
	err := h.Store.Remove(r.Context(), server.Claims(r.Context()), userID.String())
	if h.handleError(w, r, "admin host removal failed", err) {
		return
	}
	slog.InfoContext(r.Context(), "host access removed", "request_id", server.RequestID(r.Context()),
		"user_id", server.Claims(r.Context()).UserID, "target_user_id", userID.String())
	w.WriteHeader(http.StatusNoContent)
}

func (h Handler) handleError(w http.ResponseWriter, r *http.Request, message string, err error) bool {
	switch {
	case err == nil:
		return false
	case errors.Is(err, ErrNotFound):
		server.NotFound(w, r)
	case errors.Is(err, ErrInvalid):
		server.Problem(w, http.StatusBadRequest, "invalid-request", "Invalid request")
	default:
		slog.ErrorContext(r.Context(), message, "err", err, "request_id", server.RequestID(r.Context()),
			"user_id", server.Claims(r.Context()).UserID)
		server.Problem(w, http.StatusInternalServerError, "internal", "Something went wrong")
	}
	return true
}

// Times go out in UTC (the contract's RFC 3339 UTC), whatever zone the server runs in.
func contractCode(c HostCode) contracts.AdminHostCode {
	var grace *time.Time
	if c.PreviousValidUntil != nil {
		t := c.PreviousValidUntil.UTC()
		grace = &t
	}
	return contracts.AdminHostCode{Code: c.Code, CurrentStartedAt: c.CurrentStartedAt.UTC(), RotatesAt: c.RotatesAt.UTC(),
		PreviousValidUntil: grace, ServerTime: c.ServerTime.UTC()}
}

func contractHost(h Host) contracts.AdminHost {
	var id openapi_types.UUID
	_ = id.UnmarshalText([]byte(h.UserID))
	var email *openapi_types.Email
	if h.Email != nil {
		value := openapi_types.Email(*h.Email)
		email = &value
	}
	return contracts.AdminHost{UserId: id, Kind: contracts.AdminHostKind(h.Kind), Email: email,
		LastPlayedAs: h.LastPlayedAs, HostSince: h.HostSince.UTC(), Note: h.Note}
}
