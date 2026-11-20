package room

import (
	"context"
	"errors"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"schmegettes/game/internal/contracts"
	"schmegettes/game/internal/play"
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
		var resumeID *string
		if err := tx.QueryRow(ctx, "select resume_game_id::text from public.rooms where id = $1", roomID).Scan(&resumeID); err != nil {
			return err
		}
		if resumeID != nil {
			res := &Resume{GameID: *resumeID}
			if err := tx.QueryRow(ctx, "select started_at from public.games where id = $1", *resumeID).Scan(&res.StartedAt); err != nil {
				return err
			}
			rows, err := tx.Query(ctx, `
				select r.user_id::text, r.display_name, r.score
				from public.game_results r
				join public.game_players gp on gp.id = r.game_player_id
				where r.game_id = $1 and r.role = 'contestant' and r.user_id is not null
				order by gp.id`, *resumeID)
			if err != nil {
				return err
			}
			res.Players, err = pgx.CollectRows(rows, func(row pgx.CollectableRow) (ResumePlayer, error) {
				var p ResumePlayer
				return p, row.Scan(&p.UserID, &p.Name, &p.Score)
			})
			if err != nil {
				return err
			}
			l.Resume = res
		}
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

// StartResumed starts a resume lobby's game where it stopped.
func (s PGStore) StartResumed(ctx context.Context, roomID string) (string, error) {
	var id string
	err := s.DB.AsEngine(ctx, func(tx pgx.Tx) error {
		return tx.QueryRow(ctx, "select public.start_resumed_game($1)::text", roomID).Scan(&id)
	})
	return id, mapError(err)
}

// HostCanHost reports whether the room's host still has host access (private access).
func (s PGStore) HostCanHost(ctx context.Context, roomID string) (bool, error) {
	var ok bool
	err := s.DB.AsEngine(ctx, func(tx pgx.Tx) error {
		return mapError(tx.QueryRow(ctx,
			"select private.user_is_host(host_id) from public.rooms where id = $1", roomID).Scan(&ok))
	})
	return ok, err
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
	case "42501":
		return ErrNotAHost
	}
	return err
}

// LoadGame reads the room's game in progress: contestants in join order, both rounds of the
// board with clue text and responses, and the answers so far.
func (s PGStore) LoadGame(ctx context.Context, roomID string) (GameData, error) {
	var d GameData
	err := s.DB.AsEngine(ctx, func(tx pgx.Tx) error {
		var pace string
		var double bool
		err := tx.QueryRow(ctx, `
			select id::text, started_at, timers::text, double_round, quick_picks from public.games
			where room_id = $1 and status = 'in_progress'
			order by started_at desc limit 1`, roomID).Scan(&d.GameID, &d.StartedAt, &pace, &double, &d.QuickPicks)
		d.Pace, d.NoDouble = contracts.TimerPace(pace), !double
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNotFound
		}
		if err != nil {
			return err
		}

		rows, err := tx.Query(ctx, `
			select gp.user_id::text, coalesce(m.display_name, gp.display_name, 'Player')
			from public.game_players gp
			left join public.room_members m on m.room_id = $2 and m.user_id = gp.user_id
			where gp.game_id = $1 and gp.role = 'contestant' and gp.user_id is not null
			order by m.joined_at nulls last, gp.user_id`, d.GameID, roomID)
		if err != nil {
			return err
		}
		d.Players, err = pgx.CollectRows(rows, func(row pgx.CollectableRow) (play.Player, error) {
			var p play.Player
			return p, row.Scan(&p.UserID, &p.Name)
		})
		if err != nil {
			return err
		}

		rows, err = tx.Query(ctx, `
			select b.id::text, b.round::text, b.column_index, b.row_index, b.category, coalesce(b.value, 0),
			       c.clue_text, c.correct_response, b.state::text, b.is_daily_double
			from public.board_clues b
			join public.clues c on c.id = b.clue_id
			where b.game_id = $1`, d.GameID)
		if err != nil {
			return err
		}
		clues, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (play.Clue, error) {
			var c play.Clue
			var round, state string
			err := row.Scan(&c.ID, &round, &c.Col, &c.Row, &c.Category, &c.Value, &c.Text, &c.Response, &state, &c.DailyDouble)
			c.Round, c.State = contracts.Round(round), contracts.ClueState(state)
			return c, err
		})
		if err != nil {
			return err
		}
		for _, c := range clues {
			if c.Round == contracts.RoundFinal {
				c.DailyDouble = false
				d.Final = &c
				continue
			}
			if c.State == contracts.ClueStateActive {
				d.ActiveClueID = c.ID
			}
			d.Board = append(d.Board, c)
		}
		finalID := ""
		if d.Final != nil {
			finalID = d.Final.ID
		}

		// Wagers: the active Daily Double's, and Final's with any submitted answers.
		d.FinalWagers, d.FinalAnswers, d.FinalDeltas = map[string]int{}, map[string]string{}, map[string]int{}
		rows, err = tx.Query(ctx, `
			select gp.user_id::text, w.board_clue_id::text, w.amount, w.answer, w.submitted_at is not null
			from public.wagers w
			join public.game_players gp on gp.id = w.game_player_id
			where w.game_id = $1 and gp.user_id is not null`, d.GameID)
		if err != nil {
			return err
		}
		for rows.Next() {
			var user, clue string
			var amount int
			var answer *string
			var submitted bool
			if err := rows.Scan(&user, &clue, &amount, &answer, &submitted); err != nil {
				rows.Close()
				return err
			}
			switch {
			case clue == d.ActiveClueID && d.ActiveClueID != "":
				d.DDWager = &amount
			case clue == finalID:
				d.FinalWagers[user] = amount
				if submitted && answer != nil {
					d.FinalAnswers[user] = *answer
				}
			}
		}
		rows.Close()
		if err := rows.Err(); err != nil {
			return err
		}

		d.Scores = map[string]int{}
		d.Attempted = map[string]bool{}
		rows, err = tx.Query(ctx, `
			select gp.user_id::text, a.board_clue_id::text, a.verdict::text, a.score_delta
			from public.answers a
			join public.game_players gp on gp.id = a.game_player_id
			where a.game_id = $1 and gp.user_id is not null
			order by a.created_at`, d.GameID)
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			var user, clue, verdict string
			var delta int
			if err := rows.Scan(&user, &clue, &verdict, &delta); err != nil {
				return err
			}
			d.Scores[user] += delta
			if verdict == "correct" || verdict == "overridden_correct" {
				d.LastCorrect = user
			}
			if clue == d.ActiveClueID {
				d.Attempted[user] = true
			}
			if clue == finalID {
				d.FinalDeltas[user] += delta
			}
		}
		return rows.Err()
	})
	return d, err
}

