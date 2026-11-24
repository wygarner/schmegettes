package staffaccess

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/getkin/kin-openapi/openapi3"
	"github.com/getkin/kin-openapi/openapi3filter"
	"github.com/getkin/kin-openapi/routers/gorillamux"
	openapi_types "github.com/oapi-codegen/runtime/types"

	"schmegettes/api/internal/contracts"
	"schmegettes/api/internal/server"
	"schmegettes/golib/auth"
)

const (
	adminID = "11111111-1111-4111-8111-111111111111"
	userID  = "22222222-2222-4222-8222-222222222222"
	grantID = "99999999-9999-4999-8999-999999999999"
)

var expires = time.Date(2026, 11, 21, 15, 0, 0, 0, time.FixedZone("EST", -5*3600))

// Shapes as private.staff_read returns them.
var subjects = map[string]string{
	"user": `{"kind":"user","userId":"` + userID + `","isAnonymous":false,"isAdmin":false,
		"createdAt":"2026-11-01T10:00:00.000000Z",
		"profile":{"displayName":"Bob","accountName":"Bob","showOnLeaderboard":true,"createdAt":"2026-11-01T10:00:00.000000Z"},
		"host":{"since":"2026-11-02T10:00:00.000000Z","note":null},
		"rooms":[{"roomId":"a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1","code":"AUDT1","status":"closed","role":"host","joinedAt":"2026-11-03T10:00:00.000000Z"}],
		"games":[{"gameId":"b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1","status":"finished","startedAt":"2026-11-03T10:00:00.000000Z",
			"finishedAt":"2026-11-03T10:30:00.000000Z","role":"contestant","score":200,"placement":1}],
		"seenClueCount":61}`,
	"room": `{"kind":"room","roomId":"a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1","code":"AUDT1","hostId":"` + userID + `",
		"status":"open","createdAt":"2026-11-03T10:00:00.000000Z","resumeGameId":null,
		"options":{"maxPlayers":8,"seasons":null,"hostPlays":false,"timers":"standard","doubleRound":true,"quickPicks":false,"difficulty":null},
		"members":[{"userId":"` + userID + `","role":"host","displayName":"Bob","joinedAt":"2026-11-03T10:00:00.000000Z"}]}`,
	"game": `{"kind":"game","gameId":"b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1","roomId":null,"status":"in_progress",
		"startedAt":"2026-11-03T10:00:00.000000Z","finishedAt":null,"hostUserId":"` + userID + `",
		"players":[{"gamePlayerId":"d1d1d1d1-d1d1-4d1d-8d1d-d1d1d1d1d1d1","userId":null,"role":"contestant","displayName":null,
			"joinedAt":"2026-11-03T10:00:00.000000Z","leftAt":null,"score":-400}],
		"board":[{"boardClueId":"e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1","round":"single","columnIndex":0,"rowIndex":0,
			"category":"AUDIT","value":200,"isDailyDouble":false,"state":"answered"}],
		"answers":[{"answerId":"f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1","boardClueId":"e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1",
			"gamePlayerId":"d1d1d1d1-d1d1-4d1d-8d1d-d1d1d1d1d1d1","answer":"what is x","verdict":"incorrect","scoreDelta":-400,
			"createdAt":"2026-11-03T10:01:00.000000Z"}]}`,
}

type fakeStore struct {
	err     error
	subject string // which entry of subjects Read returns
	raw     string // overrides subject
	reason  string
	minutes int
	filter  AuditFilter
}

func (f *fakeStore) Grant(_ context.Context, _ auth.Claims, s Subject, reason string, minutes int) (Grant, error) {
	f.reason, f.minutes = reason, minutes
	return Grant{ID: grantID, Subject: s, ExpiresAt: expires}, f.err
}
func (f *fakeStore) Read(context.Context, auth.Claims, string) (json.RawMessage, error) {
	if f.raw != "" {
		return json.RawMessage(f.raw), f.err
	}
	return json.RawMessage(subjects[f.subject]), f.err
}
func (f *fakeStore) Revoke(context.Context, auth.Claims, string) (Subject, error) {
	return Subject{Type: "user", ID: userID}, f.err
}
func (f *fakeStore) Audit(_ context.Context, _ auth.Claims, filter AuditFilter) ([]AuditEntry, error) {
	f.filter = filter
	action, subjectType, subject, req := "staff_read", "user", userID, "abc"
	admin := adminID
	return []AuditEntry{
		{ID: 2, At: expires, Actor: &admin, Action: action, SubjectType: &subjectType, SubjectID: &subject, RequestID: &req,
			Details: map[string]any{"grant_id": grantID}},
		{ID: 1, At: expires, Action: "host_code_rotated"},
	}, f.err
}

type admin struct{}

func (admin) Verify(string) (auth.Claims, error) {
	return auth.Claims{UserID: adminID, Raw: []byte(`{}`)}, nil
}

type routes struct {
	contracts.ServerInterface
	Handler
}

