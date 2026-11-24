package notices

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	openapi_types "github.com/oapi-codegen/runtime/types"

	"schmegettes/golib/auth"
)

// scriptedStore returns a set error from every call, or the notice it holds.
type scriptedStore struct {
	notice  Notice
	list    []Notice
	err     error
	syncErr error
	days    int
	edited  []byte
	refs    []string
}

func (s *scriptedStore) Active(context.Context, auth.Claims) ([]Notice, time.Time, error) {
	return []Notice{s.notice}, testNotice.CreatedAt, s.err
}
func (s *scriptedStore) AdminList(_ context.Context, _ auth.Claims, days int) ([]Notice, error) {
	s.days = days
	if s.list != nil {
		return s.list, s.err
	}
	return []Notice{s.notice}, s.err
}
func (s *scriptedStore) Post(context.Context, auth.Claims, Input) (Notice, error) {
	return s.notice, s.err
}
func (s *scriptedStore) Edit(_ context.Context, _ auth.Claims, _ string, patch []byte) (Notice, error) {
	s.edited = patch
	return s.notice, s.err
}
func (s *scriptedStore) Resolve(context.Context, auth.Claims, string, string) (Notice, error) {
	return s.notice, s.err
}
func (s *scriptedStore) SetSync(_ context.Context, _ auth.Claims, _ string, ref, status string, syncError *string) (Notice, error) {
	s.refs = append(s.refs, ref)
	n := s.notice
	n.StatusPageSync, n.StatusPageError = status, syncError
	if ref != "" {
		n.StatusPageRef = &ref
	}
	return n, s.syncErr
}

// recordingPage records which provider calls the handler made.
type recordingPage struct{ calls []string }

func (p *recordingPage) Open(context.Context, Notice) (string, error) {
	p.calls = append(p.calls, "open")
	return "incident-1", nil
}
func (p *recordingPage) Update(context.Context, Notice) error {
	p.calls = append(p.calls, "update")
	return nil
}
func (p *recordingPage) Resolve(context.Context, Notice) error {
	p.calls = append(p.calls, "resolve")
	return nil
}

func do(handle func(http.ResponseWriter, *http.Request), body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handle(rec, req)
	return rec
}

func ptr[T any](v T) *T { return &v }

var noticeID = openapi_types.UUID{0x25, 0x21}

func TestValidInput(t *testing.T) {
	start := time.Date(2026, 12, 1, 10, 0, 0, 0, time.UTC)
	end := start.Add(time.Hour)
	cases := []struct {
		name string
		in   Input
		ok   bool
	}{
		{"incident", Input{Kind: "incident", Title: "Slow"}, true},
		{"whats new with https link", Input{Kind: "whats_new", Title: "New", Link: ptr("https://example.com/x")}, true},
		{"maintenance window", Input{Kind: "maintenance", Title: "Upgrade", StartsAt: &start, EndsAt: &end}, true},
		{"unknown kind", Input{Kind: "outage", Title: "x"}, false},
		{"blank title", Input{Kind: "incident", Title: "   "}, false},
		{"title too long", Input{Kind: "incident", Title: strings.Repeat("a", 61)}, false},
		{"body too long", Input{Kind: "incident", Title: "x", Body: strings.Repeat("é", 281)}, false},
		{"http link", Input{Kind: "incident", Title: "x", Link: ptr("http://example.com")}, false},
		{"link without host", Input{Kind: "incident", Title: "x", Link: ptr("https://")}, false},
		{"maintenance without window", Input{Kind: "maintenance", Title: "x"}, false},
		{"maintenance ending before it starts", Input{Kind: "maintenance", Title: "x", StartsAt: &end, EndsAt: &start}, false},
		{"incident with a window", Input{Kind: "incident", Title: "x", StartsAt: &start, EndsAt: &end}, false},
	}
	for _, c := range cases {
		if got := validInput(c.in); got != c.ok {
			t.Errorf("%s: validInput = %v, want %v", c.name, got, c.ok)
		}
	}
}

