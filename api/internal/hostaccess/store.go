// Package hostaccess serves host access: whether the caller's device can host, and spending
// a one-use host code to get it. All data access runs as the caller (db.AsUser); the rules
// live in the private.* functions (supabase/migrations/*_private_access.sql).
package hostaccess

import (
	"context"

	"github.com/jackc/pgx/v5"

	"schmegettes/golib/auth"
	"schmegettes/golib/db"
)

// Store is the data access the handlers need.
type Store interface {
	CanHost(ctx context.Context, c auth.Claims) (bool, error)
	// Redeem spends a code for the caller. True when the caller can host afterwards.
	Redeem(ctx context.Context, c auth.Claims, code string) (bool, error)
}

// PGStore is the Postgres Store.
type PGStore struct {
	DB *db.DB
}

func (s PGStore) CanHost(ctx context.Context, c auth.Claims) (bool, error) {
	var ok bool
	err := s.DB.AsUser(ctx, c, func(tx pgx.Tx) error {
		return tx.QueryRow(ctx, "select private.caller_is_host()").Scan(&ok)
	})
	return ok, err
}

func (s PGStore) Redeem(ctx context.Context, c auth.Claims, code string) (bool, error) {
	var ok bool
	err := s.DB.AsUser(ctx, c, func(tx pgx.Tx) error {
		return tx.QueryRow(ctx, "select private.redeem_host_code($1)", code).Scan(&ok)
	})
	return ok, err
}
