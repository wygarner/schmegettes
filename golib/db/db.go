// Package db is the only way Go services reach Postgres. AsUser runs as the caller so row-level
// security applies; AsEngine runs as game_engine for game/'s recording functions. Both open one
// transaction. See "Access patterns" in docs/system-docs/engineering/stack.md.
package db

import (
	"context"
	"fmt"
	"log/slog"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"schmegettes/golib/auth"
)

// DB is a connection pool for the app_service role.
type DB struct {
	pool *pgxpool.Pool
}

// Open connects to url (the app_service role) and checks the connection.
func Open(ctx context.Context, url string) (*DB, error) {
	config, err := pgxpool.ParseConfig(url)
	if err != nil {
		return nil, fmt.Errorf("parse url: %w", err)
	}
	config.ConnConfig.OnNotice = func(_ *pgconn.PgConn, n *pgconn.Notice) { logNotice(n) }
	pool, err := pgxpool.NewWithConfig(ctx, config)
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
		if _, err := tx.Exec(ctx, "select set_config('request.jwt.claims', $1, true), set_config('request.id', $2, true)",
			string(claims.Raw), RequestID(ctx)); err != nil {
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
		if id := RequestID(ctx); id != "" {
			if _, err := tx.Exec(ctx, "select set_config('request.id', $1, true)", id); err != nil {
				return fmt.Errorf("set request id: %w", err)
			}
		}
		return fn(tx)
	})
}

type requestIDKey struct{}

// WithRequestID attaches a request id that AsUser and AsEngine record as request.id for the
// transaction, so audit rows (private.audit_log) carry it.
func WithRequestID(ctx context.Context, id string) context.Context {
	return context.WithValue(ctx, requestIDKey{}, id)
}

// RequestID returns the id set by WithRequestID, or "".
func RequestID(ctx context.Context) string {
	id, _ := ctx.Value(requestIDKey{}).(string)
	return id
}

// auditFailurePrefix starts the WARNING private.audit raises when it cannot write a row:
// "audit write failed: action=<action> sqlstate=<code> request_id=<id or ->".
const auditFailurePrefix = "audit write failed:"

// logNotice turns a failed audit write into an ERROR log line, which the observability alert
// watches. Other notices are diagnostics.
func logNotice(n *pgconn.Notice) {
	if n.Severity != "WARNING" || !strings.HasPrefix(n.Message, auditFailurePrefix) {
		// The message can carry data from the statement, so only its kind is logged.
		slog.Debug("database notice", "severity", n.Severity, "code", n.Code)
		return
	}
	fields := map[string]string{}
	for _, part := range strings.Fields(strings.TrimPrefix(n.Message, auditFailurePrefix)) {
		if k, v, ok := strings.Cut(part, "="); ok {
			fields[k] = v
		}
	}
	requestID := fields["request_id"]
	if requestID == "-" {
		requestID = ""
	}
	slog.Error("audit write failed", "action", fields["action"], "sqlstate", fields["sqlstate"], "request_id", requestID)
}
