package rooms

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"testing"

	"github.com/jackc/pgx/v5"

	"schmegettes/golib/auth"
	"schmegettes/golib/db"
)

// Integration tests against local Supabase (`mise run db:start`). They sign in anonymously
// through Supabase Auth, so the tokens are real. Skipped unless SUPABASE_ANON_KEY is set
// (`supabase status -o env` prints it as ANON_KEY).

type env struct {
	store    PGStore
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
	return env{store: PGStore{DB: d}, verifier: v, anonKey: key, authURL: base + "/auth/v1"}
}

// player signs in anonymously and returns verified claims.
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

// grantHost gives a test player host access directly, on the owner connection (players can't
// write hosts; redeeming a code is tested in hostaccess and private_access.test.sql).
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
		with code as (select private.new_host_code('rooms store test') as c)
		insert into public.hosts (user_id, code) select $1, c from code`, userID); err != nil {
		t.Fatal(err)
	}
}

func TestStoreLobby(t *testing.T) {
	e := setupDB(t)
	ctx := context.Background()
	host, alice, bob := e.player(t), e.player(t), e.player(t)

	if _, err := e.store.Create(ctx, host, "Wyatt"); !errors.Is(err, ErrNotAHost) {
		t.Fatalf("create without host access: %v", err)
	}
	grantHost(t, host.UserID)

	room, err := e.store.Create(ctx, host, "Wyatt")
	if err != nil {
		t.Fatal(err)
	}
	if room.HostDisplayName != "Wyatt" || room.HostUserID != host.UserID || room.Status != "open" || room.HostPlays {
		t.Errorf("created %+v", room)
	}

	if _, err := e.store.ByCode(ctx, alice, room.Code); !errors.Is(err, ErrNotFound) {
		t.Errorf("non-member by code: %v", err)
	}
	joined, err := e.store.Join(ctx, alice, room.Code, "Alice", "contestant")
	if err != nil || joined.ID != room.ID {
		t.Fatalf("join: %v %+v", err, joined)
	}
	if got, err := e.store.ByCode(ctx, alice, room.Code); err != nil || got.ID != room.ID {
		t.Errorf("member by code: %v", err)
	}
	if _, err := e.store.Join(ctx, bob, "ZZZZZ", "Bob", "contestant"); !errors.Is(err, ErrNotFound) {
		t.Errorf("unknown code: %v", err)
	}
	if _, err := e.store.Join(ctx, bob, room.Code, " ", "contestant"); !errors.Is(err, ErrInvalidName) {
		t.Errorf("blank name: %v", err)
	}

	// A second room replaces the first.
	second, err := e.store.Create(ctx, host, "Wyatt")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := e.store.ByCode(ctx, alice, room.Code); !errors.Is(err, ErrNotFound) {
		t.Errorf("replaced room still found: %v", err)
	}
	if _, err := e.store.Join(ctx, bob, room.Code, "Bob", "contestant"); !errors.Is(err, ErrNotFound) {
		t.Errorf("join replaced room: %v", err)
	}
	if second.Code == "" || second.ID == room.ID {
		t.Errorf("second room %+v", second)
	}
}
