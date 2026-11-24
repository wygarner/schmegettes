package contracts_test

// Pins how the generated wrapper binds every query parameter in shared/openapi.yaml, so a
// generator upgrade can't change parsing unnoticed. Range and enum checks belong to the handlers
// (and their tests); this file covers only what reaches them.

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"schmegettes/api/internal/contracts"
)

type recorder struct {
	contracts.ServerInterface
	notices *contracts.GetV1AdminNoticesParams
	audit   *contracts.GetV1AdminAuditParams
	games   *contracts.GetV1GamesParams
}

func (r *recorder) GetV1AdminNotices(w http.ResponseWriter, _ *http.Request, p contracts.GetV1AdminNoticesParams) {
	r.notices = &p
	w.WriteHeader(http.StatusOK)
}

func (r *recorder) GetV1AdminAudit(w http.ResponseWriter, _ *http.Request, p contracts.GetV1AdminAuditParams) {
	r.audit = &p
	w.WriteHeader(http.StatusOK)
}

func (r *recorder) GetV1Games(w http.ResponseWriter, _ *http.Request, p contracts.GetV1GamesParams) {
	r.games = &p
	w.WriteHeader(http.StatusOK)
}

func get(t *testing.T, target string) (*recorder, int) {
	t.Helper()
	rec := &recorder{}
	handler := contracts.HandlerWithOptions(rec, contracts.StdHTTPServerOptions{
		BaseRouter: http.NewServeMux(),
		ErrorHandlerFunc: func(w http.ResponseWriter, _ *http.Request, _ error) {
			w.WriteHeader(http.StatusBadRequest)
		},
	})
	res := httptest.NewRecorder()
	handler.ServeHTTP(res, httptest.NewRequest(http.MethodGet, target, nil))
	return rec, res.Code
}

func TestNoticesDaysBinding(t *testing.T) {
	rec, code := get(t, "/v1/admin/notices")
	if code != http.StatusOK || rec.notices.Days != nil {
		t.Fatalf("absent: %d %v", code, rec.notices)
	}
	for _, tc := range []struct {
		query string
		want  int
	}{{"90", 90}, {"0", 0}, {"366", 366}, {"-1", -1}} {
		rec, code = get(t, "/v1/admin/notices?days="+tc.query)
		if code != http.StatusOK || rec.notices.Days == nil || *rec.notices.Days != tc.want {
			t.Errorf("days=%s: %d %v", tc.query, code, rec.notices)
		}
	}
	for _, bad := range []string{"abc", "1.5", "9%2C0"} {
		if _, code = get(t, "/v1/admin/notices?days="+bad); code != http.StatusBadRequest {
			t.Errorf("days=%s: %d, want 400", bad, code)
		}
	}
}

func TestAuditBinding(t *testing.T) {
	rec, code := get(t, "/v1/admin/audit")
	if code != http.StatusOK || rec.audit.Since != nil || rec.audit.Action != nil || rec.audit.Subject != nil {
		t.Fatalf("absent: %d %+v", code, rec.audit)
	}

	rec, code = get(t, "/v1/admin/audit?since=2026-11-24T10%3A00%3A00Z&action=staff_read&subject=25210000-0000-4000-8000-000000000001")
	if code != http.StatusOK {
		t.Fatalf("valid: %d", code)
	}
	if want := time.Date(2026, 11, 24, 10, 0, 0, 0, time.UTC); rec.audit.Since == nil || !rec.audit.Since.Equal(want) {
		t.Errorf("since = %v", rec.audit.Since)
	}
	if rec.audit.Action == nil || *rec.audit.Action != "staff_read" {
		t.Errorf("action = %v", rec.audit.Action)
	}
	if rec.audit.Subject == nil || rec.audit.Subject.String() != "25210000-0000-4000-8000-000000000001" {
		t.Errorf("subject = %v", rec.audit.Subject)
	}

	// A string value keeps an encoded comma as a literal comma.
	rec, code = get(t, "/v1/admin/audit?action=a%2Cb")
	if code != http.StatusOK || rec.audit.Action == nil || *rec.audit.Action != "a,b" {
		t.Errorf("encoded comma: %d %v", code, rec.audit.Action)
	}

	for _, bad := range []string{"since=yesterday", "subject=not-a-uuid"} {
		if _, code = get(t, "/v1/admin/audit?"+bad); code != http.StatusBadRequest {
			t.Errorf("%s: %d, want 400", bad, code)
		}
	}
}

func TestGamesBinding(t *testing.T) {
	rec, code := get(t, "/v1/games")
	if code != http.StatusOK || rec.games.Cursor != nil || rec.games.Kind != nil {
		t.Fatalf("absent: %d %+v", code, rec.games)
	}

	rec, code = get(t, "/v1/games?cursor=abc%2Cdef&kind=played")
	if code != http.StatusOK {
		t.Fatalf("valid: %d", code)
	}
	if rec.games.Cursor == nil || *rec.games.Cursor != "abc,def" {
		t.Errorf("cursor = %v", rec.games.Cursor)
	}
	if rec.games.Kind == nil || string(*rec.games.Kind) != "played" {
		t.Errorf("kind = %v", rec.games.Kind)
	}

	// The wrapper passes an unknown kind through; the games handler rejects it.
	rec, code = get(t, "/v1/games?kind=everything")
	if code != http.StatusOK || rec.games.Kind == nil || string(*rec.games.Kind) != "everything" {
		t.Errorf("unknown kind: %d %v", code, rec.games.Kind)
	}
}
