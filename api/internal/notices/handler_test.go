package notices

import (
	"bytes"
	"context"
	"errors"
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

const testAdmin = "25200000-0000-4000-8000-000000000001"

var testNotice = Notice{ID: "25210000-0000-4000-8000-000000000001", Revision: 1,
	Kind: "incident", Phase: "active", Title: "Slow buzzers", Body: "Looking into it",
	StatusPageSync: "ok", CreatedBy: testAdmin, History: 1,
	CreatedAt: time.Date(2026, 11, 22, 12, 0, 0, 0, time.UTC), UpdatedAt: time.Date(2026, 11, 22, 12, 0, 0, 0, time.UTC)}

type fakeStore struct {
	notice    Notice
	syncCalls int
}

func (f *fakeStore) Active(context.Context, auth.Claims) ([]Notice, time.Time, error) {
	return []Notice{f.notice}, testNotice.CreatedAt, nil
}
func (f *fakeStore) AdminList(context.Context, auth.Claims, int) ([]Notice, error) {
	return []Notice{f.notice}, nil
}
func (f *fakeStore) Post(context.Context, auth.Claims, Input) (Notice, error) { return f.notice, nil }
func (f *fakeStore) Edit(context.Context, auth.Claims, string, []byte) (Notice, error) {
	n := f.notice
	n.Revision++
	return n, nil
}
func (f *fakeStore) Resolve(context.Context, auth.Claims, string, string) (Notice, error) {
	n := f.notice
	now := time.Now()
	n.ResolvedAt = &now
	n.Phase = "resolved"
	return n, nil
}
func (f *fakeStore) SetSync(_ context.Context, _ auth.Claims, _ string, ref, status string, syncError *string) (Notice, error) {
	f.syncCalls++
	f.notice.StatusPageSync, f.notice.StatusPageError = status, syncError
	if ref != "" {
		f.notice.StatusPageRef = &ref
	}
	return f.notice, nil
}

type failingPage struct{ calls int }

func (f *failingPage) Open(context.Context, Notice) (string, error) {
	f.calls++
	return "", errors.New("provider unavailable")
}
func (f *failingPage) Update(context.Context, Notice) error {
	f.calls++
	return errors.New("provider unavailable")
}
func (f *failingPage) Resolve(context.Context, Notice) error {
	f.calls++
	return errors.New("provider unavailable")
}

type verifier struct{}

func (verifier) Verify(string) (auth.Claims, error) {
	return auth.Claims{UserID: testAdmin, Raw: []byte(`{}`)}, nil
}

type testRoutes struct {
	contracts.ServerInterface
	Handler
}

func (r testRoutes) GetV1Notices(w http.ResponseWriter, req *http.Request)       { r.Active(w, req) }
func (r testRoutes) PostV1AdminNotices(w http.ResponseWriter, req *http.Request) { r.Post(w, req) }
func (r testRoutes) PostV1AdminNoticesIdSync(w http.ResponseWriter, req *http.Request, id openapi_types.UUID) {
	r.Retry(w, req, id)
}

func call(t *testing.T, h Handler, method, path, body string) *httptest.ResponseRecorder {
	t.Helper()
	mux := http.NewServeMux()
	app := server.Authenticate(verifier{})(contracts.HandlerWithOptions(testRoutes{Handler: h},
		contracts.StdHTTPServerOptions{BaseRouter: mux, ErrorHandlerFunc: func(w http.ResponseWriter, _ *http.Request, _ error) {
			server.Problem(w, http.StatusBadRequest, "invalid-request", "Invalid request")
		}}))
	req := httptest.NewRequest(method, path, bytes.NewBufferString(body))
	req.Header.Set("Authorization", "Bearer token")
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
		t.Fatal(err)
	}
	in := &openapi3filter.ResponseValidationInput{RequestValidationInput: &openapi3filter.RequestValidationInput{Request: req, PathParams: params, Route: route}, Status: rec.Code, Header: rec.Header(), Body: http.NoBody}
	in.Body = ioNopCloser{bytes.NewReader(rec.Body.Bytes())}
	if err := openapi3filter.ValidateResponse(context.Background(), in); err != nil {
		t.Errorf("response does not match contract: %v\n%s", err, rec.Body)
	}
	return rec
}

type ioNopCloser struct{ *bytes.Reader }

func (ioNopCloser) Close() error { return nil }

func TestActiveShape(t *testing.T) {
	store := &fakeStore{notice: testNotice}
	rec := call(t, Handler{Store: store, StatusPage: NoopStatusPage{}}, http.MethodGet, "/v1/notices", "")
	if rec.Code != http.StatusOK || !bytes.Contains(rec.Body.Bytes(), []byte(`"serverTime"`)) {
		t.Fatalf("%d %s", rec.Code, rec.Body)
	}
}

func TestProviderFailureStillPostsAndRetryCallsAgain(t *testing.T) {
	store := &fakeStore{notice: testNotice}
	page := &failingPage{}
	h := Handler{Store: store, StatusPage: page}
	rec := call(t, h, http.MethodPost, "/v1/admin/notices", `{"kind":"incident","title":"Slow buzzers","body":"Looking into it"}`)
	if rec.Code != http.StatusCreated || !bytes.Contains(rec.Body.Bytes(), []byte(`"statusPageSync":"failed"`)) {
		t.Fatalf("%d %s", rec.Code, rec.Body)
	}
	if page.calls != 1 || store.syncCalls != 1 {
		t.Fatalf("after post: provider=%d sync=%d", page.calls, store.syncCalls)
	}
	rec = call(t, h, http.MethodPost, "/v1/admin/notices/25210000-0000-4000-8000-000000000001/sync", "")
	if rec.Code != http.StatusOK || page.calls != 2 {
		t.Fatalf("retry: %d provider=%d %s", rec.Code, page.calls, rec.Body)
	}
}
