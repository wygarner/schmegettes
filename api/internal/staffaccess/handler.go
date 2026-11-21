package staffaccess

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"unicode/utf8"

	openapi_types "github.com/oapi-codegen/runtime/types"

	"schmegettes/api/internal/contracts"
	"schmegettes/api/internal/server"
)

const (
	defaultMinutes = 60
	maxMinutes     = 480
	maxReason      = 200
	maxAction      = 40
)

type Handler struct{ Store Store }

// Grant creates a grant for the caller. The reason is stored, never logged.
func (h Handler) Grant(w http.ResponseWriter, r *http.Request) {
	var body contracts.PostV1AdminStaffAccessJSONBody
	if !server.DecodeJSON(w, r, &body) {
		return
	}
	reason := strings.TrimSpace(body.Reason)
	minutes := defaultMinutes
	if body.Minutes != nil {
		minutes = *body.Minutes
	}
	switch {
	case body.SubjectType != "user" && body.SubjectType != "room" && body.SubjectType != "game",
		reason == "", utf8.RuneCountInString(reason) > maxReason,
		minutes < 1, minutes > maxMinutes:
		invalidGrant(w)
		return
	}
	g, err := h.Store.Grant(r.Context(), server.Claims(r.Context()),
		Subject{Type: body.SubjectType, ID: body.SubjectId.String()}, reason, minutes)
	if errors.Is(err, ErrInvalid) {
		invalidGrant(w)
		return
	}
	if h.handleError(w, r, "staff access grant failed", err) {
		return
	}
	// Observability alerts the admin on every one of these lines.
	slog.WarnContext(r.Context(), "staff access granted", "request_id", server.RequestID(r.Context()),
		"user_id", server.Claims(r.Context()).UserID, "grant_id", g.ID,
		"subject_type", g.Subject.Type, "subject_id", g.Subject.ID, "minutes", minutes)
	server.JSON(w, http.StatusCreated, contracts.StaffGrant{GrantId: uuid(g.ID), SubjectType: g.Subject.Type,
		SubjectId: uuid(g.Subject.ID), ExpiresAt: g.ExpiresAt.UTC()})
}

// Read returns the grant's subject. The payload is never logged.
func (h Handler) Read(w http.ResponseWriter, r *http.Request, grantID openapi_types.UUID) {
	raw, err := h.Store.Read(r.Context(), server.Claims(r.Context()), grantID.String())
	if h.handleError(w, r, "staff access read failed", err) {
		return
	}
	subject, body, err := checkSubject(raw)
	if err != nil {
		h.handleError(w, r, "staff access read failed", err)
		return
	}
	slog.InfoContext(r.Context(), "staff access read", "request_id", server.RequestID(r.Context()),
		"user_id", server.Claims(r.Context()).UserID, "grant_id", grantID.String(),
		"subject_type", subject.Type, "subject_id", subject.ID)
	server.JSON(w, http.StatusOK, body)
}

func (h Handler) Revoke(w http.ResponseWriter, r *http.Request, grantID openapi_types.UUID) {
	subject, err := h.Store.Revoke(r.Context(), server.Claims(r.Context()), grantID.String())
	if h.handleError(w, r, "staff access revoke failed", err) {
		return
	}
	slog.InfoContext(r.Context(), "staff access revoked", "request_id", server.RequestID(r.Context()),
		"user_id", server.Claims(r.Context()).UserID, "grant_id", grantID.String(),
		"subject_type", subject.Type, "subject_id", subject.ID)
	w.WriteHeader(http.StatusNoContent)
}

func (h Handler) Audit(w http.ResponseWriter, r *http.Request, params contracts.GetV1AdminAuditParams) {
	if params.Action != nil && len(*params.Action) > maxAction {
		server.Problem(w, http.StatusBadRequest, "invalid-request", "Invalid request")
		return
	}
	filter := AuditFilter{Since: params.Since, Action: params.Action}
	if params.Subject != nil {
		s := params.Subject.String()
		filter.Subject = &s
	}
	entries, err := h.Store.Audit(r.Context(), server.Claims(r.Context()), filter)
	if h.handleError(w, r, "admin audit read failed", err) {
		return
	}
	result := make([]contracts.AuditEntry, 0, len(entries))
	for _, e := range entries {
		details := e.Details
		if details == nil {
			details = map[string]any{}
		}
		result = append(result, contracts.AuditEntry{Id: e.ID, At: e.At.UTC(), Actor: optUUID(e.Actor), Action: e.Action,
			SubjectType: e.SubjectType, SubjectId: optUUID(e.SubjectID), RequestId: e.RequestID, Details: details})
	}
	server.JSON(w, http.StatusOK, result)
}

// checkSubject decodes the database's JSON into the contract type for its kind, refusing any
// field the contract doesn't name, so nothing beyond the documented shape (no email, no
// tokens) can reach a response.
func checkSubject(raw json.RawMessage) (Subject, any, error) {
	var head struct {
		Kind string `json:"kind"`
	}
	if err := json.Unmarshal(raw, &head); err != nil {
		return Subject{}, nil, fmt.Errorf("staff subject: %w", err)
	}
	strict := func(into any) error {
		dec := json.NewDecoder(bytes.NewReader(raw))
		dec.DisallowUnknownFields()
		if err := dec.Decode(into); err != nil {
			return fmt.Errorf("staff subject %s: %w", head.Kind, err)
		}
		return nil
	}
	switch head.Kind {
	case "user":
		var u contracts.StaffUser
		err := strict(&u)
		return Subject{Type: "user", ID: u.UserId.String()}, u, err
	case "room":
		var rm contracts.StaffRoom
		err := strict(&rm)
		return Subject{Type: "room", ID: rm.RoomId.String()}, rm, err
	case "game":
		var g contracts.StaffGame
		err := strict(&g)
		return Subject{Type: "game", ID: g.GameId.String()}, g, err
	}
	return Subject{}, nil, fmt.Errorf("staff subject: unknown kind %q", head.Kind)
}

func invalidGrant(w http.ResponseWriter) {
	server.Problem(w, http.StatusBadRequest, "invalid-grant",
		"Give a user, room, or game that exists, a reason of 1 to 200 characters, and 1 to 480 minutes")
}

func (h Handler) handleError(w http.ResponseWriter, r *http.Request, message string, err error) bool {
	switch {
	case err == nil:
		return false
	case errors.Is(err, ErrNotFound):
		server.NotFound(w, r)
	case errors.Is(err, ErrInactive):
		server.Problem(w, http.StatusForbidden, "grant-inactive", "This grant has expired, was revoked, or isn't yours")
	case errors.Is(err, ErrInvalid):
		server.Problem(w, http.StatusBadRequest, "invalid-request", "Invalid request")
	default:
		slog.ErrorContext(r.Context(), message, "err", err, "request_id", server.RequestID(r.Context()),
			"user_id", server.Claims(r.Context()).UserID)
		server.Problem(w, http.StatusInternalServerError, "internal", "Something went wrong")
	}
	return true
}

func uuid(s string) openapi_types.UUID {
	var id openapi_types.UUID
	_ = id.UnmarshalText([]byte(s))
	return id
}

func optUUID(s *string) *openapi_types.UUID {
	if s == nil {
		return nil
	}
	id := uuid(*s)
	return &id
}
