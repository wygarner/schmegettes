package games

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

const me = "0b8a1c2d-3e4f-4a5b-8c6d-7e8f9a0b1c2d"

type fakeStore struct {
	games  []Summary
	detail Detail
	err    error
	after  *After
	limit  int
}

func (f *fakeStore) List(_ context.Context, _ auth.Claims, after *After, limit int) ([]Summary, error) {
	f.after, f.limit = after, limit
	if f.err != nil {
		return nil, f.err
	}
	out := f.games
	if len(out) > limit {
		out = out[:limit]
	}
	return out, nil
}

func (f *fakeStore) Detail(context.Context, auth.Claims, string) (Detail, error) {
	return f.detail, f.err
}

type allowAll struct{}

func (allowAll) Verify(string) (auth.Claims, error) {
	return auth.Claims{UserID: me, Raw: []byte(`{}`)}, nil
}

type routes struct{ Handler }

func (routes) GetHealthz(http.ResponseWriter, *http.Request)                             {}
func (routes) GetVersion(http.ResponseWriter, *http.Request)                             {}
func (routes) GetV1Me(http.ResponseWriter, *http.Request)                                {}
func (routes) PatchV1Me(http.ResponseWriter, *http.Request)                              {}
func (routes) GetV1RoomsRoomId(http.ResponseWriter, *http.Request, openapi_types.UUID)   {}
func (routes) PatchV1RoomsRoomId(http.ResponseWriter, *http.Request, openapi_types.UUID) {}
func (routes) PostV1Rooms(http.ResponseWriter, *http.Request)                            {}
func (routes) PostV1RoomsJoin(http.ResponseWriter, *http.Request)                        {}
func (routes) GetV1RoomsByCodeCode(http.ResponseWriter, *http.Request, string)           {}
func (r routes) GetV1Games(w http.ResponseWriter, req *http.Request, p contracts.GetV1GamesParams) {
	r.List(w, req, p)
}
func (r routes) GetV1GamesGameId(w http.ResponseWriter, req *http.Request, id openapi_types.UUID) {
	r.Detail(w, req, id)
}

// call runs a request through the real middleware and checks the response against the spec.
func call(t *testing.T, store *fakeStore, path string) *httptest.ResponseRecorder {
	t.Helper()
	mux := http.NewServeMux()
	app := server.Authenticate(allowAll{})(contracts.HandlerWithOptions(routes{Handler{Store: store}}, contracts.StdHTTPServerOptions{
		BaseRouter: mux,
		ErrorHandlerFunc: func(w http.ResponseWriter, _ *http.Request, _ error) {
			server.Problem(w, http.StatusBadRequest, "invalid-request", "Invalid request")
		},
	}))
	req := httptest.NewRequest("GET", path, nil)
	req.Header.Set("Authorization", "Bearer x")
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
		t.Errorf("GET %s → %d does not match the spec: %v\n%s", path, rec.Code, err, rec.Body)
	}
	return rec
}

func games(n int) []Summary {
	out := make([]Summary, n)
	start := time.Date(2026, 10, 1, 20, 0, 0, 0, time.UTC)
	for i := range out {
		first := 1
		name := "Dana"
		out[i] = Summary{
			GameID: "6f0d2a5e-8a0b-4c39-9a4e-2d1f0b7a9c" + string(rune('a'+i/10)) + string(rune('0'+i%10)),
			Status: "finished", StartedAt: start.Add(-time.Duration(i) * time.Hour),
			FinishedAt: start.Add(-time.Duration(i)*time.Hour + 40*time.Minute),
			Score:      1200, Placement: &first, CallerName: &name, Players: []string{"Dana", "Bob"},
		}
	}
	return out
}

