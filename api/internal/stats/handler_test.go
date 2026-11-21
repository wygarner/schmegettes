package stats

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/getkin/kin-openapi/openapi3"
	"github.com/getkin/kin-openapi/openapi3filter"
	"github.com/getkin/kin-openapi/routers/gorillamux"

	"schmegettes/api/internal/contracts"
	"schmegettes/api/internal/server"
	"schmegettes/golib/auth"
)

type fakeStore struct {
	stats       contracts.MyStats
	leaderboard json.RawMessage
	err         error
}

func (f fakeStore) MyStats(context.Context, auth.Claims) (contracts.MyStats, error) {
	return f.stats, f.err
}
func (f fakeStore) Leaderboard(context.Context, auth.Claims) (json.RawMessage, error) {
	return f.leaderboard, f.err
}

type verifier struct{}

func (verifier) Verify(string) (auth.Claims, error) {
	return auth.Claims{UserID: "11111111-1111-4111-8111-111111111111", Raw: []byte(`{}`)}, nil
}

type testRoutes struct {
	contracts.ServerInterface
	Handler
}

func (r testRoutes) GetV1MeStats(w http.ResponseWriter, req *http.Request) { r.MyStats(w, req) }
func (r testRoutes) GetV1Leaderboard(w http.ResponseWriter, req *http.Request) {
	r.Leaderboard(w, req)
}

func call(t *testing.T, store Store, path string) *httptest.ResponseRecorder {
	t.Helper()
	mux := http.NewServeMux()
	app := server.Authenticate(verifier{})(contracts.HandlerWithOptions(
		testRoutes{Handler: Handler{Store: store}}, contracts.StdHTTPServerOptions{BaseRouter: mux},
	))
	req := httptest.NewRequest(http.MethodGet, path, nil)
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
		t.Fatal(err)
	}
	in := &openapi3filter.ResponseValidationInput{
		RequestValidationInput: &openapi3filter.RequestValidationInput{Request: req, PathParams: params, Route: route},
		Status:                 rec.Code, Header: rec.Header(), Body: io.NopCloser(bytes.NewReader(rec.Body.Bytes())),
	}
	if err := openapi3filter.ValidateResponse(context.Background(), in); err != nil {
		t.Errorf("response does not match spec: %v\n%s", err, rec.Body)
	}
	return rec
}

func TestMyStats(t *testing.T) {
	var state contracts.MyStats_Leaderboard
	if err := state.FromRankedState(contracts.RankedState{State: "ranked", Rank: 4}); err != nil {
		t.Fatal(err)
	}
	v := 3
	rec := call(t, fakeStore{stats: contracts.MyStats{
		Games: 10, Wins: &v, WinRate: &v, AverageScore: &v, BestScore: &v, CareerTotal: &v,
		Correct:      contracts.CorrectAnswers{Right: &v, Judged: &v},
		DailyDoubles: contracts.AnswerRecord{Right: &v, Wrong: &v},
		Final:        contracts.AnswerRecord{Right: &v, Wrong: &v}, Leaderboard: state,
	}}, "/v1/me/stats")
	if rec.Code != http.StatusOK || !bytes.Contains(rec.Body.Bytes(), []byte(`"rank":4`)) {
		t.Fatalf("%d %s", rec.Code, rec.Body)
	}
}

func TestLeaderboardHasOnlyPublicRowKeys(t *testing.T) {
	body := json.RawMessage(`{"rows":[{"rank":1,"name":"Alice","winRate":50,"wins":5,"games":10,"isMe":true}],"me":null,"myState":"ranked"}`)
	rec := call(t, fakeStore{leaderboard: body}, "/v1/leaderboard")
	if rec.Code != http.StatusOK {
		t.Fatalf("%d %s", rec.Code, rec.Body)
	}
	var got struct {
		Rows []map[string]json.RawMessage `json:"rows"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	want := map[string]bool{"rank": true, "name": true, "winRate": true, "wins": true, "games": true, "isMe": true}
	if len(got.Rows) != 1 || len(got.Rows[0]) != len(want) {
		t.Fatalf("unexpected row keys: %v", got.Rows)
	}
	for key := range got.Rows[0] {
		if !want[key] {
			t.Fatalf("private key exposed: %s", key)
		}
	}
}

func TestProblems(t *testing.T) {
	for _, tc := range []struct {
		err  error
		kind string
	}{
		{ErrNotSignedIn, "not-signed-in"},
		{ErrNoCountedGame, "no-counted-games"},
	} {
		rec := call(t, fakeStore{err: tc.err}, "/v1/leaderboard")
		if rec.Code != http.StatusForbidden || !bytes.Contains(rec.Body.Bytes(), []byte("/problems/"+tc.kind)) {
			t.Errorf("%s: %d %s", tc.kind, rec.Code, rec.Body)
		}
	}
}
