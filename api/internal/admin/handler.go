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

// AppEnv is local, staging, or production. Production cleanup always keeps at least 24 hours.
type Handler struct {
	Store  Store
	AppEnv string
}

func (h Handler) MarkQA(w http.ResponseWriter, r *http.Request) {
	var body contracts.PostV1AdminQaAccountsJSONBody
	if !server.DecodeJSON(w, r, &body) {
		return
	}
	if len(body.Accounts) == 0 || len(body.Accounts) > 20 {
		server.Problem(w, http.StatusBadRequest, "invalid-request", "Invalid request body")
		return
	}
	accounts := make([]QAAccount, 0, len(body.Accounts))
	seen := make(map[string]struct{}, len(body.Accounts))
	for _, account := range body.Accounts {
		label := strings.TrimSpace(account.Label)
		userID := account.UserId.String()
		if (account.Role != contracts.QaAccountRoleHost && account.Role != contracts.QaAccountRoleContestant) ||
			utf8.RuneCountInString(label) < 1 || utf8.RuneCountInString(label) > 20 {
			server.Problem(w, http.StatusBadRequest, "invalid-request", "Invalid request body")
			return
		}
		if _, duplicate := seen[userID]; duplicate {
			server.Problem(w, http.StatusBadRequest, "invalid-request", "Invalid request body")
			return
		}
		seen[userID] = struct{}{}
		accounts = append(accounts, QAAccount{UserID: userID, Role: string(account.Role), Label: label})
	}
	if h.handleQAError(w, r, "admin QA accounts failed", h.Store.MarkQA(r.Context(), server.Claims(r.Context()), accounts)) {
		return
	}
	slog.InfoContext(r.Context(), "qa accounts marked", "request_id", server.RequestID(r.Context()),
		"count", len(accounts))
	w.WriteHeader(http.StatusNoContent)
}

func (h Handler) CleanupQA(w http.ResponseWriter, r *http.Request) {
	var body contracts.PostV1AdminQaCleanupJSONBody
	if !server.DecodeJSON(w, r, &body) {
		return
	}
	if body.OlderThanHours < 0 || body.OlderThanHours > 8760 {
		server.Problem(w, http.StatusBadRequest, "invalid-request", "Invalid request body")
		return
	}
	if h.AppEnv == "production" && body.OlderThanHours < 24 {
		body.OlderThanHours = 24
	}
	removed, err := h.Store.CleanupQA(r.Context(), server.Claims(r.Context()), body.OlderThanHours, body.DryRun)
	if h.handleQAError(w, r, "admin QA cleanup failed", err) {
		return
	}
	result := make([]contracts.QaCleanupItem, 0, len(removed))
	rooms, games := 0, 0
	for _, item := range removed {
		var id openapi_types.UUID
		if err := id.UnmarshalText([]byte(item.ID)); err != nil {
			h.handleQAError(w, r, "admin QA cleanup failed", err)
			return
		}
		kind := contracts.QaCleanupItemKind(item.Kind)
		result = append(result, contracts.QaCleanupItem{Kind: kind, Id: id})
		switch kind {
		case contracts.QaCleanupItemKindRoom:
			rooms++
		case contracts.QaCleanupItemKindGame:
			games++
		}
	}
	slog.InfoContext(r.Context(), "qa cleanup", "request_id", server.RequestID(r.Context()),
		"dry_run", body.DryRun, "rooms", rooms, "games", games)
	server.JSON(w, http.StatusOK, struct {
		Removed []contracts.QaCleanupItem `json:"removed"`
	}{Removed: result})
}

// QA operator logs deliberately omit user and target ids; the task's evidence may contain
// only aggregate counts.
func (h Handler) handleQAError(w http.ResponseWriter, r *http.Request, message string, err error) bool {
	switch {
	case err == nil:
		return false
	case errors.Is(err, ErrNotFound):
		server.NotFound(w, r)
	case errors.Is(err, ErrInvalid):
		server.Problem(w, http.StatusBadRequest, "invalid-request", "Invalid request")
	default:
		slog.ErrorContext(r.Context(), message, "err", err, "request_id", server.RequestID(r.Context()))
		server.Problem(w, http.StatusInternalServerError, "internal", "Something went wrong")
	}
	return true
}

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

// CleanupRuns lists the last 30 guest-cleanup runs (data-retention.md).
func (h Handler) CleanupRuns(w http.ResponseWriter, r *http.Request) {
	runs, err := h.Store.CleanupRuns(r.Context(), server.Claims(r.Context()))
	if h.handleError(w, r, "admin cleanup runs failed", err) {
		return
	}
	result := make([]contracts.CleanupRun, 0, len(runs))
	for _, run := range runs {
		result = append(result, contracts.CleanupRun{RunAt: run.RunAt.UTC(), Deleted: run.Deleted,
			DurationMs: run.DurationMs, Error: run.Error})
	}
	server.JSON(w, http.StatusOK, struct {
		Runs []contracts.CleanupRun `json:"runs"`
	}{Runs: result})
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
