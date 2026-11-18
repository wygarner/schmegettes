package admin

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
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

const adminID = "11111111-1111-4111-8111-111111111111"

var (
	t0   = time.Date(2026, 11, 17, 7, 0, 0, 0, time.FixedZone("EST", -5*3600)) // 12:00 UTC
	code = HostCode{Code: "K7RXM2PQ", CurrentStartedAt: t0, RotatesAt: t0.Add(45 * time.Minute), ServerTime: t0.Add(14 * time.Minute)}
	note = "Thursday trivia"
	mail = "sam@example.com"
	name = "Priya"
	host = Host{UserID: "22222222-2222-4222-8222-222222222222", Kind: "account", Email: &mail, HostSince: t0, Note: &note}
	gst  = Host{UserID: "33333333-3333-4333-8333-333333333333", Kind: "guest", LastPlayedAs: &name, HostSince: t0}
)

// fakeStore records calls and returns err for every method when set.
type fakeStore struct {
	err      error
	expected string
	note     *string
	removed  string
}

func (f *fakeStore) CurrentCode(context.Context, auth.Claims) (HostCode, error) { return code, f.err }
func (f *fakeStore) Rotate(_ context.Context, _ auth.Claims, expected string) (HostCode, error) {
	f.expected = expected
	return code, f.err
}
func (f *fakeStore) Hosts(context.Context, auth.Claims) ([]Host, error) {
	return []Host{gst, host}, f.err
}
func (f *fakeStore) SetNote(_ context.Context, _ auth.Claims, _ string, n *string) (Host, error) {
	f.note = n
	h := host
	h.Note = n
	return h, f.err
}
func (f *fakeStore) Remove(_ context.Context, _ auth.Claims, userID string) error {
	f.removed = userID
	return f.err
}

type allowAdmin struct{}

func (allowAdmin) Verify(string) (auth.Claims, error) {
	return auth.Claims{UserID: adminID, Raw: []byte(`{}`)}, nil
}

type routes struct {
	contracts.ServerInterface
	Handler
}

func (r routes) GetV1AdminHostCode(w http.ResponseWriter, req *http.Request)        { r.CurrentCode(w, req) }
func (r routes) PostV1AdminHostCodeRotate(w http.ResponseWriter, req *http.Request) { r.Rotate(w, req) }
func (r routes) GetV1AdminHosts(w http.ResponseWriter, req *http.Request)           { r.Hosts(w, req) }
func (r routes) PatchV1AdminHostsUserId(w http.ResponseWriter, req *http.Request, id openapi_types.UUID) {
	r.SetNote(w, req, id)
}
func (r routes) DeleteV1AdminHostsUserId(w http.ResponseWriter, req *http.Request, id openapi_types.UUID) {
	r.Remove(w, req, id)
}

