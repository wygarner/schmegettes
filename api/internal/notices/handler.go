package notices

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"time"
	"unicode/utf8"

	openapi_types "github.com/oapi-codegen/runtime/types"

	"schmegettes/api/internal/contracts"
	"schmegettes/api/internal/server"
)

type Handler struct {
	Store      Store
	StatusPage StatusPage
}

func (h Handler) Active(w http.ResponseWriter, r *http.Request) {
	notices, serverTime, err := h.Store.Active(r.Context(), server.Claims(r.Context()))
	if err != nil {
		slog.ErrorContext(r.Context(), "notices failed", "err", err, "request_id", server.RequestID(r.Context()))
		server.Problem(w, http.StatusInternalServerError, "internal", "Something went wrong")
		return
	}
	result := make([]contracts.Notice, 0, len(notices))
	for _, n := range notices {
		result = append(result, contractNotice(n))
	}
	server.JSON(w, http.StatusOK, struct {
		Notices    []contracts.Notice `json:"notices"`
		ServerTime time.Time          `json:"serverTime"`
	}{result, serverTime.UTC()})
}

func (h Handler) List(w http.ResponseWriter, r *http.Request, days *int) {
	value := 30
	if days != nil {
		value = *days
	}
	if value < 1 || value > 365 {
		server.Problem(w, http.StatusBadRequest, "invalid-notice", "Days must be between 1 and 365")
		return
	}
	notices, err := h.Store.AdminList(r.Context(), server.Claims(r.Context()), value)
	if h.handleError(w, r, err) {
		return
	}
	result := make([]contracts.AdminNotice, 0, len(notices))
	for _, n := range notices {
		result = append(result, contractAdminNotice(n))
	}
	server.JSON(w, http.StatusOK, result)
}

func validInput(in Input) bool {
	if in.Kind != "incident" && in.Kind != "maintenance" && in.Kind != "whats_new" {
		return false
	}
	if utf8.RuneCountInString(strings.TrimSpace(in.Title)) < 1 || utf8.RuneCountInString(strings.TrimSpace(in.Title)) > 60 || utf8.RuneCountInString(in.Body) > 280 {
		return false
	}
	if in.Link != nil {
		u, err := url.Parse(*in.Link)
		if err != nil || u.Scheme != "https" || u.Host == "" {
			return false
		}
	}
	if in.Kind == "maintenance" {
		return in.StartsAt != nil && in.EndsAt != nil && in.EndsAt.After(*in.StartsAt)
	}
	return in.StartsAt == nil && in.EndsAt == nil
}

func (h Handler) Post(w http.ResponseWriter, r *http.Request) {
	var body contracts.NoticeInput
	if !server.DecodeJSON(w, r, &body) {
		return
	}
	in := Input{Kind: string(body.Kind), Title: body.Title, Body: body.Body, Link: body.Link, StartsAt: body.StartsAt, EndsAt: body.EndsAt}
	if !validInput(in) {
		server.Problem(w, http.StatusBadRequest, "invalid-notice", "Invalid notice")
		return
	}
	n, err := h.Store.Post(r.Context(), server.Claims(r.Context()), in)
	if h.handleError(w, r, err) {
		return
	}
	n = h.sync(r, n, syncOpen)
	slog.InfoContext(r.Context(), "notice posted", "notice_id", n.ID, "kind", n.Kind, "revision", n.Revision)
	server.JSON(w, http.StatusCreated, contractAdminNotice(n))
}

func (h Handler) Edit(w http.ResponseWriter, r *http.Request, id openapi_types.UUID) {
	var patch map[string]json.RawMessage
	if !server.DecodeJSON(w, r, &patch) || !validPatch(patch) {
		if patch != nil {
			server.Problem(w, http.StatusBadRequest, "invalid-notice", "Invalid notice")
		}
		return
	}
	raw, _ := json.Marshal(patch)
	n, err := h.Store.Edit(r.Context(), server.Claims(r.Context()), id.String(), raw)
	if h.handleError(w, r, err) {
		return
	}
	n = h.sync(r, n, syncUpdate)
	slog.InfoContext(r.Context(), "notice edited", "notice_id", n.ID, "kind", n.Kind, "revision", n.Revision)
	server.JSON(w, http.StatusOK, contractAdminNotice(n))
}

func validPatch(patch map[string]json.RawMessage) bool {
	if len(patch) == 0 {
		return false
	}
	for key, raw := range patch {
		switch key {
		case "title", "body":
			var value string
			if json.Unmarshal(raw, &value) != nil {
				return false
			}
			length := utf8.RuneCountInString(value)
			if (key == "title" && (utf8.RuneCountInString(strings.TrimSpace(value)) < 1 || length > 60)) || (key == "body" && length > 280) {
				return false
			}
		case "link":
			if string(raw) == "null" {
				continue
			}
			var value string
			if json.Unmarshal(raw, &value) != nil {
				return false
			}
			u, err := url.Parse(value)
			if err != nil || u.Scheme != "https" || u.Host == "" {
				return false
			}
		case "startsAt", "endsAt":
			if string(raw) == "null" {
				continue
			}
			var value time.Time
			if json.Unmarshal(raw, &value) != nil {
				return false
			}
		default:
			return false
		}
	}
	return true
}

