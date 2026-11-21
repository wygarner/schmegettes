// Package stats serves all-time player stats and the leaderboard. Every query runs as the
// caller; the security-definer SQL functions own aggregation and leaderboard privacy.
package stats

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"schmegettes/api/internal/contracts"
	"schmegettes/golib/auth"
	"schmegettes/golib/db"
)

var (
	ErrNotSignedIn   = errors.New("not signed in")
	ErrNoCountedGame = errors.New("no counted games")
)

type Store interface {
	MyStats(ctx context.Context, c auth.Claims) (contracts.MyStats, error)
	Leaderboard(ctx context.Context, c auth.Claims) (json.RawMessage, error)
}

type PGStore struct{ DB *db.DB }

func (s PGStore) MyStats(ctx context.Context, c auth.Claims) (contracts.MyStats, error) {
	var out contracts.MyStats
	var career *int64
	var correct, dailyDoubles, final, leaderboard []byte
	err := s.DB.AsUser(ctx, c, func(tx pgx.Tx) error {
		return tx.QueryRow(ctx, `select games, wins, win_rate, average_score, best_score,
            best_game_id, career_total, correct, daily_doubles, final, leaderboard
          from private.my_stats()`).Scan(
			&out.Games, &out.Wins, &out.WinRate, &out.AverageScore, &out.BestScore,
			&out.BestGameId, &career, &correct, &dailyDoubles, &final, &leaderboard,
		)
	})
	if err != nil {
		return out, mapError(err)
	}
	if career != nil {
		v := int(*career)
		out.CareerTotal = &v
	}
	if err := json.Unmarshal(correct, &out.Correct); err != nil {
		return out, err
	}
	if err := json.Unmarshal(dailyDoubles, &out.DailyDoubles); err != nil {
		return out, err
	}
	if err := json.Unmarshal(final, &out.Final); err != nil {
		return out, err
	}
	if err := json.Unmarshal(leaderboard, &out.Leaderboard); err != nil {
		return out, err
	}
	return out, nil
}

func (s PGStore) Leaderboard(ctx context.Context, c auth.Claims) (json.RawMessage, error) {
	var out json.RawMessage
	err := s.DB.AsUser(ctx, c, func(tx pgx.Tx) error {
		return tx.QueryRow(ctx, "select private.leaderboard()").Scan(&out)
	})
	return out, mapError(err)
}

func mapError(err error) error {
	var pg *pgconn.PgError
	if !errors.As(err, &pg) {
		return err
	}
	if pg.Code == "42501" && pg.Message == "not signed in" {
		return ErrNotSignedIn
	}
	if pg.Code == "P0001" && pg.Message == "no counted games" {
		return ErrNoCountedGame
	}
	return err
}