// call runs a request through the real auth middleware and checks the response against the spec.
func call(t *testing.T, store *fakeStore, method, path, body string) *httptest.ResponseRecorder {
	t.Helper()
	mux := http.NewServeMux()
	app := server.Authenticate(allowAdmin{})(contracts.HandlerWithOptions(routes{Handler: Handler{Store: store}},
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

func TestCurrentCode(t *testing.T) {
	rec := call(t, &fakeStore{}, "GET", "/v1/admin/host-code", "")
	if rec.Code != http.StatusOK || !bytes.Contains(rec.Body.Bytes(), []byte(`"code":"K7RXM2PQ"`)) {
		t.Fatalf("%d %s", rec.Code, rec.Body)
	}
	if !bytes.Contains(rec.Body.Bytes(), []byte(`"rotatesAt":"2026-11-17T12:45:00Z"`)) {
		t.Errorf("times should be UTC: %s", rec.Body)
	}
	if !bytes.Contains(rec.Body.Bytes(), []byte(`"previousValidUntil":null`)) {
		t.Errorf("previousValidUntil should be null: %s", rec.Body)
	}
}

func TestRotateSendsTheConfirmedCode(t *testing.T) {
	store := &fakeStore{}
	rec := call(t, store, "POST", "/v1/admin/host-code/rotate", `{"expectedCode":"K7RX-M2PQ"}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("%d %s", rec.Code, rec.Body)
	}
	if store.expected != "K7RX-M2PQ" {
		t.Errorf("expected code passed as %q", store.expected)
	}
}

func TestRotateRejectsABadBody(t *testing.T) {
	for _, body := range []string{`{}`, `{"expectedCode":""}`, `{"expectedCode":"12345678901234567"}`, `not json`} {
		if rec := call(t, &fakeStore{}, "POST", "/v1/admin/host-code/rotate", body); rec.Code != http.StatusBadRequest {
			t.Errorf("%s → %d", body, rec.Code)
		}
	}
}

func TestHostsNewestFirstAsTheStoreReturns(t *testing.T) {
	rec := call(t, &fakeStore{}, "GET", "/v1/admin/hosts", "")
	if rec.Code != http.StatusOK {
		t.Fatalf("%d %s", rec.Code, rec.Body)
	}
	body := rec.Body.String()
	if bytes.Index([]byte(body), []byte(gst.UserID)) > bytes.Index([]byte(body), []byte(host.UserID)) {
		t.Errorf("order changed: %s", body)
	}
	var got struct{ Hosts []contracts.AdminHost }
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	g := got.Hosts[0]
	if g.Kind != "guest" || g.Email != nil || g.LastPlayedAs == nil || *g.LastPlayedAs != "Priya" {
		t.Errorf("guest row: %s", body)
	}
}

func TestSetNoteTrimsAndClears(t *testing.T) {
	store := &fakeStore{}
	path := "/v1/admin/hosts/" + host.UserID
	if rec := call(t, store, "PATCH", path, `{"note":"  Sam  "}`); rec.Code != http.StatusOK || *store.note != "Sam" {
		t.Fatalf("%d %v", rec.Code, store.note)
	}
	if rec := call(t, store, "PATCH", path, `{"note":null}`); rec.Code != http.StatusOK || store.note != nil {
		t.Fatalf("clear: %d %v", rec.Code, store.note)
	}
	long := `{"note":"` + string(bytes.Repeat([]byte("é"), 201)) + `"}`
	if rec := call(t, store, "PATCH", path, long); rec.Code != http.StatusBadRequest {
		t.Errorf("201 characters → %d", rec.Code)
	}
	if rec := call(t, store, "PATCH", "/v1/admin/hosts/not-a-uuid", `{"note":"x"}`); rec.Code != http.StatusBadRequest {
		t.Errorf("bad id → %d", rec.Code)
	}
}

func TestRemoveIs204(t *testing.T) {
	store := &fakeStore{}
	if rec := call(t, store, "DELETE", "/v1/admin/hosts/"+host.UserID, ""); rec.Code != http.StatusNoContent {
		t.Fatalf("%d %s", rec.Code, rec.Body)
	}
	if store.removed != host.UserID {
		t.Errorf("removed %q", store.removed)
	}
}

// The database's admin refusal (not on the list, a guest, removed mid-session) is a 404.
func TestStoreRefusalIsConcealed(t *testing.T) {
	cases := []struct{ method, path, body string }{
		{"GET", "/v1/admin/host-code", ""},
		{"POST", "/v1/admin/host-code/rotate", `{"expectedCode":"K7RXM2PQ"}`},
		{"GET", "/v1/admin/hosts", ""},
		{"PATCH", "/v1/admin/hosts/" + host.UserID, `{"note":"x"}`},
		{"DELETE", "/v1/admin/hosts/" + host.UserID, ""},
	}
	for _, c := range cases {
		rec := call(t, &fakeStore{err: ErrNotFound}, c.method, c.path, c.body)
		if rec.Code != http.StatusNotFound || !bytes.Contains(rec.Body.Bytes(), []byte(server.ProblemBase+"not-found")) {
			t.Errorf("%s %s → %d %s", c.method, c.path, rec.Code, rec.Body)
		}
		rec = call(t, &fakeStore{err: errors.New("db down")}, c.method, c.path, c.body)
		if rec.Code != http.StatusInternalServerError {
			t.Errorf("%s %s store failure → %d", c.method, c.path, rec.Code)
		}
	}
}

func TestInvalidFromTheStoreIs400(t *testing.T) {
	if rec := call(t, &fakeStore{err: ErrInvalid}, "PATCH", "/v1/admin/hosts/"+host.UserID, `{"note":"x"}`); rec.Code != http.StatusBadRequest {
		t.Errorf("→ %d", rec.Code)
	}
}
