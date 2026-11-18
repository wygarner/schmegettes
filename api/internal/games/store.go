// Package games serves a player's game history: their past games and a game's scoreboard.
// All data access runs as the caller (db.AsUser), so row-level security decides what they
// may see: games they played or watched (is_game_member). Rules:
// docs/product-docs/features/game-history/.
package games

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"

	"schmegettes/golib/auth"
	"schmegettes/golib/db"
)

// ErrNotFound is a game the caller can't see (not a member, or no such game).
var ErrNotFound = errors.New("game not found")

// PageSize is how many games one page of the list holds.
const PageSize = 20

// After is where a page starts: just after this game in the list's order.
type After struct {
	FinishedAt time.Time
	GameID     string
}

// Kind narrows the list: every game, only games played as a contestant, or only games watched.
type Kind string

const (
	All     Kind = ""
	Played  Kind = "played"
	Watched Kind = "watched"
)

// Stats sum up all the caller's ended games, whatever the kind.
type Stats struct {
	Games  int
	Played int
	// Wins counts finished games placed 1st in (ties included); abandoned games don't count.
	Wins int
	// Best is the highest score in a played game; nil if they never played.
	Best *int
}

// Summary is one past game, from the caller's point of view.
type Summary struct {
	GameID     string
	Status     string
	StartedAt  time.Time
	FinishedAt time.Time
	Score      int
	Placement  *int
	// Watched: the caller hosted without playing, or was a spectator.
	Watched    bool
	CallerName *string
	// Players are the contestants' names in that game, in placement order.
	Players []string
}

// Result is one contestant on a game's scoreboard.
type Result struct {
	Name      string
	Score     int
	Placement int
	IsCaller  bool
}

// Detail is a game's scoreboard.
type Detail struct {
	GameID     string
	Status     string
	StartedAt  time.Time
	FinishedAt *time.Time
	HostName   *string
	Watched    bool
	Results    []Result
}

// Store is the data access the handlers need.
type Store interface {
	// List returns up to limit of the caller's ended games of that kind, newest first, after the cursor.
	List(ctx context.Context, c auth.Claims, kind Kind, after *After, limit int) ([]Summary, error)
	Stats(ctx context.Context, c auth.Claims) (Stats, error)
	Detail(ctx context.Context, c auth.Claims, gameID string) (Detail, error)
}

// PGStore is the Postgres Store.
type PGStore struct {
	DB *db.DB
}

// List reads the caller's finished and abandoned games, played, watched, or both.
func (s PGStore) List(ctx context.Context, c auth.Claims, kind Kind, after *After, limit int) ([]Summary, error) {
	var out []Summary
	err := s.DB.AsUser(ctx, c, func(tx pgx.Tx) error {
		var afterAt *time.Time
		var afterID *string
		if after != nil {
			afterAt, afterID = &after.FinishedAt, &after.GameID
		}
		rows, err := tx.Query(ctx, `
			select g.id::text, g.status::text, g.started_at, g.finished_at,
			       coalesce(r.score, 0), r.placement, me.role <> 'contestant',
			       case when me.role = 'contestant' then r.display_name end
			from public.game_players me
			join public.games g on g.id = me.game_id
			left join public.game_results r on r.game_player_id = me.id
			where me.user_id = $1::uuid
			  and g.status in ('finished', 'abandoned')
			  and ($2::timestamptz is null or (g.finished_at, g.id) < ($2, $3::uuid))
			  and ($5 = '' or ($5 = 'played') = (me.role = 'contestant'))
			order by g.finished_at desc, g.id desc
			limit $4`, c.UserID, afterAt, afterID, limit, string(kind))
		if err != nil {
			return err
		}
		out, err = pgx.CollectRows(rows, func(row pgx.CollectableRow) (Summary, error) {
			var g Summary
			err := row.Scan(&g.GameID, &g.Status, &g.StartedAt, &g.FinishedAt, &g.Score, &g.Placement, &g.Watched, &g.CallerName)
			return g, err
		})
		if err != nil || len(out) == 0 {
			return err
		}

		ids := make([]string, len(out))
		at := map[string]int{}
		for i, g := range out {
			ids[i], at[g.GameID] = g.GameID, i
			out[i].Players = []string{}
		}
		names, err := tx.Query(ctx, `
			select game_id::text, display_name
			from public.game_results
			where game_id = any($1::uuid[]) and role = 'contestant'
			order by game_id, placement, display_name`, ids)
		if err != nil {
			return err
		}
		defer names.Close()
		for names.Next() {
			var id, name string
			if err := names.Scan(&id, &name); err != nil {
				return err
			}
			out[at[id]].Players = append(out[at[id]].Players, name)
		}
		return names.Err()
	})
	return out, err
}

// Stats counts the caller's ended games, played games and wins, and finds their best score.
func (s PGStore) Stats(ctx context.Context, c auth.Claims) (Stats, error) {
	var st Stats
	err := s.DB.AsUser(ctx, c, func(tx pgx.Tx) error {
		return tx.QueryRow(ctx, `
			select count(*)::int,
			       (count(*) filter (where me.role = 'contestant'))::int,
			       (count(*) filter (where me.role = 'contestant' and g.status = 'finished' and r.placement = 1))::int,
			       max(r.score) filter (where me.role = 'contestant')
			from public.game_players me
			join public.games g on g.id = me.game_id
			left join public.game_results r on r.game_player_id = me.id
			where me.user_id = $1::uuid
			  and g.status in ('finished', 'abandoned')`, c.UserID).
			Scan(&st.Games, &st.Played, &st.Wins, &st.Best)
	})
	return st, err
}

// Detail reads one game's scoreboard: contestants by placement, and who hosted.
func (s PGStore) Detail(ctx context.Context, c auth.Claims, gameID string) (Detail, error) {
	var d Detail
	err := s.DB.AsUser(ctx, c, func(tx pgx.Tx) error {
		err := tx.QueryRow(ctx, `
			select g.id::text, g.status::text, g.started_at, g.finished_at,
			       coalesce(me.role <> 'contestant', true), h.display_name
			from public.games g
			left join public.game_players me on me.game_id = g.id and me.user_id = $2::uuid
			left join public.game_results h on h.game_id = g.id and h.user_id = g.host_user_id
			where g.id = $1::uuid`, gameID, c.UserID).
			Scan(&d.GameID, &d.Status, &d.StartedAt, &d.FinishedAt, &d.Watched, &d.HostName)
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNotFound
		}
		if err != nil {
			return err
		}
		rows, err := tx.Query(ctx, `
			select display_name, score, placement, coalesce(user_id = $2::uuid, false)
			from public.game_results
			where game_id = $1::uuid and role = 'contestant'
			order by placement, display_name`, gameID, c.UserID)
		if err != nil {
			return err
		}
		d.Results, err = pgx.CollectRows(rows, func(row pgx.CollectableRow) (Result, error) {
			var r Result
			err := row.Scan(&r.Name, &r.Score, &r.Placement, &r.IsCaller)
			return r, err
		})
		return err
	})
	return d, err
}
