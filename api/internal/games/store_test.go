package games

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"schmegettes/api/internal/rooms"
	"schmegettes/golib/auth"
	"schmegettes/golib/db"
)

// Integration tests against local Supabase (`mise run db:start`), as in api/internal/rooms:
// real anonymous sign-ins, data access as each user. Skipped unless SUPABASE_ANON_KEY is set
// (`supabase status -o env` prints it as ANON_KEY).

type env struct {
	db       *db.DB
	verifier *auth.Verifier
	anonKey  string
	authURL  string
}

func setupDB(t *testing.T) env {
	t.Helper()
	key := os.Getenv("SUPABASE_ANON_KEY")
	if key == "" {
		t.Skip("SUPABASE_ANON_KEY not set")
	}
	url := os.Getenv("DATABASE_URL")
	if url == "" {
		url = "postgresql://app_service:app-service-local-only@127.0.0.1:54322/postgres"
	}
	ctx := context.Background()
	d, err := db.Open(ctx, url)
	if err != nil {
		t.Skipf("local database not reachable: %v", err)
	}
	t.Cleanup(d.Close)
	base := os.Getenv("SUPABASE_URL")
	if base == "" {
		base = "http://127.0.0.1:54321"
	}
	v, err := auth.NewVerifier(ctx, base+"/auth/v1/.well-known/jwks.json")
	if err != nil {
		t.Fatal(err)
	}
	return env{db: d, verifier: v, anonKey: key, authURL: base + "/auth/v1"}
}

func (e env) player(t *testing.T) auth.Claims {
	t.Helper()
	req, _ := http.NewRequest("POST", e.authURL+"/signup", bytes.NewBufferString(`{"data":{}}`))
	req.Header.Set("apikey", e.anonKey)
	req.Header.Set("Content-Type", "application/json")
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	var body struct {
		AccessToken string `json:"access_token"`
	}
	if err := json.NewDecoder(res.Body).Decode(&body); err != nil || body.AccessToken == "" {
		t.Fatalf("anonymous sign-in failed: %d %v", res.StatusCode, err)
	}
	c, err := e.verifier.Verify(body.AccessToken)
	if err != nil {
		t.Fatal(err)
	}
	return c
}

// play runs one game in the room as the game server would: Alice +400, Bob −200 on one clue.
func (e env) play(t *testing.T, roomID string, alice, bob auth.Claims, status string) string {
	t.Helper()
	ctx := context.Background()
	var gameID string
	err := e.db.AsEngine(ctx, func(tx pgx.Tx) error {
		if err := tx.QueryRow(ctx, "select public.start_game($1)::text", roomID).Scan(&gameID); err != nil {
			return err
		}
		var clue string
		if err := tx.QueryRow(ctx, `select id::text from public.board_clues where game_id = $1 and round = 'single'
			order by column_index, row_index limit 1`, gameID).Scan(&clue); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, "select public.reveal_clue($1)", clue); err != nil {
			return err
		}
		for _, a := range []struct {
			user    string
			verdict string
			delta   int
		}{{bob.UserID, "incorrect", -200}, {alice.UserID, "correct", 400}} {
			if _, err := tx.Exec(ctx, "select public.record_answer($1, $2, $3, 'x', 'voice', $4::public.verdict, $5)",
				uuid.NewString(), clue, a.user, a.verdict, a.delta); err != nil {
				return err
			}
		}
		_, err := tx.Exec(ctx, "select public.end_game($1, $2::public.game_status)", gameID, status)
		return err
	})
	if err != nil {
		t.Fatal(err)
	}
	return gameID
}

