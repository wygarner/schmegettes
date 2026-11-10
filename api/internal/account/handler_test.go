package account

import (
	"bytes"
	"context"
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

const userID = "11111111-1111-4111-8111-111111111111"

type fakeStore struct {
	profile Profile
	merge   MergeResult
	err     error
	gotName string
	gotTkt  string
	calls   int
}

func (f *fakeStore) Profile(context.Context, auth.Claims) (Profile, error) { return f.profile, f.err }
func (f *fakeStore) SetName(_ context.Context, _ auth.Claims, name string) (Profile, error) {
	f.calls++
	f.gotName = name
	if f.err != nil {
		return Profile{}, f.err
	}
	f.profile.AccountName = &name
	return f.profile, nil
}
func (f *fakeStore) CreateTicket(context.Context, auth.Claims) (string, time.Time, error) {
	f.calls++
	return "tkt", time.Date(2026, 11, 11, 18, 0, 0, 0, time.UTC), f.err
}
func (f *fakeStore) Merge(_ context.Context, _ auth.Claims, ticket string) (MergeResult, error) {
	f.calls++
	f.gotTkt = ticket
	return f.merge, f.err
}
func (f *fakeStore) Delete(context.Context, auth.Claims) error {
	f.calls++
	return f.err
}

type verifier struct{ anonymous bool }

func (v verifier) Verify(string) (auth.Claims, error) {
	return auth.Claims{UserID: userID, IsAnonymous: v.anonymous, Raw: []byte(`{}`)}, nil
}

type routes struct{ Handler }

func (routes) GetHealthz(http.ResponseWriter, *http.Request)                             {}
func (routes) GetVersion(http.ResponseWriter, *http.Request)                             {}
func (routes) GetV1Games(http.ResponseWriter, *http.Request, contracts.GetV1GamesParams) {}
func (routes) GetV1GamesGameId(http.ResponseWriter, *http.Request, openapi_types.UUID)   {}
func (routes) PostV1Rooms(http.ResponseWriter, *http.Request)                            {}
func (routes) PostV1RoomsJoin(http.ResponseWriter, *http.Request)                        {}
func (routes) GetV1RoomsByCodeCode(http.ResponseWriter, *http.Request, string)           {}
func (routes) GetV1RoomsRoomId(http.ResponseWriter, *http.Request, openapi_types.UUID)   {}
func (routes) PatchV1RoomsRoomId(http.ResponseWriter, *http.Request, openapi_types.UUID) {}
func (routes) GetV1HostAccess(http.ResponseWriter, *http.Request)                        {}
func (routes) PostV1HostAccessRedeem(http.ResponseWriter, *http.Request)                 {}
func (r routes) GetV1Me(w http.ResponseWriter, req *http.Request)                        { r.Me(w, req) }
func (r routes) PatchV1Me(w http.ResponseWriter, req *http.Request)                      { r.SetName(w, req) }
func (r routes) DeleteV1Me(w http.ResponseWriter, req *http.Request)                     { r.Delete(w, req) }
func (r routes) PostV1MeMergeTickets(w http.ResponseWriter, req *http.Request) {
	r.CreateTicket(w, req)
}
func (r routes) PostV1MeMerge(w http.ResponseWriter, req *http.Request) { r.Merge(w, req) }

// call runs a request through the real auth middleware and checks the response against the spec.
func call(t *testing.T, store *fakeStore, anonymous bool, method, path, body string) *httptest.ResponseRecorder {
	t.Helper()
	mux := http.NewServeMux()
	app := server.Authenticate(verifier{anonymous})(
		contracts.HandlerWithOptions(routes{Handler{Store: store}}, contracts.StdHTTPServerOptions{BaseRouter: mux}))
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

func has(rec *httptest.ResponseRecorder, s string) bool {
	return bytes.Contains(rec.Body.Bytes(), []byte(s))
}

func TestMe(t *testing.T) {
	rec := call(t, &fakeStore{}, true, "GET", "/v1/me", "")
	if rec.Code != 200 || !has(rec, `"isAnonymous":true`) || !has(rec, `"accountName":null`) || !has(rec, `"displayName":""`) {
		t.Errorf("guest with no profile: %d %s", rec.Code, rec.Body)
	}
	name := "Wyatt"
	rec = call(t, &fakeStore{profile: Profile{DisplayName: "W", AccountName: &name}}, false, "GET", "/v1/me", "")
	if rec.Code != 200 || !has(rec, `"accountName":"Wyatt"`) || !has(rec, `"isAnonymous":false`) || !has(rec, userID) {
		t.Errorf("account: %d %s", rec.Code, rec.Body)
	}
}

func TestSetName(t *testing.T) {
	store := &fakeStore{}
	rec := call(t, store, false, "PATCH", "/v1/me", `{"accountName":"  Wyatt  "}`)
	if rec.Code != 200 || store.gotName != "Wyatt" || !has(rec, `"accountName":"Wyatt"`) {
		t.Errorf("set: %d %q %s", rec.Code, store.gotName, rec.Body)
	}
	for name, body := range map[string]string{
		"blank":    `{"accountName":"   "}`,
		"too long": `{"accountName":"ABCDEFGHIJKLMNOPQRSTU"}`,
	} {
		store := &fakeStore{}
		rec := call(t, store, false, "PATCH", "/v1/me", body)
		if rec.Code != 400 || !has(rec, "/problems/invalid-name") || store.calls != 0 {
			t.Errorf("%s: %d %s (store calls %d)", name, rec.Code, rec.Body, store.calls)
		}
	}
	if rec := call(t, &fakeStore{err: ErrForbidden}, true, "PATCH", "/v1/me", `{"accountName":"G"}`); rec.Code != 403 || !has(rec, "/problems/not-signed-in") {
		t.Errorf("guest: %d %s", rec.Code, rec.Body)
	}
}

func TestCreateTicket(t *testing.T) {
	rec := call(t, &fakeStore{}, true, "POST", "/v1/me/merge-tickets", "")
	if rec.Code != 201 || !has(rec, `"ticket":"tkt"`) || !has(rec, `"expiresAt":"2026-11-11T18:00:00Z"`) {
		t.Errorf("guest: %d %s", rec.Code, rec.Body)
	}
	if rec := call(t, &fakeStore{err: ErrForbidden}, false, "POST", "/v1/me/merge-tickets", ""); rec.Code != 409 || !has(rec, "/problems/not-a-guest") {
		t.Errorf("account: %d %s", rec.Code, rec.Body)
	}
}

func TestMerge(t *testing.T) {
	store := &fakeStore{merge: MergeResult{GamesAdded: 3, HostAccessAdded: true, AccountWasNew: false}}
	rec := call(t, store, false, "POST", "/v1/me/merge", `{"ticket":"abc"}`)
	if rec.Code != 200 || store.gotTkt != "abc" || !has(rec, `"gamesAdded":3`) || !has(rec, `"hostAccessAdded":true`) || !has(rec, `"accountWasNew":false`) {
		t.Errorf("merge: %d %s", rec.Code, rec.Body)
	}
	for name, tc := range map[string]struct {
		err    error
		body   string
		status int
		kind   string
	}{
		"invalid ticket": {ErrInvalid, `{"ticket":"abc"}`, 400, "invalid-ticket"},
		"guest caller":   {ErrForbidden, `{"ticket":"abc"}`, 403, "not-signed-in"},
		"guest in game":  {ErrInGame, `{"ticket":"abc"}`, 409, "guest-in-game"},
		"store down":     {errors.New("db down"), `{"ticket":"abc"}`, 500, "internal"},
	} {
		rec := call(t, &fakeStore{err: tc.err}, false, "POST", "/v1/me/merge", tc.body)
		if rec.Code != tc.status || !has(rec, "/problems/"+tc.kind) {
			t.Errorf("%s: %d %s", name, rec.Code, rec.Body)
		}
	}
	long := &fakeStore{}
	body := `{"ticket":"` + string(bytes.Repeat([]byte("a"), maxTicketLength+1)) + `"}`
	if rec := call(t, long, false, "POST", "/v1/me/merge", body); rec.Code != 400 || long.calls != 0 {
		t.Errorf("over-long ticket: %d, store calls %d", rec.Code, long.calls)
	}
	if rec := call(t, &fakeStore{}, false, "POST", "/v1/me/merge", `{}`); rec.Code != 400 {
		t.Errorf("missing ticket: %d", rec.Code)
	}
}

func TestDelete(t *testing.T) {
	if rec := call(t, &fakeStore{}, false, "DELETE", "/v1/me", ""); rec.Code != 204 || rec.Body.Len() != 0 {
		t.Errorf("delete: %d %s", rec.Code, rec.Body)
	}
	if rec := call(t, &fakeStore{err: ErrForbidden}, true, "DELETE", "/v1/me", ""); rec.Code != 403 || !has(rec, "/problems/not-signed-in") {
		t.Errorf("guest: %d %s", rec.Code, rec.Body)
	}
	if rec := call(t, &fakeStore{err: ErrInGame}, false, "DELETE", "/v1/me", ""); rec.Code != 409 || !has(rec, "/problems/in-game") {
		t.Errorf("in game: %d %s", rec.Code, rec.Body)
	}
}