func TestValidPatch(t *testing.T) {
	cases := []struct {
		patch string
		ok    bool
	}{
		{`{"title":"New title"}`, true},
		{`{"body":"Fixed","link":null,"startsAt":null,"endsAt":"2026-12-01T10:00:00Z"}`, true},
		{`{"link":"https://example.com/status"}`, true},
		{`{}`, false},
		{`{"title":"  "}`, false},
		{`{"title":5}`, false},
		{`{"body":"` + strings.Repeat("a", 281) + `"}`, false},
		{`{"link":"ftp://example.com"}`, false},
		{`{"link":7}`, false},
		{`{"startsAt":"not a time"}`, false},
		{`{"kind":"incident"}`, false},
	}
	for _, c := range cases {
		var patch map[string]json.RawMessage
		if err := json.Unmarshal([]byte(c.patch), &patch); err != nil {
			t.Fatal(err)
		}
		if got := validPatch(patch); got != c.ok {
			t.Errorf("%s: validPatch = %v, want %v", c.patch, got, c.ok)
		}
	}
}

func TestListDays(t *testing.T) {
	store := &scriptedStore{notice: testNotice}
	h := Handler{Store: store}
	rec := do(func(w http.ResponseWriter, r *http.Request) { h.List(w, r, nil) }, "")
	if rec.Code != http.StatusOK || store.days != 30 {
		t.Fatalf("default: %d days=%d", rec.Code, store.days)
	}
	rec = do(func(w http.ResponseWriter, r *http.Request) { h.List(w, r, ptr(90)) }, "")
	if rec.Code != http.StatusOK || store.days != 90 {
		t.Fatalf("90: %d days=%d", rec.Code, store.days)
	}
	for _, days := range []int{0, 366} {
		rec = do(func(w http.ResponseWriter, r *http.Request) { h.List(w, r, ptr(days)) }, "")
		if rec.Code != http.StatusBadRequest {
			t.Fatalf("days=%d: %d", days, rec.Code)
		}
	}
}

func TestErrorMapping(t *testing.T) {
	cases := []struct {
		err    error
		status int
		kind   string
	}{
		{ErrNotFound, http.StatusNotFound, ""},
		{ErrNotIncident, http.StatusBadRequest, "not-an-incident"},
		{ErrInvalid, http.StatusBadRequest, "invalid-notice"},
		{errors.New("database down"), http.StatusInternalServerError, "internal"},
	}
	for _, c := range cases {
		h := Handler{Store: &scriptedStore{notice: testNotice, err: c.err}}
		rec := do(func(w http.ResponseWriter, r *http.Request) { h.Resolve(w, r, noticeID) }, `{"resolution":"Fixed"}`)
		if rec.Code != c.status || !strings.Contains(rec.Body.String(), c.kind) {
			t.Errorf("%v: %d %s", c.err, rec.Code, rec.Body)
		}
		if strings.Contains(rec.Body.String(), "database down") {
			t.Errorf("internal error leaked to the client: %s", rec.Body)
		}
	}
	rec := do(Handler{Store: &scriptedStore{err: errors.New("down")}}.Active, "")
	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("active error: %d", rec.Code)
	}
}

func TestPostRejectsInvalidNotice(t *testing.T) {
	store := &scriptedStore{notice: testNotice}
	rec := do(Handler{Store: store}.Post, `{"kind":"maintenance","title":"No window","body":""}`)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("%d %s", rec.Code, rec.Body)
	}
}

func TestEdit(t *testing.T) {
	notice := testNotice
	notice.StatusPageRef = ptr("incident-1")
	store := &scriptedStore{notice: notice}
	page := &recordingPage{}
	h := Handler{Store: store, StatusPage: page}
	edit := func(body string) *httptest.ResponseRecorder {
		return do(func(w http.ResponseWriter, r *http.Request) { h.Edit(w, r, noticeID) }, body)
	}
	if rec := edit(`{"title":"Buzzers fixed"}`); rec.Code != http.StatusOK {
		t.Fatalf("%d %s", rec.Code, rec.Body)
	}
	if string(store.edited) != `{"title":"Buzzers fixed"}` || len(page.calls) != 1 || page.calls[0] != "update" {
		t.Fatalf("edited=%s calls=%v", store.edited, page.calls)
	}
	if rec := edit(`{"kind":"maintenance"}`); rec.Code != http.StatusBadRequest {
		t.Fatalf("unknown field: %d", rec.Code)
	}
	if rec := edit(`not json`); rec.Code != http.StatusBadRequest {
		t.Fatalf("bad json: %d", rec.Code)
	}
}

