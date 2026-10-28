package db

import (
	"context"
	"os"
	"testing"

	"github.com/jackc/pgx/v5"

	"schmegettes/golib/auth"
)

// Runs against local Supabase (`mise run db:start`); skipped when it isn't reachable.
func open(t *testing.T) *DB {
	t.Helper()
	url := os.Getenv("DATABASE_URL")
	if url == "" {
		url = "postgresql://app_service:app-service-local-only@127.0.0.1:54322/postgres"
	}
	d, err := Open(context.Background(), url)
	if err != nil {
		t.Skipf("local database not reachable: %v", err)
	}
	t.Cleanup(d.Close)
	return d
}

func TestAsUserSetsRoleAndClaims(t *testing.T) {
	d := open(t)
	const user = "11111111-1111-4111-8111-111111111111"
	claims := auth.Claims{UserID: user, Raw: []byte(`{"sub":"` + user + `","role":"authenticated"}`)}

	var role, uid string
	err := d.AsUser(context.Background(), claims, func(tx pgx.Tx) error {
		return tx.QueryRow(context.Background(), "select current_user, auth.uid()::text").Scan(&role, &uid)
	})
	if err != nil {
		t.Fatal(err)
	}
	if role != "authenticated" || uid != user {
		t.Errorf("role %q uid %q", role, uid)
	}
}

func TestAsEngine(t *testing.T) {
	d := open(t)
	var role string
	if err := d.AsEngine(context.Background(), func(tx pgx.Tx) error {
		return tx.QueryRow(context.Background(), "select current_user").Scan(&role)
	}); err != nil {
		t.Fatal(err)
	}
	if role != "game_engine" {
		t.Errorf("role %q", role)
	}
}

func TestRoleDoesNotLeakPastTheTransaction(t *testing.T) {
	d := open(t)
	_ = d.AsEngine(context.Background(), func(pgx.Tx) error { return nil })
	var role string
	if err := d.pool.QueryRow(context.Background(), "select current_user").Scan(&role); err != nil {
		t.Fatal(err)
	}
	if role != "app_service" {
		t.Errorf("after AsEngine the pool connection is %q", role)
	}
}
