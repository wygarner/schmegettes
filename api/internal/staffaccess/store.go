// Package staffaccess serves the admin's time-limited staff access and the audit log. Every
// query runs through db.AsUser; the private.staff_* and private.admin_audit functions check
// the admin allowlist, the grant, and audit each grant and read
// (docs/system-docs/operations/operator-scripts.md).
package staffaccess

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"schmegettes/golib/auth"
	"schmegettes/golib/db"
)

var (
	ErrNotFound = errors.New("not found") // not an admin: concealed as a missing page
	ErrInvalid  = errors.New("invalid")   // bad subject, reason, duration, or filter
	ErrInactive = errors.New("inactive")  // the grant is unknown, someone else's, expired, or revoked
)

// Subject is what a grant gives access to.
type Subject struct {
	Type string // user, room, or game
	ID   string
}

type Grant struct {
	ID        string
	Subject   Subject
	ExpiresAt time.Time
}

type AuditEntry struct {
	ID          int64
	At          time.Time
	Actor       *string
	Action      string
	SubjectType *string
	SubjectID   *string
	RequestID   *string
	Details     map[string]any
}

// AuditFilter narrows the audit log; nil fields don't filter.
type AuditFilter struct {
	Since   *time.Time
	Action  *string
	Subject *string
}

type Store interface {
	Grant(ctx context.Context, claims auth.Claims, subject Subject, reason string, minutes int) (Grant, error)
	// Read returns the subject as private.staff_read shapes it (StaffSubject in the contract).
	Read(ctx context.Context, claims auth.Claims, grantID string) (json.RawMessage, error)
	Revoke(ctx context.Context, claims auth.Claims, grantID string) (Subject, error)
	Audit(ctx context.Context, claims auth.Claims, filter AuditFilter) ([]AuditEntry, error)
}

type PGStore struct{ DB *db.DB }

func (s PGStore) Grant(ctx context.Context, claims auth.Claims, subject Subject, reason string, minutes int) (Grant, error) {
	var g Grant
	err := s.DB.AsUser(ctx, claims, func(tx pgx.Tx) error {
		return tx.QueryRow(ctx, "select grant_id::text, grant_subject_type, grant_subject_id::text, expires_at "+
			"from private.staff_grant($1, $2::uuid, $3, $4)", subject.Type, subject.ID, reason, minutes).
			Scan(&g.ID, &g.Subject.Type, &g.Subject.ID, &g.ExpiresAt)
	})
	return g, mapError(err)
}

func (s PGStore) Read(ctx context.Context, claims auth.Claims, grantID string) (json.RawMessage, error) {
	var body []byte
	err := s.DB.AsUser(ctx, claims, func(tx pgx.Tx) error {
		return tx.QueryRow(ctx, "select private.staff_read($1::uuid)::text", grantID).Scan(&body)
	})
	return body, mapError(err)
}

func (s PGStore) Revoke(ctx context.Context, claims auth.Claims, grantID string) (Subject, error) {
	var sub Subject
	err := s.DB.AsUser(ctx, claims, func(tx pgx.Tx) error {
		return tx.QueryRow(ctx, "select subject_type, subject_id::text from private.staff_revoke($1::uuid)", grantID).
			Scan(&sub.Type, &sub.ID)
	})
	return sub, mapError(err)
}

func (s PGStore) Audit(ctx context.Context, claims auth.Claims, f AuditFilter) ([]AuditEntry, error) {
	result := []AuditEntry{}
	err := s.DB.AsUser(ctx, claims, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx, "select id, at, actor::text, action, subject_type, subject_id::text, request_id, details "+
			"from private.admin_audit($1, $2, $3::uuid)", f.Since, f.Action, f.Subject)
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			var e AuditEntry
			if err := rows.Scan(&e.ID, &e.At, &e.Actor, &e.Action, &e.SubjectType, &e.SubjectID, &e.RequestID, &e.Details); err != nil {
				return err
			}
			result = append(result, e)
		}
		return rows.Err()
	})
	return result, mapError(err)
}

func mapError(err error) error {
	var pg *pgconn.PgError
	if !errors.As(err, &pg) {
		return err
	}
	switch pg.Code {
	case "42501":
		return ErrNotFound
	case "22023", "23514", "22P02":
		return ErrInvalid
	case "28000":
		return ErrInactive
	}
	return err
}
