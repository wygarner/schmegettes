// Package notices serves player-visible notices and the concealed admin notice surface.
// Every database call runs as the verified caller; security-definer functions own access.
package notices

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
	ErrNotFound    = errors.New("not found")
	ErrInvalid     = errors.New("invalid notice")
	ErrNotIncident = errors.New("not an incident")
)

type Notice struct {
	ID, Kind, Phase, Title, Body   string
	Revision, History              int
	Link, Resolution               *string
	StartsAt, EndsAt, ResolvedAt   *time.Time
	StatusPageRef, StatusPageError *string
	StatusPageSync, CreatedBy      string
	CreatedAt, UpdatedAt           time.Time
}

type Input struct {
	Kind, Title, Body string
	Link              *string
	StartsAt, EndsAt  *time.Time
}

type Store interface {
	Active(context.Context, auth.Claims) ([]Notice, time.Time, error)
	AdminList(context.Context, auth.Claims, int) ([]Notice, error)
	Post(context.Context, auth.Claims, Input) (Notice, error)
	Edit(context.Context, auth.Claims, string, []byte) (Notice, error)
	Resolve(context.Context, auth.Claims, string, string) (Notice, error)
	SetSync(context.Context, auth.Claims, string, string, string, *string) (Notice, error)
}

type PGStore struct{ DB *db.DB }

func scanNotice(row pgx.Row) (Notice, error) {
	var n Notice
	err := row.Scan(&n.ID, &n.Revision, &n.Kind, &n.Phase, &n.Title, &n.Body, &n.Link,
		&n.StartsAt, &n.EndsAt, &n.ResolvedAt, &n.Resolution)
	return n, mapError(err)
}

func scanAdmin(row pgx.Row) (Notice, error) {
	var n Notice
	err := row.Scan(&n.ID, &n.Revision, &n.Kind, &n.Phase, &n.Title, &n.Body, &n.Link,
		&n.StartsAt, &n.EndsAt, &n.ResolvedAt, &n.Resolution, &n.StatusPageRef,
		&n.StatusPageSync, &n.StatusPageError, &n.CreatedBy, &n.History, &n.CreatedAt, &n.UpdatedAt)
	return n, mapError(err)
}

func (s PGStore) Active(ctx context.Context, claims auth.Claims) ([]Notice, time.Time, error) {
	result := []Notice{}
	serverTime := time.Now().UTC()
	err := s.DB.AsUser(ctx, claims, func(tx pgx.Tx) error {
		if err := tx.QueryRow(ctx, "select now()").Scan(&serverTime); err != nil {
			return err
		}
		rows, err := tx.Query(ctx, "select * from private.active_notices($1)", serverTime)
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			n, err := scanNotice(rows)
			if err != nil {
				return err
			}
			result = append(result, n)
		}
		return rows.Err()
	})
	return result, serverTime, mapError(err)
}

func adminList(ctx context.Context, tx pgx.Tx, days int) ([]Notice, error) {
	result := []Notice{}
	rows, err := tx.Query(ctx, "select * from private.admin_notices($1)", days)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		n, err := scanAdmin(rows)
		if err != nil {
			return nil, err
		}
		result = append(result, n)
	}
	return result, rows.Err()
}

func (s PGStore) AdminList(ctx context.Context, claims auth.Claims, days int) ([]Notice, error) {
	result := []Notice{}
	err := s.DB.AsUser(ctx, claims, func(tx pgx.Tx) error {
		var err error
		result, err = adminList(ctx, tx, days)
		return err
	})
	return result, mapError(err)
}

func findAdmin(ctx context.Context, tx pgx.Tx, id string) (Notice, error) {
	return scanAdmin(tx.QueryRow(ctx, "select * from private.notice_admin_row($1::uuid)", id))
}

func (s PGStore) Post(ctx context.Context, claims auth.Claims, in Input) (Notice, error) {
	var result Notice
	err := s.DB.AsUser(ctx, claims, func(tx pgx.Tx) error {
		var id string
		if err := tx.QueryRow(ctx, "select id from private.admin_post_notice($1,$2,$3,$4,$5,$6)",
			in.Kind, in.Title, in.Body, in.Link, in.StartsAt, in.EndsAt).Scan(&id); err != nil {
			return err
		}
		var err error
		result, err = findAdmin(ctx, tx, id)
		return err
	})
	return result, mapError(err)
}

func (s PGStore) Edit(ctx context.Context, claims auth.Claims, id string, patch []byte) (Notice, error) {
	var result Notice
	err := s.DB.AsUser(ctx, claims, func(tx pgx.Tx) error {
		if err := tx.QueryRow(ctx, "select id from private.admin_edit_notice($1::uuid,$2::jsonb)", id, patch).Scan(&id); err != nil {
			return err
		}
		var err error
		result, err = findAdmin(ctx, tx, id)
		return err
	})
	return result, mapError(err)
}

func (s PGStore) Resolve(ctx context.Context, claims auth.Claims, id, resolution string) (Notice, error) {
	var result Notice
	err := s.DB.AsUser(ctx, claims, func(tx pgx.Tx) error {
		if err := tx.QueryRow(ctx, "select id from private.admin_resolve_notice($1::uuid,$2)", id, resolution).Scan(&id); err != nil {
			return err
		}
		var err error
		result, err = findAdmin(ctx, tx, id)
		return err
	})
	return result, mapError(err)
}

func (s PGStore) SetSync(ctx context.Context, claims auth.Claims, id, ref, status string, syncError *string) (Notice, error) {
	var result Notice
	err := s.DB.AsUser(ctx, claims, func(tx pgx.Tx) error {
		if err := tx.QueryRow(ctx, "select id from private.admin_set_notice_sync($1::uuid,$2,$3,$4)",
			id, ref, status, syncError).Scan(&id); err != nil {
			return err
		}
		var err error
		result, err = findAdmin(ctx, tx, id)
		return err
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
	case "42501", "P0002":
		return ErrNotFound
	case "SCH03":
		return ErrNotIncident
	case "22023", "23514", "22P02":
		return ErrInvalid
	default:
		return err
	}
}
