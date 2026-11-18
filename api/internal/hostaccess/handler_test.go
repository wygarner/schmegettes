package hostaccess

import (
	"bytes"
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/getkin/kin-openapi/openapi3"
	"github.com/getkin/kin-openapi/openapi3filter"
	"github.com/getkin/kin-openapi/routers/gorillamux"
	openapi_types "github.com/oapi-codegen/runtime/types"

	"schmegettes/api/internal/contracts"
	"schmegettes/api/internal/server"
	"schmegettes/golib/auth"
)

type fakeStore struct {
	canHost bool
	valid   string // the code that works
	err     error
	got     string
	calls   int
}

func (f *fakeStore) CanHost(context.Context, auth.Claims) (bool, error) { return f.canHost, f.err }
func (f *fakeStore) Redeem(_ context.Context, _ auth.Claims, code string) (bool, error) {
	f.calls++
	f.got = code
	if f.err != nil {
		return false, f.err
	}
	if code == f.valid {
		f.canHost = true
	}
	return code == f.valid, nil
}

type verifier struct{ ok bool }

func (v verifier) Verify(string) (auth.Claims, error) {
	if !v.ok {
		return auth.Claims{}, errors.New("bad token")
	}
	return auth.Claims{UserID: "11111111-1111-4111-8111-111111111111", Raw: []byte(`{}`)}, nil
}

type routes struct {
	contracts.ServerInterface
	Handler
}

func (routes) GetHealthz(http.ResponseWriter, *http.Request)                             {}
func (routes) GetVersion(http.ResponseWriter, *http.Request)                             {}
func (routes) GetV1Games(http.ResponseWriter, *http.Request, contracts.GetV1GamesParams) {}
func (routes) GetV1GamesGameId(http.ResponseWriter, *http.Request, openapi_types.UUID)   {}
func (routes) GetV1Me(http.ResponseWriter, *http.Request)                                {}
func (routes) PatchV1Me(http.ResponseWriter, *http.Request)                              {}
func (routes) DeleteV1Me(http.ResponseWriter, *http.Request)                             {}
func (routes) PostV1MeMerge(http.ResponseWriter, *http.Request)                          {}
func (routes) PostV1MeMergeTickets(http.ResponseWriter, *http.Request)                   {}
func (routes) PostV1Rooms(http.ResponseWriter, *http.Request)                            {}
func (routes) PostV1RoomsJoin(http.ResponseWriter, *http.Request)                        {}
func (routes) GetV1RoomsByCodeCode(http.ResponseWriter, *http.Request, string)           {}
func (routes) GetV1RoomsRoomId(http.ResponseWriter, *http.Request, openapi_types.UUID)   {}
func (routes) PatchV1RoomsRoomId(http.ResponseWriter, *http.Request, openapi_types.UUID) {}
func (r routes) GetV1HostAccess(w http.ResponseWriter, req *http.Request)                { r.Status(w, req) }
func (r routes) PostV1HostAccessRedeem(w http.ResponseWriter, req *http.Request)         { r.Redeem(w, req) }

// call runs a request through the real auth middleware and checks the response against the spec.
func call(t *testing.T, store *fakeStore, tokenOK bool, method, path, body string) *httptest.ResponseRecorder {
	t.Helper()
	mux := http.NewServeMux()
	app := server.Authenticate(verifier{tokenOK})(
		contracts.HandlerWithOptions(routes{Handler: Handler{Store: store}}, contracts.StdHTTPServerOptions{BaseRouter: mux}))
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

func TestNoTokenIs401(t *testing.T) {
	for _, path := range []string{"/v1/host-access", "/v1/host-access/redeem"} {
		method := map[string]string{"/v1/host-access": "GET", "/v1/host-access/redeem": "POST"}[path]
		mux := http.NewServeMux()
		app := server.Authenticate(verifier{false})(
			contracts.HandlerWithOptions(routes{Handler: Handler{Store: &fakeStore{}}}, contracts.StdHTTPServerOptions{BaseRouter: mux}))
		rec := httptest.NewRecorder()
		app.ServeHTTP(rec, httptest.NewRequest(method, path, bytes.NewBufferString(`{"code":"K7RXM2PQ"}`)))
		if rec.Code != http.StatusUnauthorized {
			t.Errorf("%s without a token: %d", path, rec.Code)
		}
	}
}

func TestStatus(t *testing.T) {
	store := &fakeStore{}
	if rec := call(t, store, true, "GET", "/v1/host-access", ""); rec.Code != 200 || rec.Body.String() != `{"canHost":false}`+"\n" {
		t.Errorf("no access: %d %s", rec.Code, rec.Body)
	}
	store.canHost = true
	if rec := call(t, store, true, "GET", "/v1/host-access", ""); !bytes.Contains(rec.Body.Bytes(), []byte(`"canHost":true`)) {
		t.Errorf("access: %s", rec.Body)
	}
}

func TestRedeem(t *testing.T) {
	store := &fakeStore{valid: "k7rx-m2pq"}
	rec := call(t, store, true, "POST", "/v1/host-access/redeem", `{"code":"k7rx-m2pq"}`)
	if rec.Code != 200 || !bytes.Contains(rec.Body.Bytes(), []byte(`"canHost":true`)) {
		t.Errorf("valid code: %d %s", rec.Code, rec.Body)
	}
	if store.got != "k7rx-m2pq" {
		t.Errorf("the database normalizes the code; the handler passes it as typed, got %q", store.got)
	}
}

func TestRedeemRefusals(t *testing.T) {
	for name, body := range map[string]string{
		"wrong code": `{"code":"ZZZZZZZZ"}`,
		"too long":   `{"code":"K7RX-M2PQ-K7RX-M2PQ"}`,
	} {
		store := &fakeStore{valid: "K7RXM2PQ"}
		rec := call(t, store, true, "POST", "/v1/host-access/redeem", body)
		if rec.Code != 400 || !bytes.Contains(rec.Body.Bytes(), []byte("/problems/invalid-code")) {
			t.Errorf("%s: %d %s", name, rec.Code, rec.Body)
		}
		if name == "too long" && store.calls != 0 {
			t.Error("an over-long code reached the database")
		}
	}
	if rec := call(t, &fakeStore{}, true, "POST", "/v1/host-access/redeem", `{}`); rec.Code != 400 {
		t.Errorf("missing code: %d", rec.Code)
	}
}

func TestStoreErrorIs500(t *testing.T) {
	rec := call(t, &fakeStore{err: errors.New("db down")}, true, "POST", "/v1/host-access/redeem", `{"code":"K7RXM2PQ"}`)
	if rec.Code != 500 {
		t.Errorf("%d", rec.Code)
	}
}
