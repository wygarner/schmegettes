package admin

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"

	"schmegettes/golib/auth"
	"schmegettes/golib/db"
)

// Integration tests against local Supabase (`mise run db:start`), with real sign-ins. Skipped
// unless SUPABASE_ANON_KEY is set (`supabase status -o env` prints ANON_KEY). The rotation row is
// restored afterwards, so local DEVS-TEST keeps working.

type env struct {
	store    PGStore
	verifier *auth.Verifier
	anonKey  string
	authURL  string
	ownerURL string
}

func getenv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func setupDB(t *testing.T) env {
	t.Helper()
	key := os.Getenv("SUPABASE_ANON_KEY")
	if key == "" {
		t.Skip("SUPABASE_ANON_KEY not set")
	}
	ctx := context.Background()
	d, err := db.Open(ctx, getenv("DATABASE_URL", "postgresql://app_service:app-service-local-only@127.0.0.1:54322/postgres"))
	if err != nil {
		t.Skipf("local database not reachable: %v", err)
	}
	t.Cleanup(d.Close)
	base := getenv("SUPABASE_URL", "http://127.0.0.1:54321")
	v, err := auth.NewVerifier(ctx, base+"/auth/v1/.well-known/jwks.json")
	if err != nil {
		t.Fatal(err)
	}
	e := env{store: PGStore{DB: d}, verifier: v, anonKey: key, authURL: base + "/auth/v1",
		ownerURL: getenv("DATABASE_OWNER_URL", "postgresql://postgres:postgres@127.0.0.1:54322/postgres")}

	var saved struct {
		code               string
		started, rotates   time.Time
		previous           *string
		previousValidUntil *time.Time
	}
	e.owner(t, func(c *pgx.Conn) error {
		return c.QueryRow(ctx, `select current_code, current_started_at, rotates_at, previous_code, previous_valid_until
			from private.host_code_rotation`).Scan(&saved.code, &saved.started, &saved.rotates, &saved.previous, &saved.previousValidUntil)
	})
	t.Cleanup(func() {
		e.owner(t, func(c *pgx.Conn) error {
			_, err := c.Exec(ctx, `update private.host_code_rotation set current_code = $1, current_started_at = $2,
				rotates_at = $3, previous_code = $4, previous_valid_until = $5`,
				saved.code, saved.started, saved.rotates, saved.previous, saved.previousValidUntil)
			return err
		})
	})
	return e
}

// owner runs fn on the owner connection, as the owner's SQL editor would.
func (e env) owner(t *testing.T, fn func(*pgx.Conn) error) {
	t.Helper()
	ctx := context.Background()
	conn, err := pgx.Connect(ctx, e.ownerURL)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close(ctx)
	if err := fn(conn); err != nil {
		t.Fatal(err)
	}
}

func (e env) signUp(t *testing.T, body string) auth.Claims {
	t.Helper()
	req, _ := http.NewRequest("POST", e.authURL+"/signup", bytes.NewBufferString(body))
	req.Header.Set("apikey", e.anonKey)
	req.Header.Set("Content-Type", "application/json")
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	var out struct {
		AccessToken string `json:"access_token"`
	}
	if err := json.NewDecoder(res.Body).Decode(&out); err != nil || out.AccessToken == "" {
		t.Fatalf("sign-up failed: %d %v", res.StatusCode, err)
	}
	c, err := e.verifier.Verify(out.AccessToken)
	if err != nil {
		t.Fatal(err)
	}
	return c
}

func (e env) guest(t *testing.T) auth.Claims { return e.signUp(t, `{"data":{}}`) }

func (e env) account(t *testing.T) auth.Claims {
	email := fmt.Sprintf("admin-store-%d@example.test", time.Now().UnixNano())
	return e.signUp(t, fmt.Sprintf(`{"email":%q,"password":"correct horse battery"}`, email))
}

func (e env) makeAdmin(t *testing.T, c auth.Claims) {
	e.owner(t, func(conn *pgx.Conn) error {
		_, err := conn.Exec(context.Background(), "insert into private.admins (user_id) values ($1)", c.UserID)
		return err
	})
}