// grantHost gives a test player host access on the owner connection (private access).
func grantHost(t *testing.T, userID string) {
	t.Helper()
	url := os.Getenv("DATABASE_OWNER_URL")
	if url == "" {
		url = "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
	}
	ctx := context.Background()
	conn, err := pgx.Connect(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close(ctx)
	if _, err := conn.Exec(ctx, `
		with code as (select private.new_host_code('games store test') as c)
		insert into public.hosts (user_id, code) select $1, c from code`, userID); err != nil {
		t.Fatal(err)
	}
}

func TestHistory(t *testing.T) {
	e := setupDB(t)
	ctx := context.Background()
	host, alice, bob, sam, stranger := e.player(t), e.player(t), e.player(t), e.player(t), e.player(t)
	rs := rooms.PGStore{DB: e.db}
	grantHost(t, host.UserID)
	room, err := rs.Create(ctx, host, "Wyatt")
	if err != nil {
		t.Fatal(err)
	}
	for _, j := range []struct {
		c          auth.Claims
		name, role string
	}{{alice, "Alice", "contestant"}, {bob, "Bob", "contestant"}, {sam, "Sam", "spectator"}} {
		if _, err := rs.Join(ctx, j.c, room.Code, j.name, j.role); err != nil {
			t.Fatal(err)
		}
	}
	first := e.play(t, room.ID, alice, bob, "finished")
	second := e.play(t, room.ID, alice, bob, "abandoned") // a rematch, left unfinished
	s := PGStore{DB: e.db}

	got, err := s.List(ctx, alice, All, nil, PageSize+1)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 2 || got[0].GameID != second || got[1].GameID != first {
		t.Fatalf("Alice's games %+v, want newest first", got)
	}
	g := got[1]
	if g.Status != "finished" || g.Score != 400 || g.Placement == nil || *g.Placement != 1 || g.Watched ||
		g.CallerName == nil || *g.CallerName != "Alice" || len(g.Players) != 2 || g.Players[0] != "Alice" {
		t.Errorf("Alice's first game %+v", g)
	}
	if got[0].Status != "abandoned" {
		t.Errorf("status %q", got[0].Status)
	}

	page, err := s.List(ctx, alice, All, nil, 1)
	if err != nil || len(page) != 1 {
		t.Fatal(page, err)
	}
	next, err := s.List(ctx, alice, All, &After{FinishedAt: page[0].FinishedAt, GameID: page[0].GameID}, 1)
	if err != nil || len(next) != 1 || next[0].GameID != first {
		t.Errorf("second page %+v %v", next, err)
	}

	for name, c := range map[string]auth.Claims{"Sam (spectator)": sam, "Wyatt (hosted, didn't play)": host} {
		w, err := s.List(ctx, c, All, nil, PageSize)
		if err != nil || len(w) != 2 || !w[0].Watched || w[0].Placement != nil || w[0].CallerName != nil {
			t.Errorf("%s: %+v %v", name, w, err)
		}
	}
	if none, err := s.List(ctx, stranger, All, nil, PageSize); err != nil || len(none) != 0 {
		t.Errorf("a stranger sees %+v %v", none, err)
	}

	// Kind: Alice played both games and watched none; Sam watched both.
	if p, err := s.List(ctx, alice, Played, nil, PageSize); err != nil || len(p) != 2 {
		t.Errorf("Alice played %+v %v", p, err)
	}
	if w, err := s.List(ctx, alice, Watched, nil, PageSize); err != nil || len(w) != 0 {
		t.Errorf("Alice watched %+v %v", w, err)
	}
	if p, err := s.List(ctx, sam, Played, nil, PageSize); err != nil || len(p) != 0 {
		t.Errorf("Sam played %+v %v", p, err)
	}
	if w, err := s.List(ctx, sam, Watched, nil, PageSize); err != nil || len(w) != 2 {
		t.Errorf("Sam watched %+v %v", w, err)
	}

	// Stats: Alice won the finished game; the abandoned one counts as played but not as a win.
	st, err := s.Stats(ctx, alice)
	if err != nil || st.Games != 2 || st.Played != 2 || st.Wins != 1 || st.Best == nil || *st.Best != 400 {
		t.Errorf("Alice's stats %+v %v", st, err)
	}
	st, err = s.Stats(ctx, bob)
	if err != nil || st.Wins != 0 || st.Best == nil || *st.Best != -200 {
		t.Errorf("Bob's stats %+v %v", st, err)
	}
	st, err = s.Stats(ctx, sam)
	if err != nil || st.Games != 2 || st.Played != 0 || st.Wins != 0 || st.Best != nil {
		t.Errorf("Sam's stats %+v %v", st, err)
	}
	if st, err := s.Stats(ctx, stranger); err != nil || st.Games != 0 || st.Best != nil {
		t.Errorf("a stranger's stats %+v %v", st, err)
	}

	d, err := s.Detail(ctx, bob, first)
	if err != nil {
		t.Fatal(err)
	}
	if d.HostName == nil || *d.HostName != "Wyatt" || d.Watched || len(d.Results) != 2 ||
		d.Results[0].Name != "Alice" || d.Results[1].Placement != 2 || !d.Results[1].IsCaller {
		t.Errorf("detail %+v", d)
	}
	if _, err := s.Detail(ctx, stranger, first); !errors.Is(err, ErrNotFound) {
		t.Errorf("a stranger opened the scoreboard: %v", err)
	}
	if _, err := s.Detail(ctx, alice, uuid.NewString()); !errors.Is(err, ErrNotFound) {
		t.Errorf("no such game: %v", err)
	}
}
