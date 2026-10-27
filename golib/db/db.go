// Package db is the only way Go services reach Postgres. AsUser runs as the caller so row-level
// security applies; AsEngine runs as game_engine for game/'s recording functions. Both open one
// transaction. See "Access patterns" in docs/system-docs/engineering/stack.md.
package db

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"schmegettes/golib/auth"
)

// DB is a connection pool for the app_service role.
type DB struct {
	pool *pgxpool.Pool
}

// Open connects to url (the app_service role) and checks the connection.
func Open(ctx context.Context, url string) (*DB, error) {
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		return nil, fmt.Errorf("open pool: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("ping: %w", err)
	}
	return &DB{pool: pool}, nil
}

// Ping checks the connection (for /healthz).
func (d *DB) Ping(ctx context.Context) error { return d.pool.Ping(ctx) }

// Close releases every connection.
func (d *DB) Close() { d.pool.Close() }

// AsUser runs fn in a transaction as the authenticated user in claims.
func (d *DB) AsUser(ctx context.Context, claims auth.Claims, fn func(pgx.Tx) error) error {
	return pgx.BeginFunc(ctx, d.pool, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, "set local role authenticated"); err != nil {
			return fmt.Errorf("set role: %w", err)
		}
		if _, err := tx.Exec(ctx, "select set_config('request.jwt.claims', $1, true)", string(claims.Raw)); err != nil {
			return fmt.Errorf("set claims: %w", err)
		}
		return fn(tx)
	})
}

// AsEngine runs fn in a transaction as game_engine. Only game/ uses it.
func (d *DB) AsEngine(ctx context.Context, fn func(pgx.Tx) error) error {
	return pgx.BeginFunc(ctx, d.pool, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, "set local role game_engine"); err != nil {
			return fmt.Errorf("set role: %w", err)
		}
		return fn(tx)
	})
}
