package room

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"schmegettes/game/internal/contracts"
	"schmegettes/golib/db"
)

// PGStore runs a room's database work as game_engine, through the lobby functions in
// supabase/migrations/*_lobby.sql.
type PGStore struct {
	DB *db.DB
}

var _ Store = PGStore{}

// Load reads the room and its members in join order.
func (s PGStore) Load(ctx context.Context, roomID string) (Lobby, error) {
	var l Lobby
	err := s.DB.AsEngine(ctx, func(tx pgx.Tx) error {
		var status string
		err := tx.QueryRow(ctx,
			"select status::text, host_id::text, host_plays, max_players from public.rooms where id = $1", roomID,
		).Scan(&status, &l.HostID, &l.HostPlays, &l.MaxPlayers)
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNotFound
		}
		if err != nil {
			return err
		}
		l.Status = contracts.RoomStatus(status)
		rows, err := tx.Query(ctx, `
			select m.user_id::text, coalesce(m.display_name, p.display_name), m.role::text
			from public.room_members m
			join public.profiles p on p.user_id = m.user_id
			where m.room_id = $1
			order by m.joined_at, m.user_id`, roomID)
		if err != nil {
			return err
		}
		l.Members, err = pgx.CollectRows(rows, func(row pgx.CollectableRow) (Member, error) {
			var m Member
			var role string
			err := row.Scan(&m.UserID, &m.Name, &role)
			m.Role = contracts.PlayerRole(role)
			return m, err
		})
		return err
	})
	return l, err
}

// SetName renames a member (suffixing a taken name).
func (s PGStore) SetName(ctx context.Context, roomID, userID, name string) error {
	return s.exec(ctx, "select public.set_member_name($1, $2, $3)", roomID, userID, name)
}

// SetHostPlays puts the host in or out of the game.
func (s PGStore) SetHostPlays(ctx context.Context, roomID string, plays bool) error {
	return s.exec(ctx, "select public.set_host_plays($1, $2)", roomID, plays)
}

// Leave removes a non-host member.
func (s PGStore) Leave(ctx context.Context, roomID, userID string) error {
	return s.exec(ctx, "select public.leave_room($1, $2)", roomID, userID)
}

// StartGame records the game and builds its board.
func (s PGStore) StartGame(ctx context.Context, roomID string) (string, error) {
	var gameID string
	err := s.DB.AsEngine(ctx, func(tx pgx.Tx) error {
		return mapError(tx.QueryRow(ctx, "select public.start_game($1)::text", roomID).Scan(&gameID))
	})
	return gameID, err
}

// Close closes a room that is still in the lobby.
func (s PGStore) Close(ctx context.Context, roomID string) error {
	return s.exec(ctx, "update public.rooms set status = 'closed' where id = $1 and status = 'open'", roomID)
}

func (s PGStore) exec(ctx context.Context, sql string, args ...any) error {
	return s.DB.AsEngine(ctx, func(tx pgx.Tx) error {
		_, err := tx.Exec(ctx, sql, args...)
		return mapError(err)
	})
}

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
		return ErrNotOpen
	case "22023", "23514":
		return ErrInvalidName
	}
	return err
}