func (r routes) PostV1AdminStaffAccess(w http.ResponseWriter, req *http.Request) { r.Grant(w, req) }
func (r routes) GetV1AdminStaffAccessGrantId(w http.ResponseWriter, req *http.Request, id openapi_types.UUID) {
	r.Read(w, req, id)
}
func (r routes) DeleteV1AdminStaffAccessGrantId(w http.ResponseWriter, req *http.Request, id openapi_types.UUID) {
	r.Revoke(w, req, id)
}
func (r routes) GetV1AdminAudit(w http.ResponseWriter, req *http.Request, p contracts.GetV1AdminAuditParams) {
	r.Audit(w, req, p)
}

// call runs a request through the real auth middleware and checks the response against the spec.
func call(t *testing.T, store *fakeStore, method, path, body string) *httptest.ResponseRecorder {
	t.Helper()
	mux := http.NewServeMux()
	app := server.Authenticate(admin{})(contracts.HandlerWithOptions(routes{Handler: Handler{Store: store}},
		contracts.StdHTTPServerOptions{BaseRouter: mux, ErrorHandlerFunc: func(w http.ResponseWriter, _ *http.Request, _ error) {
			server.Problem(w, http.StatusBadRequest, "invalid-request", "Invalid request")
		}}))
	req := httptest.NewRequest(method, path, bytes.NewBufferString(body))
	req.Header.Set("Authorization", "Bearer x")
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	app.ServeHTTP(rec, req)

	doc, err := openapi3.NewLoader().LoadFromFile("../contracts/openapi30.gen.yaml")
	if err != nil {
		t.Fatal(err)
	}
	doc.Servers = nil
	router, err := gorillamux.NewRouter(doc)
	if err != nil {
		t.Fatal(err)
	}
	route, params, err := router.FindRoute(req)
	if err != nil {
		t.Fatalf("route not in spec: %v", err)
	}
	in := &openapi3filter.ResponseValidationInput{
		RequestValidationInput: &openapi3filter.RequestValidationInput{Request: req, PathParams: params, Route: route},
		Status:                 rec.Code,
		Header:                 rec.Header(),
		Body:                   io.NopCloser(bytes.NewReader(rec.Body.Bytes())),
	}
	if err := openapi3filter.ValidateResponse(context.Background(), in); err != nil {
		t.Errorf("%s %s → %d does not match the spec: %v\n%s", method, path, rec.Code, err, rec.Body)
	}
	return rec
}

func captureLogs(t *testing.T) *bytes.Buffer {
	t.Helper()
	var buf bytes.Buffer
	prev := slog.Default()
	slog.SetDefault(slog.New(slog.NewJSONHandler(&buf, nil)))
	t.Cleanup(func() { slog.SetDefault(prev) })
	return &buf
}

func hasKey(v any, key string) bool {
	switch x := v.(type) {
	case map[string]any:
		for k, child := range x {
			if strings.EqualFold(k, key) || hasKey(child, key) {
				return true
			}
		}
	case []any:
		for _, child := range x {
			if hasKey(child, key) {
				return true
			}
		}
	}
	return false
}

func TestGrantDefaultsTo60MinutesAndNeverLogsTheReason(t *testing.T) {
	logs := captureLogs(t)
	store := &fakeStore{}
	rec := call(t, store, "POST", "/v1/admin/staff-access",
		`{"subjectType":"user","subjectId":"`+userID+`","reason":"  Bob's game vanished (bob@example.com)  "}`)
	if rec.Code != http.StatusCreated {
		t.Fatalf("%d %s", rec.Code, rec.Body)
	}
	if store.minutes != 60 || store.reason != "Bob's game vanished (bob@example.com)" {
		t.Errorf("store got %d minutes, reason %q", store.minutes, store.reason)
	}
	if !bytes.Contains(rec.Body.Bytes(), []byte(`"expiresAt":"2026-11-21T20:00:00Z"`)) {
		t.Errorf("expiry should be UTC: %s", rec.Body)
	}
	var line map[string]any
	if err := json.Unmarshal(logs.Bytes(), &line); err != nil {
		t.Fatalf("one log line: %v %s", err, logs)
	}
	if line["level"] != "WARN" || line["msg"] != "staff access granted" || line["grant_id"] != grantID ||
		line["subject_type"] != "user" || line["subject_id"] != userID || line["minutes"] != float64(60) {
		t.Errorf("log line %v", line)
	}
	if strings.Contains(logs.String(), "vanished") || strings.Contains(logs.String(), "example.com") {
		t.Errorf("the reason was logged: %s", logs)
	}
}

func TestGrantRejectsBadInput(t *testing.T) {
	long := strings.Repeat("x", 201)
	for _, body := range []string{
		`{"subjectType":"user","subjectId":"` + userID + `","reason":"   "}`,
		`{"subjectType":"user","subjectId":"` + userID + `","reason":"` + long + `"}`,
		`{"subjectType":"user","subjectId":"` + userID + `","reason":"x","minutes":481}`,
		`{"subjectType":"user","subjectId":"` + userID + `","reason":"x","minutes":0}`,
		`{"subjectType":"profile","subjectId":"` + userID + `","reason":"x"}`,
	} {
		rec := call(t, &fakeStore{}, "POST", "/v1/admin/staff-access", body)
		if rec.Code != http.StatusBadRequest || !bytes.Contains(rec.Body.Bytes(), []byte("invalid-grant")) {
			t.Errorf("%s → %d %s", body, rec.Code, rec.Body)
		}
	}
	rec := call(t, &fakeStore{err: ErrInvalid}, "POST", "/v1/admin/staff-access",
		`{"subjectType":"game","subjectId":"`+userID+`","reason":"x","minutes":480}`)
	if rec.Code != http.StatusBadRequest || !bytes.Contains(rec.Body.Bytes(), []byte("invalid-grant")) {
		t.Errorf("a missing subject → %d %s", rec.Code, rec.Body)
	}
}