func TestListPagesOf20(t *testing.T) {
	s := &fakeStore{games: games(23)}
	rec := call(t, s, "/v1/games")
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d: %s", rec.Code, rec.Body)
	}
	if s.limit != PageSize+1 || s.after != nil {
		t.Errorf("store asked for %d after %v", s.limit, s.after)
	}
	var body struct {
		Items      []contracts.GameSummary `json:"items"`
		NextCursor *string                 `json:"nextCursor"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if len(body.Items) != PageSize || body.NextCursor == nil {
		t.Fatalf("%d items, cursor %v", len(body.Items), body.NextCursor)
	}
	if body.Items[0].PlayerCount != 2 || *body.Items[0].CallerDisplayName != "Dana" {
		t.Errorf("item %+v", body.Items[0])
	}

	// The cursor round-trips to the last game on the page.
	call(t, s, "/v1/games?cursor="+*body.NextCursor)
	last := games(23)[PageSize-1]
	if s.after == nil || s.after.GameID != last.GameID || !s.after.FinishedAt.Equal(last.FinishedAt) {
		t.Errorf("cursor decoded to %+v, want %s", s.after, last.GameID)
	}
}

func TestListLastPageHasNoCursor(t *testing.T) {
	rec := call(t, &fakeStore{games: games(3)}, "/v1/games")
	if !bytes.Contains(rec.Body.Bytes(), []byte(`"nextCursor":null`)) {
		t.Errorf("body %s", rec.Body)
	}
	rec = call(t, &fakeStore{}, "/v1/games")
	if !bytes.Contains(rec.Body.Bytes(), []byte(`"items":[]`)) {
		t.Errorf("empty list body %s", rec.Body)
	}
}

func TestListWatchedGame(t *testing.T) {
	g := games(1)[0]
	g.Watched, g.Placement, g.CallerName, g.Score = true, nil, nil, 0
	rec := call(t, &fakeStore{games: []Summary{g}}, "/v1/games")
	if !bytes.Contains(rec.Body.Bytes(), []byte(`"watched":true`)) || !bytes.Contains(rec.Body.Bytes(), []byte(`"placement":null`)) {
		t.Errorf("body %s", rec.Body)
	}
}

func TestBadCursor(t *testing.T) {
	for _, c := range []string{"nope", "eyJmIjoxfQ", "eyJmIjoiMjAyNi0xMC0wMVQyMDowMDowMFoiLCJnIjoieCJ9"} {
		s := &fakeStore{}
		rec := call(t, s, "/v1/games?cursor="+c)
		if rec.Code != http.StatusBadRequest || s.limit != 0 {
			t.Errorf("%s: %d, store called: %v", c, rec.Code, s.limit != 0)
		}
	}
}

func TestDetail(t *testing.T) {
	host := "Carol"
	done := time.Date(2026, 10, 26, 20, 55, 0, 0, time.UTC)
	s := &fakeStore{detail: Detail{
		GameID: "6f0d2a5e-8a0b-4c39-9a4e-2d1f0b7a9c11", Status: "finished",
		StartedAt: done.Add(-41 * time.Minute), FinishedAt: &done, HostName: &host,
		Results: []Result{
			{Name: "Dana", Score: 12400, Placement: 1, IsCaller: true},
			{Name: "Bob", Score: 8000, Placement: 2},
			{Name: "Carol", Score: 8000, Placement: 2},
			{Name: "Former player", Score: -400, Placement: 4},
		},
	}}
	rec := call(t, s, "/v1/games/6f0d2a5e-8a0b-4c39-9a4e-2d1f0b7a9c11")
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d: %s", rec.Code, rec.Body)
	}
	for _, want := range []string{`"hostDisplayName":"Carol"`, `"isCaller":true`, `"displayName":"Former player"`} {
		if !bytes.Contains(rec.Body.Bytes(), []byte(want)) {
			t.Errorf("missing %s in %s", want, rec.Body)
		}
	}
}

func TestDetailNotAMember(t *testing.T) {
	rec := call(t, &fakeStore{err: ErrNotFound}, "/v1/games/6f0d2a5e-8a0b-4c39-9a4e-2d1f0b7a9c11")
	if rec.Code != http.StatusNotFound {
		t.Errorf("status %d", rec.Code)
	}
	rec = call(t, &fakeStore{err: errors.New("db down")}, "/v1/games/6f0d2a5e-8a0b-4c39-9a4e-2d1f0b7a9c11")
	if rec.Code != http.StatusInternalServerError {
		t.Errorf("status %d", rec.Code)
	}
}
