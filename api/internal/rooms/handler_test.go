package rooms

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
	"github.com/getkin/kin-openapi/routers"
	"github.com/getkin/kin-openapi/routers/gorillamux"
	openapi_types "github.com/oapi-codegen/runtime/types"

	"schmegettes/api/internal/contracts"
	"schmegettes/api/internal/server"
	"schmegettes/golib/auth"
)

type fakeStore struct {
	room Room
	err  error
	got  []string
}

func (f *fakeStore) Create(_ context.Context, _ auth.Claims, name string) (Room, error) {
	f.got = []string{name}
	return f.room, f.err
}
func (f *fakeStore) Join(_ context.Context, _ auth.Claims, code, name, role string) (Room, error) {
	f.got = []string{code, name, role}
	return f.room, f.err
}
func (f *fakeStore) ByCode(_ context.Context, _ auth.Claims, code string) (Room, error) {
	f.got = []string{code}
	return f.room, f.err
}

var sample = Room{
	ID: "6f0d2a5e-8a0b-4c39-9a4e-2d1f0b7a9c11", Code: "K7RXM", Status: "open",
	HostUserID: "0b8a1c2d-3e4f-4a5b-8c6d-7e8f9a0b1c2d", HostDisplayName: "Wyatt", MaxPlayers: 6,
}

type allowAll struct{}

func (allowAll) Verify(string) (auth.Claims, error) {
	return auth.Claims{UserID: sample.HostUserID, Raw: []byte(`{}`)}, nil
}

type routes struct{ Handler }

func (routes) GetHealthz(http.ResponseWriter, *http.Request)                             {}
func (routes) GetVersion(http.ResponseWriter, *http.Request)                             {}
func (routes) GetV1Games(http.ResponseWriter, *http.Request, contracts.GetV1GamesParams) {}
func (routes) GetV1GamesGameId(http.ResponseWriter, *http.Request, openapi_types.UUID)   {}
func (routes) GetV1HostAccess(http.ResponseWriter, *http.Request)                        {}
func (routes) PostV1HostAccessRedeem(http.ResponseWriter, *http.Request)                 {}
func (routes) GetV1Me(http.ResponseWriter, *http.Request)                                {}
func (routes) PatchV1Me(http.ResponseWriter, *http.Request)                              {}
func (routes) GetV1RoomsRoomId(http.ResponseWriter, *http.Request, openapi_types.UUID)   {}
func (routes) PatchV1RoomsRoomId(http.ResponseWriter, *http.Request, openapi_types.UUID) {}
func (r routes) PostV1Rooms(w http.ResponseWriter, req *http.Request)                    { r.Create(w, req) }
func (r routes) PostV1RoomsJoin(w http.ResponseWriter, req *http.Request)                { r.Join(w, req) }
func (r routes) GetV1RoomsByCodeCode(w http.ResponseWriter, req *http.Request, c string) {
	r.ByCode(w, req, c)
}

func specRouter(t *testing.T) routers.Router {
	t.Helper()
	doc, err := openapi3.NewLoader().LoadFromFile("../contracts/openapi30.gen.yaml")
	if err != nil {
		t.Fatal(err)
	}
	doc.Servers = nil
	router, err := gorillamux.NewRouter(doc)
	if err != nil {
		t.Fatal(err)
	}
	return router
}

// call runs a request through the real middleware and checks the response against the spec.
func call(t *testing.T, store *fakeStore, method, path, body string) *httptest.ResponseRecorder {
	t.Helper()
	h := Handler{Store: store, SocketBase: "ws://game.test/"}
	mux := http.NewServeMux()
	app := server.Authenticate(allowAll{})(contracts.HandlerWithOptions(routes{h}, contracts.StdHTTPServerOptions{BaseRouter: mux}))

	req := httptest.NewRequest(method, path, bytes.NewBufferString(body))
	req.Header.Set("Authorization", "Bearer x")
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	app.ServeHTTP(rec, req)

	router := specRouter(t)
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

func TestCreate(t *testing.T) {
	s := &fakeStore{room: sample}
	rec := call(t, s, "POST", "/v1/rooms", `{"displayName":"Wyatt"}`)
	if rec.Code != http.StatusCreated {
		t.Fatalf("status %d: %s", rec.Code, rec.Body)
	}
	if !bytes.Contains(rec.Body.Bytes(), []byte(`"gameSocketUrl":"ws://game.test/rooms/`+sample.ID+`/ws"`)) {
		t.Errorf("socket url missing: %s", rec.Body)
	}
	if s.got[0] != "Wyatt" {
		t.Errorf("store got %v", s.got)
	}
}

func TestCreateWithoutHostAccessIs403(t *testing.T) {
	rec := call(t, &fakeStore{err: ErrNotAHost}, "POST", "/v1/rooms", `{"displayName":"Wyatt"}`)
	if rec.Code != http.StatusForbidden || !bytes.Contains(rec.Body.Bytes(), []byte("/problems/not-a-host")) {
		t.Errorf("%d %s", rec.Code, rec.Body)
	}
}

func TestCreateRejectsBadNames(t *testing.T) {
	for _, body := range []string{`{"displayName":"   "}`, `{"displayName":"123456789012345678901"}`, `{}`, `{"displayName":"A","x":1}`} {
		s := &fakeStore{room: sample}
		if rec := call(t, s, "POST", "/v1/rooms", body); rec.Code != http.StatusBadRequest {
			t.Errorf("%s: status %d", body, rec.Code)
		}
		if s.got != nil {
			t.Errorf("%s reached the store", body)
		}
	}
}

func TestJoin(t *testing.T) {
	s := &fakeStore{room: sample}
	rec := call(t, s, "POST", "/v1/rooms/join", `{"code":"K7RXM","displayName":"Alice"}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d: %s", rec.Code, rec.Body)
	}
	if got := s.got; got[0] != "K7RXM" || got[1] != "Alice" || got[2] != "contestant" {
		t.Errorf("store got %v", got)
	}
	call(t, s, "POST", "/v1/rooms/join", `{"code":"K7RXM","displayName":"Eve","role":"spectator"}`)
	if s.got[2] != "spectator" {
		t.Errorf("role %q", s.got[2])
	}
}

func TestJoinErrors(t *testing.T) {
	for err, want := range map[error]struct {
		status int
		kind   string
	}{
		ErrNotFound:           {404, "room-not-found"},
		ErrRoomFull:           {409, "room-full"},
		ErrGameStarted:        {409, "game-started"},
		ErrInvalidName:        {400, "invalid-name"},
		errors.New("db down"): {500, "internal"},
	} {
		rec := call(t, &fakeStore{err: err}, "POST", "/v1/rooms/join", `{"code":"K7RXM","displayName":"Alice"}`)
		if rec.Code != want.status || !bytes.Contains(rec.Body.Bytes(), []byte("/problems/"+want.kind)) {
			t.Errorf("%v: %d %s", err, rec.Code, rec.Body)
		}
	}
}

func TestByCode(t *testing.T) {
	seasons := []int{1, 2}
	room := sample
	room.Seasons = seasons
	s := &fakeStore{room: room}
	rec := call(t, s, "GET", "/v1/rooms/by-code/K7RXM", "")
	if rec.Code != http.StatusOK || !bytes.Contains(rec.Body.Bytes(), []byte(`"seasons":[1,2]`)) {
		t.Fatalf("status %d: %s", rec.Code, rec.Body)
	}
	if rec := call(t, &fakeStore{err: ErrNotFound}, "GET", "/v1/rooms/by-code/K7RXM", ""); rec.Code != 404 {
		t.Errorf("non-member: %d", rec.Code)
	}
}
