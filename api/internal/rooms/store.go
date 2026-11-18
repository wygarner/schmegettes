// Package rooms serves creating, joining, and finding rooms. All data access runs as the
// caller (db.AsUser); the rules live in the database functions create_room and join_room
// (supabase/migrations/*_lobby.sql).
package rooms

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"schmegettes/golib/auth"
	"schmegettes/golib/db"
)

// Errors the handlers map to problem responses.
var (
	ErrNotFound    = errors.New("room not found")
	ErrRoomFull    = errors.New("room full")
	ErrGameStarted = errors.New("game started")
	ErrInvalidName = errors.New("invalid name")
	ErrNotAHost    = errors.New("not a host") // the caller has no host access (private access)
)

// Room is a room as its members see it.
type Room struct {
	ID              string
	Code            string
	Status          string
	HostUserID      string
	HostDisplayName string
	HostPlays       bool
	MaxPlayers      int
	Seasons         []int // nil means every season
}

// Store is the data access the handlers need.
type Store interface {
	Create(ctx context.Context, c auth.Claims, hostName string) (Room, error)
	Join(ctx context.Context, c auth.Claims, code, name, role string) (Room, error)
	ByCode(ctx context.Context, c auth.Claims, code string) (Room, error)
}

// PGStore is the Postgres Store.
type PGStore struct {
	DB *db.DB
}

const selectRoom = `
select r.id::text, r.code, r.status::text, r.host_id::text,
       coalesce(m.display_name, p.display_name), r.host_plays, r.max_players, r.seasons
from public.rooms r
join public.room_members m on m.room_id = r.id and m.user_id = r.host_id
join public.profiles p on p.user_id = r.host_id
`

func scanRoom(row pgx.Row) (Room, error) {
	var r Room
	err := row.Scan(&r.ID, &r.Code, &r.Status, &r.HostUserID, &r.HostDisplayName, &r.HostPlays, &r.MaxPlayers, &r.Seasons)
	if errors.Is(err, pgx.ErrNoRows) {
		return Room{}, ErrNotFound
	}
	return r, err
}

// Create makes a room with the caller as host.
func (s PGStore) Create(ctx context.Context, c auth.Claims, hostName string) (Room, error) {
	var room Room
	err := s.DB.AsUser(ctx, c, func(tx pgx.Tx) error {
		var id string
		if err := tx.QueryRow(ctx, "select public.create_room($1)::text", hostName).Scan(&id); err != nil {
			return mapError(err)
		}
		var err error
		room, err = scanRoom(tx.QueryRow(ctx, selectRoom+"where r.id = $1", id))
		return err
	})
	return room, err
}

// Join adds the caller to the room with this code, or returns it if they're already in.
func (s PGStore) Join(ctx context.Context, c auth.Claims, code, name, role string) (Room, error) {
	var room Room
	err := s.DB.AsUser(ctx, c, func(tx pgx.Tx) error {
		var id string
		err := tx.QueryRow(ctx, "select public.join_room($1, $2, $3::public.player_role)::text", code, name, role).Scan(&id)
		if err != nil {
			return mapError(err)
		}
		room, err = scanRoom(tx.QueryRow(ctx, selectRoom+"where r.id = $1", id))
		return err
	})
	return room, err
}

// ByCode finds a room the caller already belongs to. Others get ErrNotFound (RLS hides them).
func (s PGStore) ByCode(ctx context.Context, c auth.Claims, code string) (Room, error) {
	var room Room
	err := s.DB.AsUser(ctx, c, func(tx pgx.Tx) error {
		var err error
		room, err = scanRoom(tx.QueryRow(ctx, selectRoom+"where r.code = upper($1) and r.status <> 'closed'", code))
		return err
	})
	return room, err
}

// mapError turns the database functions' SQLSTATEs into Store errors.
func mapError(err error) error {
	var pg *pgconn.PgError
	if !errors.As(err, &pg) {
		return err
	}
	switch pg.Code {
	case "P0002":
		return ErrNotFound
	case "23P01":
		return ErrRoomFull
	case "55000":
		return ErrGameStarted
	case "22023", "23514":
		return ErrInvalidName
	case "42501":
		return ErrNotAHost
	}
	return err
}
