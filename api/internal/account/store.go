// Package account serves the caller's account: their profile and name, moving a guest into
// an account at sign-in (merge tickets), and deleting an account. All data access runs as the
// caller (db.AsUser); the rules live in the private.* functions
// (supabase/migrations/*_accounts.sql). Product rules: docs/product-docs/features/accounts/.
package account

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
	// ErrForbidden: a guest asked for something only an account can do, or the reverse.
	ErrForbidden = errors.New("not allowed for this caller")
	// ErrInvalid: a wrong, used, expired, or own merge ticket, or a bad name.
	ErrInvalid = errors.New("invalid")
	// ErrInGame: the caller (or the guest being merged) is in a game in progress.
	ErrInGame = errors.New("in a game in progress")
)

// Profile is the caller's profile row. Both names are empty when there is no row yet.
type Profile struct {
	DisplayName       string
	AccountName       *string
	ShowOnLeaderboard bool
	// IsAdmin: the caller is on the admin list (private.caller_is_admin), for the web app's Admin row.
	IsAdmin bool
}

// MergeResult is what moving a guest into an account changed.
type MergeResult struct {
	GamesAdded      int
	HostAccessAdded bool
	AccountWasNew   bool
}

// Store is the data access the handlers need.
type Store interface {
	Profile(ctx context.Context, c auth.Claims) (Profile, error)
	Update(ctx context.Context, c auth.Claims, name *string, showOnLeaderboard *bool) (Profile, error)
	CreateTicket(ctx context.Context, c auth.Claims) (string, time.Time, error)
	Merge(ctx context.Context, c auth.Claims, ticket string) (MergeResult, error)
	Delete(ctx context.Context, c auth.Claims) error
}

// PGStore is the Postgres Store.
type PGStore struct {
	DB *db.DB
}

func (s PGStore) Profile(ctx context.Context, c auth.Claims) (Profile, error) {
	var p Profile
	err := s.DB.AsUser(ctx, c, func(tx pgx.Tx) error {
		return readProfile(ctx, tx, &p)
	})
	return p, err
}

func readProfile(ctx context.Context, tx pgx.Tx, p *Profile) error {
	if err := tx.QueryRow(ctx, "select private.caller_is_admin()").Scan(&p.IsAdmin); err != nil {
		return err
	}
	err := tx.QueryRow(ctx,
		"select display_name, account_name, show_on_leaderboard from public.profiles where user_id = (select auth.uid())",
	).Scan(&p.DisplayName, &p.AccountName, &p.ShowOnLeaderboard)
	if errors.Is(err, pgx.ErrNoRows) {
		p.ShowOnLeaderboard = true
		return nil
	}
	return err
}

func (s PGStore) Update(ctx context.Context, c auth.Claims, name *string, showOnLeaderboard *bool) (Profile, error) {
	var p Profile
	err := s.DB.AsUser(ctx, c, func(tx pgx.Tx) error {
		if name != nil {
			if _, err := tx.Exec(ctx, "select private.set_account_name($1)", *name); err != nil {
				return err
			}
		}
		if showOnLeaderboard != nil {
			var guest bool
			if err := tx.QueryRow(ctx, "select private.caller_is_guest()").Scan(&guest); err != nil {
				return err
			}
			if guest {
				return ErrForbidden
			}
			if _, err := tx.Exec(ctx,
				"update public.profiles set show_on_leaderboard = $1 where user_id = (select auth.uid())", *showOnLeaderboard,
			); err != nil {
				return err
			}
		}
		return readProfile(ctx, tx, &p)
	})
	return p, mapError(err)
}

func (s PGStore) CreateTicket(ctx context.Context, c auth.Claims) (string, time.Time, error) {
	var ticket string
	var expires time.Time
	err := s.DB.AsUser(ctx, c, func(tx pgx.Tx) error {
		return tx.QueryRow(ctx, "select ticket, expires_at from private.create_merge_ticket()").Scan(&ticket, &expires)
	})
	return ticket, expires, mapError(err)
}

func (s PGStore) Merge(ctx context.Context, c auth.Claims, ticket string) (MergeResult, error) {
	var m MergeResult
	err := s.DB.AsUser(ctx, c, func(tx pgx.Tx) error {
		return tx.QueryRow(ctx,
			"select games_added, host_access_added, account_was_new from private.merge_guest($1)", ticket,
		).Scan(&m.GamesAdded, &m.HostAccessAdded, &m.AccountWasNew)
	})
	return m, mapError(err)
}

func (s PGStore) Delete(ctx context.Context, c auth.Claims) error {
	err := s.DB.AsUser(ctx, c, func(tx pgx.Tx) error {
		_, err := tx.Exec(ctx, "select private.delete_account()")
		return err
	})
	return mapError(err)
}

// mapError turns the account functions' SQLSTATEs into Store errors.
func mapError(err error) error {
	var pg *pgconn.PgError
	if !errors.As(err, &pg) {
		return err
	}
	switch pg.Code {
	case "42501":
		return ErrForbidden
	case "22023", "23514":
		return ErrInvalid
	case "55006":
		return ErrInGame
	}
	return err
}