// RevealClue marks a clue shown: everyone in the game has now seen it.
func (s PGStore) RevealClue(ctx context.Context, clueID string) error {
	return s.exec(ctx, "select public.reveal_clue($1)", clueID)
}

// RecordAnswer stores a judged answer. Its id is fixed before the first try, so a retry is a no-op.
func (s PGStore) RecordAnswer(ctx context.Context, r play.Record) error {
	source := r.Source
	if source == "" {
		source = contracts.AnswerSourceVoice
	}
	var rule *string
	if r.Rule != "" {
		v := string(r.Rule)
		rule = &v
	}
	var heard []string // nil (nothing heard) is stored as null
	for _, h := range r.Heard {
		if strings.TrimSpace(h) != "" {
			heard = append(heard, clip(h))
		}
	}
	return s.exec(ctx, `select public.record_answer($1, $2, $3, $4, $5::public.answer_source, $6::public.verdict, $7,
		$8::public.match_rule, $9::text[])`,
		r.AnswerID, r.ClueID, r.UserID, r.Answer, string(source), string(r.Verdict), r.Delta, rule, heard)
}

// RecordWager stores a Daily Double or Final wager. The first one wins, so a retry is a no-op.
func (s PGStore) RecordWager(ctx context.Context, r play.Record) error {
	return s.exec(ctx, "select public.record_wager($1, $2, $3)", r.ClueID, r.UserID, r.Amount)
}

// UpdateVerdict records a host override: the answer's new verdict and score change. The
// stored score is the sum of answers, so totals follow (game_results).
func (s PGStore) UpdateVerdict(ctx context.Context, r play.Record) error {
	return s.exec(ctx, "select public.update_verdict($1, $2::public.verdict, $3)", r.AnswerID, string(r.Verdict), r.Delta)
}

// SubmitFinalAnswer locks a finalist's typed answer. Only the first submission counts.
func (s PGStore) SubmitFinalAnswer(ctx context.Context, r play.Record) error {
	return s.exec(ctx, "select public.submit_final_answer($1, $2, $3)", r.ClueID, r.UserID, r.Answer)
}

// FinishClue marks a clue answered or unanswered.
func (s PGStore) FinishClue(ctx context.Context, clueID string, state contracts.ClueState) error {
	return s.exec(ctx, "select public.finish_clue($1, $2::public.clue_state)", clueID, string(state))
}

// EndGame records the game as finished or abandoned; the room reopens.
func (s PGStore) EndGame(ctx context.Context, gameID string, status contracts.GameStatus) error {
	return s.exec(ctx, "select public.end_game($1, $2::public.game_status)", gameID, string(status))
}