func TestResolveNeedsAClosingLine(t *testing.T) {
	h := Handler{Store: &scriptedStore{notice: testNotice}}
	for _, body := range []string{`{"resolution":"  "}`, `{"resolution":"` + strings.Repeat("a", 281) + `"}`} {
		rec := do(func(w http.ResponseWriter, r *http.Request) { h.Resolve(w, r, noticeID) }, body)
		if rec.Code != http.StatusBadRequest {
			t.Fatalf("%s: %d", body, rec.Code)
		}
	}
}

func TestSyncChoosesTheProviderCall(t *testing.T) {
	resolvedAt := time.Date(2026, 11, 22, 13, 0, 0, 0, time.UTC)
	cases := []struct {
		name   string
		notice Notice
		action syncKind
		calls  []string
	}{
		{"new incident opens", testNotice, syncOpen, []string{"open"}},
		{"edit updates the open incident", withRef(testNotice), syncUpdate, []string{"update"}},
		{"resolve resolves the open incident", withRef(testNotice), syncResolve, []string{"resolve"}},
		{"resolve before it was ever opened opens then resolves", testNotice, syncResolve, []string{"open", "resolve"}},
		{"edit before it was ever opened opens", testNotice, syncUpdate, []string{"open"}},
		{"what's new never reaches the status page", Notice{ID: testNotice.ID, Kind: "whats_new"}, syncOpen, nil},
	}
	for _, c := range cases {
		page := &recordingPage{}
		c.notice.ResolvedAt = &resolvedAt
		store := &scriptedStore{notice: c.notice}
		h := Handler{Store: store, StatusPage: page}
		n := h.sync(httptest.NewRequest(http.MethodPost, "/", nil), c.notice, c.action)
		if strings.Join(page.calls, ",") != strings.Join(c.calls, ",") {
			t.Errorf("%s: calls %v, want %v", c.name, page.calls, c.calls)
		}
		if c.calls != nil && n.StatusPageSync != "ok" {
			t.Errorf("%s: sync state %q", c.name, n.StatusPageSync)
		}
	}
}

func TestSyncKeepsTheNoticeWhenTheSyncStateCannotBeSaved(t *testing.T) {
	store := &scriptedStore{notice: testNotice, syncErr: errors.New("down")}
	h := Handler{Store: store, StatusPage: &recordingPage{}}
	n := h.sync(httptest.NewRequest(http.MethodPost, "/", nil), testNotice, syncOpen)
	if n.ID != testNotice.ID || n.StatusPageRef != nil {
		t.Fatalf("got %+v", n)
	}
}

func TestRetry(t *testing.T) {
	missing := do(func(w http.ResponseWriter, r *http.Request) {
		Handler{Store: &scriptedStore{list: []Notice{}}}.Retry(w, r, noticeID)
	}, "")
	if missing.Code != http.StatusNotFound {
		t.Fatalf("missing: %d", missing.Code)
	}

	resolvedAt := time.Date(2026, 11, 22, 13, 0, 0, 0, time.UTC)
	resolved := withRef(testNotice)
	resolved.ResolvedAt = &resolvedAt
	var id openapi_types.UUID
	if err := id.UnmarshalText([]byte(testNotice.ID)); err != nil {
		t.Fatal(err)
	}
	for _, c := range []struct {
		notice Notice
		call   string
	}{{testNotice, "open"}, {withRef(testNotice), "update"}, {resolved, "resolve"}} {
		page := &recordingPage{}
		h := Handler{Store: &scriptedStore{notice: c.notice}, StatusPage: page}
		rec := do(func(w http.ResponseWriter, r *http.Request) { h.Retry(w, r, id) }, "")
		if rec.Code != http.StatusOK || len(page.calls) != 1 || page.calls[0] != c.call {
			t.Errorf("want %s: %d calls=%v", c.call, rec.Code, page.calls)
		}
	}

	failing := do(func(w http.ResponseWriter, r *http.Request) {
		Handler{Store: &scriptedStore{err: errors.New("down")}}.Retry(w, r, id)
	}, "")
	if failing.Code != http.StatusInternalServerError || !bytes.Contains(failing.Body.Bytes(), []byte("internal")) {
		t.Fatalf("store error: %d", failing.Code)
	}
}

func withRef(n Notice) Notice {
	n.StatusPageRef = ptr("incident-1")
	return n
}
