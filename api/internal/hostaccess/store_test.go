package hostaccess

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"os"
	"sync"
	"testing"

	"github.com/jackc/pgx/v5"

	"schmegettes/golib/auth"
	"schmegettes/golib/db"
)

// Integration tests against local Supabase (`mise run db:start`), with real anonymous
// sign-ins. Skipped unless SUPABASE_ANON_KEY is set (`supabase status -o env` prints ANON_KEY).

type env struct {
	store    PGStore
	verifier *auth.Verifier
	anonKey  string
	authURL  string
	ownerURL string
}

func setupDB(t *testing.T) env {
	t.Helper()
	key := os.Getenv("SUPABASE_ANON_KEY")
	if key == "" {
		t.Skip("SUPABASE_ANON_KEY not set")
	}
	url := getenv("DATABASE_URL", "postgresql://app_service:app-service-local-only@127.0.0.1:54322/postgres")
	ctx := context.Background()
	d, err := db.Open(ctx, url)
	if err != nil {
		t.Skipf("local database not reachable: %v", err)
	}
	t.Cleanup(d.Close)
	base := getenv("SUPABASE_URL", "http://127.0.0.1:54321")
	v, err := auth.NewVerifier(ctx, base+"/auth/v1/.well-known/jwks.json")
	if err != nil {
		t.Fatal(err)
	}
	return env{
		store: PGStore{DB: d}, verifier: v, anonKey: key, authURL: base + "/auth/v1",
		ownerURL: getenv("DATABASE_OWNER_URL", "postgresql://postgres:postgres@127.0.0.1:54322/postgres"),
	}
}

func getenv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
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

// currentCode reads the current rotating code on the owner connection, as the admin page would.
func (e env) currentCode(t *testing.T) string {
	t.Helper()
	ctx := context.Background()
	conn, err := pgx.Connect(ctx, e.ownerURL)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close(ctx)
	var code string
	if err := conn.QueryRow(ctx, "select current_code from private.host_code_rotation").Scan(&code); err != nil {
		t.Fatal(err)
	}
	return code
}

func TestRedeemGivesHostAccess(t *testing.T) {
	e := setupDB(t)
	ctx := context.Background()
	alice := e.player(t)
	code := e.currentCode(t)

	if ok, err := e.store.CanHost(ctx, alice); err != nil || ok {
		t.Fatalf("before: %v %v", ok, err)
	}
	if ok, err := e.store.Redeem(ctx, alice, "nope"); err != nil || ok {
		t.Fatalf("wrong code: %v %v", ok, err)
	}
	typed := code[:4] + "-" + code[4:] // as a person types it
	if ok, err := e.store.Redeem(ctx, alice, typed); err != nil || !ok {
		t.Fatalf("valid code: %v %v", ok, err)
	}
	if ok, err := e.store.CanHost(ctx, alice); err != nil || !ok {
		t.Fatalf("after: %v %v", ok, err)
	}
	if ok, err := e.store.Redeem(ctx, e.player(t), code); err != nil || !ok {
		t.Errorf("the current code should work for a second player: %v %v", ok, err)
	}
}

// Any number of players can redeem the current code at the same moment.
func TestPlayersRedeemOneCodeAtOnce(t *testing.T) {
	e := setupDB(t)
	ctx := context.Background()
	players := []auth.Claims{e.player(t), e.player(t), e.player(t)}
	code := e.currentCode(t)

	results := make([]bool, len(players))
	errs := make([]error, len(players))
	var wg sync.WaitGroup
	for i, p := range players {
		wg.Add(1)
		go func() {
			defer wg.Done()
			results[i], errs[i] = e.store.Redeem(ctx, p, code)
		}()
	}
	wg.Wait()
	for i := range players {
		if errs[i] != nil || !results[i] {
			t.Errorf("player %d: %v %v", i, results[i], errs[i])
		}
	}
}