func (h Handler) Resolve(w http.ResponseWriter, r *http.Request, id openapi_types.UUID) {
	var body contracts.PostV1AdminNoticesIdResolveJSONBody
	if !server.DecodeJSON(w, r, &body) {
		return
	}
	resolution := strings.TrimSpace(body.Resolution)
	if utf8.RuneCountInString(resolution) < 1 || utf8.RuneCountInString(resolution) > 280 {
		server.Problem(w, http.StatusBadRequest, "invalid-notice", "A closing line is required")
		return
	}
	n, err := h.Store.Resolve(r.Context(), server.Claims(r.Context()), id.String(), resolution)
	if h.handleError(w, r, err) {
		return
	}
	n = h.sync(r, n, syncResolve)
	slog.InfoContext(r.Context(), "notice resolved", "notice_id", n.ID, "kind", n.Kind, "revision", n.Revision)
	server.JSON(w, http.StatusOK, contractAdminNotice(n))
}

func (h Handler) Retry(w http.ResponseWriter, r *http.Request, id openapi_types.UUID) {
	list, err := h.Store.AdminList(r.Context(), server.Claims(r.Context()), 365)
	if h.handleError(w, r, err) {
		return
	}
	var found *Notice
	for i := range list {
		if list[i].ID == id.String() {
			found = &list[i]
			break
		}
	}
	if found == nil {
		server.NotFound(w, r)
		return
	}
	action := syncUpdate
	if found.StatusPageRef == nil {
		action = syncOpen
	}
	if found.ResolvedAt != nil {
		action = syncResolve
	}
	n := h.sync(r, *found, action)
	server.JSON(w, http.StatusOK, contractAdminNotice(n))
}

type syncKind int

const (
	syncOpen syncKind = iota
	syncUpdate
	syncResolve
)

func (h Handler) sync(r *http.Request, n Notice, action syncKind) Notice {
	if n.Kind == "whats_new" || h.StatusPage == nil {
		return n
	}
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	ref := ""
	if n.StatusPageRef != nil {
		ref = *n.StatusPageRef
	}
	var err error
	if action == syncOpen || ref == "" {
		ref, err = h.StatusPage.Open(ctx, n)
		if err == nil && action == syncResolve && ref != "" {
			n.StatusPageRef = &ref
			err = h.StatusPage.Resolve(ctx, n)
		}
	} else if action == syncResolve {
		err = h.StatusPage.Resolve(ctx, n)
	} else {
		err = h.StatusPage.Update(ctx, n)
	}
	status := "ok"
	var syncError *string
	if err != nil {
		status = "failed"
		message := err.Error()
		syncError = &message
		slog.WarnContext(r.Context(), "status page sync failed", "err", err,
			"notice_id", n.ID, "provider_status", status)
	}
	updated, storeErr := h.Store.SetSync(r.Context(), server.Claims(r.Context()), n.ID, ref, status, syncError)
	if storeErr != nil {
		slog.ErrorContext(r.Context(), "notice sync state failed", "err", storeErr,
			"request_id", server.RequestID(r.Context()), "notice_id", n.ID)
		return n
	}
	return updated
}

func (h Handler) handleError(w http.ResponseWriter, r *http.Request, err error) bool {
	switch {
	case err == nil:
		return false
	case errors.Is(err, ErrNotFound):
		server.NotFound(w, r)
	case errors.Is(err, ErrNotIncident):
		server.Problem(w, http.StatusBadRequest, "not-an-incident", "Only incidents can be resolved")
	case errors.Is(err, ErrInvalid):
		server.Problem(w, http.StatusBadRequest, "invalid-notice", "Invalid notice")
	default:
		slog.ErrorContext(r.Context(), "notice operation failed", "err", err,
			"request_id", server.RequestID(r.Context()), "user_id", server.Claims(r.Context()).UserID)
		server.Problem(w, http.StatusInternalServerError, "internal", "Something went wrong")
	}
	return true
}

func contractNotice(n Notice) contracts.Notice {
	var id openapi_types.UUID
	_ = id.UnmarshalText([]byte(n.ID))
	return contracts.Notice{Id: id, Revision: n.Revision, Kind: contracts.NoticeKind(n.Kind),
		Phase: contracts.NoticePhase(n.Phase), Title: n.Title, Body: n.Body, Link: n.Link,
		StartsAt: utc(n.StartsAt), EndsAt: utc(n.EndsAt), ResolvedAt: utc(n.ResolvedAt), Resolution: n.Resolution}
}

func contractAdminNotice(n Notice) contracts.AdminNotice {
	base := contractNotice(n)
	var createdBy openapi_types.UUID
	_ = createdBy.UnmarshalText([]byte(n.CreatedBy))
	return contracts.AdminNotice{Id: base.Id, Revision: base.Revision, Kind: base.Kind, Phase: base.Phase,
		Title: base.Title, Body: base.Body, Link: base.Link, StartsAt: base.StartsAt, EndsAt: base.EndsAt,
		ResolvedAt: base.ResolvedAt, Resolution: base.Resolution, StatusPageSync: contracts.AdminNoticeStatusPageSync(n.StatusPageSync),
		StatusPageError: n.StatusPageError, CreatedBy: createdBy, History: n.History,
		CreatedAt: n.CreatedAt.UTC(), UpdatedAt: n.UpdatedAt.UTC()}
}

func utc(value *time.Time) *time.Time {
	if value == nil {
		return nil
	}
	result := value.UTC()
	return &result
}