func TestOnlyListedAccountsAreAdmins(t *testing.T) {
	e := setupDB(t)
	ctx := context.Background()
	for name, c := range map[string]auth.Claims{"guest": e.guest(t), "account": e.account(t)} {
		if _, err := e.store.CurrentCode(ctx, c); !errors.Is(err, ErrNotFound) {
			t.Errorf("%s reading the code: %v", name, err)
		}
		if _, err := e.store.Hosts(ctx, c); !errors.Is(err, ErrNotFound) {
			t.Errorf("%s listing hosts: %v", name, err)
		}
	}
	listedGuest := e.guest(t)
	e.makeAdmin(t, listedGuest)
	if _, err := e.store.CurrentCode(ctx, listedGuest); !errors.Is(err, ErrNotFound) {
		t.Errorf("a guest on the list must still be refused: %v", err)
	}
}

func TestAdminReadsAndRotates(t *testing.T) {
	e := setupDB(t)
	ctx := context.Background()
	a := e.account(t)
	e.makeAdmin(t, a)

	before, err := e.store.CurrentCode(ctx, a)
	if err != nil || len(before.Code) != 8 {
		t.Fatalf("current code: %+v %v", before, err)
	}
	if before.ServerTime.IsZero() || !before.RotatesAt.After(before.CurrentStartedAt) {
		t.Errorf("times: %+v", before)
	}

	// Two admins confirm the same code at once: one new code, and both see it.
	results := make([]HostCode, 2)
	errs := make([]error, 2)
	var wg sync.WaitGroup
	for i := range results {
		wg.Add(1)
		go func() {
			defer wg.Done()
			results[i], errs[i] = e.store.Rotate(ctx, a, before.Code[:4]+"-"+before.Code[4:])
		}()
	}
	wg.Wait()
	if errs[0] != nil || errs[1] != nil {
		t.Fatal(errs)
	}
	if results[0].Code != results[1].Code || results[0].Code == before.Code {
		t.Errorf("rotations: %s %s (was %s)", results[0].Code, results[1].Code, before.Code)
	}
	if got := results[0].RotatesAt.Sub(results[0].CurrentStartedAt); got != 45*time.Minute {
		t.Errorf("next rotation in %v", got)
	}
	if results[0].PreviousValidUntil != nil {
		t.Error("Rotate now leaves no grace")
	}
}

func TestAdminManagesHosts(t *testing.T) {
	e := setupDB(t)
	ctx := context.Background()
	a := e.account(t)
	e.makeAdmin(t, a)
	g := e.guest(t)
	e.owner(t, func(c *pgx.Conn) error {
		_, err := c.Exec(ctx, `insert into public.hosts (user_id, code) values ($1, (select current_code from private.host_code_rotation))`, g.UserID)
		return err
	})

	hosts, err := e.store.Hosts(ctx, a)
	if err != nil || len(hosts) == 0 || hosts[0].UserID != g.UserID || hosts[0].Kind != "guest" || hosts[0].Email != nil {
		t.Fatalf("newest host should be the guest: %+v %v", hosts, err)
	}
	note := "  Thursday trivia "
	h, err := e.store.SetNote(ctx, a, g.UserID, &note)
	if err != nil || h.Note == nil || *h.Note != "Thursday trivia" {
		t.Fatalf("note: %+v %v", h, err)
	}
	if _, err := e.store.SetNote(ctx, a, "99999999-9999-4999-8999-999999999999", &note); !errors.Is(err, ErrNotFound) {
		t.Errorf("note for a non-host: %v", err)
	}
	if err := e.store.Remove(ctx, a, g.UserID); err != nil {
		t.Fatal(err)
	}
	if err := e.store.Remove(ctx, a, g.UserID); err != nil {
		t.Errorf("removing twice: %v", err)
	}

	// Taken off the list: refused on the very next call.
	e.owner(t, func(c *pgx.Conn) error {
		_, err := c.Exec(ctx, "delete from private.admins where user_id = $1", a.UserID)
		return err
	})
	if _, err := e.store.Hosts(ctx, a); !errors.Is(err, ErrNotFound) {
		t.Errorf("removed admin: %v", err)
	}
}