func TestReadEachSubjectMatchesTheSpecWithNoEmail(t *testing.T) {
	for kind := range subjects {
		logs := captureLogs(t)
		rec := call(t, &fakeStore{subject: kind}, "GET", "/v1/admin/staff-access/"+grantID, "")
		if rec.Code != http.StatusOK {
			t.Fatalf("%s: %d %s", kind, rec.Code, rec.Body)
		}
		var body any
		if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
			t.Fatal(err)
		}
		if hasKey(body, "email") {
			t.Errorf("%s: response has an email key: %s", kind, rec.Body)
		}
		if !bytes.Contains(logs.Bytes(), []byte(`"msg":"staff access read"`)) ||
			!bytes.Contains(logs.Bytes(), []byte(`"subject_type":"`+kind+`"`)) {
			t.Errorf("%s: log %s", kind, logs)
		}
		if bytes.Contains(logs.Bytes(), []byte("AUDT1")) || bytes.Contains(logs.Bytes(), []byte("what is x")) {
			t.Errorf("%s: the payload was logged: %s", kind, logs)
		}
	}
}

// A field the contract doesn't name (here an email) never reaches the response.
func TestReadRefusesUnexpectedFields(t *testing.T) {
	raw := strings.Replace(subjects["user"], `"isAdmin":false`, `"isAdmin":false,"email":"bob@example.com"`, 1)
	rec := call(t, &fakeStore{raw: raw}, "GET", "/v1/admin/staff-access/"+grantID, "")
	if rec.Code != http.StatusInternalServerError || bytes.Contains(rec.Body.Bytes(), []byte("example.com")) {
		t.Errorf("%d %s", rec.Code, rec.Body)
	}
}

func TestInactiveGrantIs403(t *testing.T) {
	for _, c := range []struct{ method, path string }{
		{"GET", "/v1/admin/staff-access/" + grantID},
		{"DELETE", "/v1/admin/staff-access/" + grantID},
	} {
		rec := call(t, &fakeStore{err: ErrInactive}, c.method, c.path, "")
		if rec.Code != http.StatusForbidden || !bytes.Contains(rec.Body.Bytes(), []byte("grant-inactive")) {
			t.Errorf("%s → %d %s", c.method, rec.Code, rec.Body)
		}
	}
}

func TestNonAdminIsConcealed(t *testing.T) {
	for _, c := range []struct{ method, path, body string }{
		{"POST", "/v1/admin/staff-access", `{"subjectType":"user","subjectId":"` + userID + `","reason":"x"}`},
		{"GET", "/v1/admin/staff-access/" + grantID, ""},
		{"DELETE", "/v1/admin/staff-access/" + grantID, ""},
		{"GET", "/v1/admin/audit", ""},
	} {
		if rec := call(t, &fakeStore{err: ErrNotFound}, c.method, c.path, c.body); rec.Code != http.StatusNotFound {
			t.Errorf("%s %s → %d", c.method, c.path, rec.Code)
		}
	}
}

func TestRevokeIs204AndLogged(t *testing.T) {
	logs := captureLogs(t)
	rec := call(t, &fakeStore{}, "DELETE", "/v1/admin/staff-access/"+grantID, "")
	if rec.Code != http.StatusNoContent {
		t.Fatalf("%d %s", rec.Code, rec.Body)
	}
	if !bytes.Contains(logs.Bytes(), []byte(`"msg":"staff access revoked"`)) || !bytes.Contains(logs.Bytes(), []byte(grantID)) {
		t.Errorf("log %s", logs)
	}
}

func TestAuditPassesFiltersAndMatchesTheSpec(t *testing.T) {
	store := &fakeStore{}
	rec := call(t, store, "GET", "/v1/admin/audit?since=2026-11-20T00:00:00Z&action=staff_read&subject="+userID, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("%d %s", rec.Code, rec.Body)
	}
	if store.filter.Since == nil || store.filter.Action == nil || *store.filter.Action != "staff_read" ||
		store.filter.Subject == nil || *store.filter.Subject != userID {
		t.Errorf("filter %+v", store.filter)
	}
	if !bytes.Contains(rec.Body.Bytes(), []byte(`"details":{}`)) {
		t.Errorf("missing details should be an empty object: %s", rec.Body)
	}
	rec = call(t, store, "GET", "/v1/admin/audit", "")
	if rec.Code != http.StatusOK || store.filter.Since != nil || store.filter.Action != nil || store.filter.Subject != nil {
		t.Errorf("no filters → %d %+v", rec.Code, store.filter)
	}
}
