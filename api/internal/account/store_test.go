package account

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

	"schmegettes/golib/auth"
	"schmegettes/golib/db"
)

// Integration tests against local Supabase (`mise run db:start`). Guests are real anonymous
// sign-ins; accounts are users created on the owner connection, as Apple or Google sign-in
// would, with claims built here (the store trusts verified claims). Skipped unless
// SUPABASE_ANON_KEY is set (`supabase status -o env` prints ANON_KEY).

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

// guest signs in anonymously and returns the verified claims.
func (e env) guest(t *testing.T) auth.Claims {
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
	if !c.IsAnonymous {
		t.Fatal("an anonymous sign-in should say is_anonymous")
	}
	return c
}

// account creates a signed-in user, as a provider sign-in would.
func (e env) account(t *testing.T) auth.Claims {
	t.Helper()
	id := uuid.NewString()
	e.owner(t, "insert into auth.users (id, is_anonymous) values ($1, false)", id)
	t.Cleanup(func() { e.owner(t, "delete from auth.users where id = $1", id) })
	raw, _ := json.Marshal(map[string]any{"sub": id, "role": "authenticated", "is_anonymous": false})
	return auth.Claims{UserID: id, Raw: raw}
}

func (e env) owner(t *testing.T, sql string, args ...any) {
	t.Helper()
	ctx := context.Background()
	conn, err := pgx.Connect(ctx, e.ownerURL)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close(ctx)
	if _, err := conn.Exec(ctx, sql, args...); err != nil {
		t.Fatal(err)
	}
}

func TestNameAndProfile(t *testing.T) {
	e := setupDB(t)
	ctx := context.Background()
	acct := e.account(t)

	p, err := e.store.Profile(ctx, acct)
	if err != nil || p.DisplayName != "" || p.AccountName != nil {
		t.Fatalf("no profile yet: %+v %v", p, err)
	}
	p, err = e.store.SetName(ctx, acct, "Wyatt")
	if err != nil || p.AccountName == nil || *p.AccountName != "Wyatt" {
		t.Fatalf("set name: %+v %v", p, err)
	}
	if _, err := e.store.SetName(ctx, e.guest(t), "Gus"); !errors.Is(err, ErrForbidden) {
		t.Errorf("a guest set a name: %v", err)
	}
}

func TestMergeMovesTheGuest(t *testing.T) {
	e := setupDB(t)
	ctx := context.Background()
	guest := e.guest(t)
	acct := e.account(t)

	if _, _, err := e.store.CreateTicket(ctx, acct); !errors.Is(err, ErrForbidden) {
		t.Errorf("an account got a ticket: %v", err)
	}
	ticket, expires, err := e.store.CreateTicket(ctx, guest)
	if err != nil || ticket == "" || expires.IsZero() {
		t.Fatalf("ticket: %q %v %v", ticket, expires, err)
	}
	if _, err := e.store.Merge(ctx, guest, ticket); !errors.Is(err, ErrForbidden) {
		t.Errorf("a guest redeemed a ticket: %v", err)
	}
	if _, err := e.store.Merge(ctx, acct, "wrong"); !errors.Is(err, ErrInvalid) {
		t.Errorf("a wrong ticket: %v", err)
	}
	m, err := e.store.Merge(ctx, acct, ticket)
	if err != nil || !m.AccountWasNew || m.GamesAdded != 0 || m.HostAccessAdded {
		t.Fatalf("merge: %+v %v", m, err)
	}
	if _, err := e.store.Merge(ctx, acct, ticket); !errors.Is(err, ErrInvalid) {
		t.Errorf("a ticket worked twice: %v", err)
	}
}

func TestDeleteAccount(t *testing.T) {
	e := setupDB(t)
	ctx := context.Background()
	if err := e.store.Delete(ctx, e.guest(t)); !errors.Is(err, ErrForbidden) {
		t.Errorf("a guest deleted an account: %v", err)
	}
	acct := e.account(t)
	if _, err := e.store.SetName(ctx, acct, "Gone"); err != nil {
		t.Fatal(err)
	}
	if err := e.store.Delete(ctx, acct); err != nil {
		t.Fatalf("delete: %v", err)
	}
}
