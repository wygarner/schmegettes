// Package admin serves the allowlisted, local-devtools administration surface. Every query
// runs through db.AsUser; private security-definer functions enforce the allowlist.
package admin

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"schmegettes/golib/auth"
	"schmegettes/golib/db"
)

var (
	ErrNotFound = errors.New("not found")
	ErrInvalid  = errors.New("invalid")
)

type HostCode struct {
	Code               string
	CurrentStartedAt   time.Time
	RotatesAt          time.Time
	PreviousValidUntil *time.Time
	ServerTime         time.Time
}

type Host struct {
	UserID       string
	Kind         string
	Email        *string
	LastPlayedAs *string
	HostSince    time.Time
	Note         *string
}

// CleanupRun is one guest-cleanup run (private.cleanup_runs): counts only.
type CleanupRun struct {
	RunAt      time.Time
	Deleted    int
	DurationMs int
	Error      *string
}

type Store interface {
	CurrentCode(context.Context, auth.Claims) (HostCode, error)
	Rotate(context.Context, auth.Claims, string) (HostCode, error)
	Hosts(context.Context, auth.Claims) ([]Host, error)
	SetNote(context.Context, auth.Claims, string, *string) (Host, error)
	Remove(context.Context, auth.Claims, string) error
	CleanupRuns(context.Context, auth.Claims) ([]CleanupRun, error)
}

type PGStore struct{ DB *db.DB }

func scanCode(row pgx.Row) (HostCode, error) {
	var c HostCode
	err := row.Scan(&c.Code, &c.CurrentStartedAt, &c.RotatesAt, &c.PreviousValidUntil, &c.ServerTime)
	return c, mapError(err)
}

func (s PGStore) CurrentCode(ctx context.Context, claims auth.Claims) (HostCode, error) {
	var result HostCode
	err := s.DB.AsUser(ctx, claims, func(tx pgx.Tx) error {
		var err error
		result, err = scanCode(tx.QueryRow(ctx, "select * from private.admin_current_host_code()"))
		return err
	})
	return result, mapError(err)
}

func (s PGStore) Rotate(ctx context.Context, claims auth.Claims, expected string) (HostCode, error) {
	var result HostCode
	err := s.DB.AsUser(ctx, claims, func(tx pgx.Tx) error {
		var err error
		result, err = scanCode(tx.QueryRow(ctx, "select * from private.admin_rotate_host_code($1)", expected))
		return err
	})
	return result, mapError(err)
}

func scanHost(row pgx.Row) (Host, error) {
	var h Host
	err := row.Scan(&h.UserID, &h.Kind, &h.Email, &h.LastPlayedAs, &h.HostSince, &h.Note)
	if errors.Is(err, pgx.ErrNoRows) {
		return Host{}, ErrNotFound
	}
	return h, mapError(err)
}

func (s PGStore) Hosts(ctx context.Context, claims auth.Claims) ([]Host, error) {
	var result []Host
	err := s.DB.AsUser(ctx, claims, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx, "select * from private.admin_hosts()")
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			h, err := scanHost(rows)
			if err != nil {
				return err
			}
			result = append(result, h)
		}
		return rows.Err()
	})
	if result == nil {
		result = []Host{}
	}
	return result, mapError(err)
}

func (s PGStore) SetNote(ctx context.Context, claims auth.Claims, userID string, note *string) (Host, error) {
	var result Host
	err := s.DB.AsUser(ctx, claims, func(tx pgx.Tx) error {
		var err error
		result, err = scanHost(tx.QueryRow(ctx,
			"select * from private.admin_set_host_note($1::uuid, $2)", userID, note))
		return err
	})
	return result, mapError(err)
}

func (s PGStore) Remove(ctx context.Context, claims auth.Claims, userID string) error {
	err := s.DB.AsUser(ctx, claims, func(tx pgx.Tx) error {
		_, err := tx.Exec(ctx, "select private.admin_remove_host($1::uuid)", userID)
		return err
	})
	return mapError(err)
}

func (s PGStore) CleanupRuns(ctx context.Context, claims auth.Claims) ([]CleanupRun, error) {
	result := []CleanupRun{}
	err := s.DB.AsUser(ctx, claims, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx, "select run_at, deleted, duration_ms, error from private.admin_cleanup_runs()")
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			var c CleanupRun
			if err := rows.Scan(&c.RunAt, &c.Deleted, &c.DurationMs, &c.Error); err != nil {
				return err
			}
			result = append(result, c)
		}
		return rows.Err()
	})
	return result, mapError(err)
}

func mapError(err error) error {
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	}
	var pg *pgconn.PgError
	if !errors.As(err, &pg) {
		return err
	}
	switch pg.Code {
	case "42501":
		return ErrNotFound
	case "22023", "23514", "22P02":
		return ErrInvalid
	}
	return err
}
