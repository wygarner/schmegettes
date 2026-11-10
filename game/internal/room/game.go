package room

import (
	"context"
	"encoding/json"
	"errors"
	"math/rand/v2"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"

	"schmegettes/game/internal/contracts"
	"schmegettes/game/internal/play"
)

// GameData is a game in progress as stored: who plays, the board with clue text and
// responses, and what the answers so far imply (scores, control, who tried the active clue).
type GameData struct {
	GameID       string
	StartedAt    time.Time
	Players      []play.Player
	Board        []play.Clue
	Scores       map[string]int
	LastCorrect  string
	ActiveClueID string
	Attempted    map[string]bool

	// Wagers, from the wagers table: the active Daily Double's, and Final's with any
	// submitted answers. FinalDeltas are the Final answers already revealed.
	Final        *play.Clue
	DDWager      *int
	FinalWagers  map[string]int
	FinalAnswers map[string]string
	FinalDeltas  map[string]int
}

// loadGame builds the play.Game for the room's game in progress, fresh or after a restart.
func (r *Room) loadGame(ctx context.Context) bool {
	data, err := r.store.LoadGame(ctx, r.id)
	if err != nil {
		r.log.Error("game load failed", "err", err)
		return false
	}
	r.gameID = data.GameID
	r.game = play.New(play.Setup{
		RoomID: r.id, GameID: data.GameID, HostID: r.lobby.HostID, StartedAt: data.StartedAt,
		Players: data.Players, Board: data.Board,
		Scores: data.Scores, LastCorrect: data.LastCorrect,
		ActiveClueID: data.ActiveClueID, AttemptedByID: data.Attempted,
		Final: data.Final, DDWager: data.DDWager,
		FinalWagers: data.FinalWagers, FinalAnswers: data.FinalAnswers, FinalDeltas: data.FinalDeltas,
		NextSeq: func() int { r.seq++; return r.seq },
		NewID:   uuid.NewString,
		Pick:    rand.IntN,
	})
	r.phase = r.game.Phase()
	r.log.Info("game loaded", "game_id", data.GameID, "recovered", data.ActiveClueID != "" || len(data.Scores) > 0)
	return true
}

// applyGame sends the effects' messages, writes their records, and reschedules the timer.
func (r *Room) applyGame(ctx context.Context, e play.Effects) {
	for _, b := range e.Broadcasts {
		r.sendGame(b)
	}
	r.pending = append(r.pending, e.Records...)
	r.flush(ctx)
	if r.game != nil {
		prev := r.phase
		r.phase = r.game.Phase()
		r.logPhase(prev)
	}
	r.schedule()
}

// logPhase logs the wager-flow lifecycle: a Daily Double picked, Final started or skipped.
func (r *Room) logPhase(prev contracts.GamePhase) {
	if prev == r.phase {
		return
	}
	switch r.phase {
	case contracts.GamePhaseDailyDoubleWager:
		r.log.Info("daily double", "game_id", r.gameID, "user_id", r.game.Controller())
	case contracts.GamePhaseFinalCategory:
		r.log.Info("final started", "game_id", r.gameID, "finalists", r.game.Finalists())
	case contracts.GamePhaseFinished:
		if r.game.FinalSkipped() {
			r.log.Info("final skipped", "game_id", r.gameID)
		}
	}
}

// sendGame delivers one broadcast: the host's sockets get the copy with TV-only fields
// (clue text, correct response); a player with a private copy (their own Final wager or
// answer) gets that; everyone else gets the plain copy. All share one seq. The host user
// never gets a private copy, because the host device is on the TV.
func (r *Room) sendGame(b play.Broadcast) {
	all, err := json.Marshal(b.All)
	if err != nil {
		r.log.Error("encode failed", "err", err)
		return
	}
	host := all
	if b.Host != nil {
		if host, err = json.Marshal(b.Host); err != nil {
			r.log.Error("encode failed", "err", err)
			return
		}
	}
	private := map[string][]byte{}
	for user, m := range b.Private {
		if user == r.lobby.HostID {
			continue
		}
		data, err := json.Marshal(m)
		if err != nil {
			r.log.Error("encode failed", "err", err)
			return
		}
		private[user] = data
	}
	for c := range r.clients {
		mine, ok := private[c.UserID]
		switch {
		case c.UserID == r.lobby.HostID:
			r.deliver(c, host)
		case ok:
			r.deliver(c, mine)
		default:
			r.deliver(c, all)
		}
	}
}

// maxWriteTries bounds retries of one record, so a write that can never succeed doesn't block
// every record behind it for the rest of the game.
const maxWriteTries = 3

// flush writes pending records in order. A failure keeps the rest for the next event; the
// writes are safe to repeat. A record that fails maxWriteTries times is dropped and logged.
func (r *Room) flush(ctx context.Context) {
	for len(r.pending) > 0 {
		rec := r.pending[0]
		if err := r.write(ctx, rec); err != nil {
			r.writeTries++
			if r.writeTries < maxWriteTries {
				r.log.Error("record write failed", "err", err, "game_id", r.gameID, "op", rec.Kind)
				return
			}
			r.log.Error("record dropped after retries", "err", err, "game_id", r.gameID, "op", rec.Kind)
		}
		r.writeTries = 0
		r.pending = r.pending[1:]
	}
}

// clip cuts text to the 200 characters the contract allows (answers.answer's limit), so an
// over-long message can't fail its write.
func clip(s string) string {
	const limit = 200
	if utf8.RuneCountInString(s) <= limit {
		return s
	}
	return string([]rune(s)[:limit])
}

// maxAlternatives is how many of the recognizer's other guesses are judged (SubmitAnswer.alternatives).
const maxAlternatives = 4

// alternatives clips each guess, drops empty ones and keeps at most maxAlternatives.
func alternatives(in []string) []string {
	var out []string
	for _, s := range in {
		if len(out) == maxAlternatives {
			break
		}
		if s = clip(s); strings.TrimSpace(s) != "" {
			out = append(out, s)
		}
	}
	return out
}

func (r *Room) write(ctx context.Context, rec play.Record) error {
	switch rec.Kind {
	case play.RevealClue:
		return r.store.RevealClue(ctx, rec.ClueID)
	case play.RecordAnswer:
		r.log.Debug("answer judged", "game_id", r.gameID, "user_id", rec.UserID, "answer_id", rec.AnswerID,
			"verdict", rec.Verdict, "match_rule", rec.Rule, "heard_count", len(rec.Heard), "matched_index", rec.MatchedIndex)
		rec.Answer = clip(rec.Answer)
		return r.store.RecordAnswer(ctx, rec)
	case play.RecordWager:
		r.log.Debug("wager locked", "game_id", r.gameID, "user_id", rec.UserID, "board_clue_id", rec.ClueID, "amount", rec.Amount)
		return r.store.RecordWager(ctx, rec)
	case play.SubmitFinalAnswer:
		r.log.Debug("final answer submitted", "game_id", r.gameID, "user_id", rec.UserID, "answer", rec.Answer)
		rec.Answer = clip(rec.Answer)
		return r.store.SubmitFinalAnswer(ctx, rec)
	case play.UpdateVerdict:
		r.log.Info("verdict overridden", "game_id", r.gameID, "answer_id", rec.AnswerID, "user_id", rec.UserID,
			"to_verdict", rec.Verdict, "score_delta", rec.Delta, "judge_verdict", rec.JudgeVerdict, "match_rule", rec.Rule)
		return r.store.UpdateVerdict(ctx, rec)
	case play.FinishClue:
		return r.store.FinishClue(ctx, rec.ClueID, rec.State)
	case play.EndGame:
		r.log.Info("game over", "game_id", r.gameID)
		return r.store.EndGame(ctx, r.gameID, contracts.GameStatusFinished)
	}
	return nil
}

// schedule arms the room's one timer for the game's next deadline.
func (r *Room) schedule() {
	if r.stopTimer != nil {
		r.stopTimer()
		r.stopTimer = nil
	}
	if r.game == nil || r.game.Deadline().IsZero() {
		return
	}
	r.timerGen++
	gen := r.timerGen
	wait := max(r.game.Deadline().Sub(r.cfg.Now()), 0)
	r.stopTimer = r.cfg.AfterFunc(wait, func() { r.send(event{kind: evTimer, gen: gen}) })
}

func (r *Room) fire(ctx context.Context, gen int) {
	if r.game == nil || gen != r.timerGen {
		return // a timer that was replaced
	}
	// The timer firing means the deadline has come, even if the clock reads a hair early.
	now := r.cfg.Now()
	if d := r.game.Deadline(); d.After(now) {
		now = d
	}
	// On the board the only timer is the control handoff (a new round's controller is
	// set by the interstitial, which starts off the board).
	onBoard, from := r.game.Phase() == contracts.GamePhaseBoard, r.game.Controller()
	r.applyGame(ctx, r.game.Timeout(now))
	if onBoard && r.game != nil && r.game.Controller() != from {
		r.log.Info("control passed", "game_id", r.gameID, "from_user_id", from, "to_user_id", r.game.Controller())
	}
}

// abandon ends a game whose host device has been gone too long, and closes the room.
func (r *Room) abandon(ctx context.Context) bool {
	if err := r.store.EndGame(ctx, r.gameID, contracts.GameStatusAbandoned); err != nil {
		r.log.Error("abandon failed", "err", err, "game_id", r.gameID)
		return false
	}
	if err := r.store.Close(ctx, r.id); err != nil {
		r.log.Error("room close failed", "err", err)
		return false
	}
	r.log.Info("game abandoned", "game_id", r.gameID)
	r.closeRoom(contracts.RoomClosedReasonHostAbsent)
	return true
}

// handleGame runs a gameplay intent. It reports false for types it doesn't know.
func (r *Room) handleGame(ctx context.Context, c *Client, kind string, data []byte) bool {
	now := r.cfg.Now()
	var (
		e   play.Effects
		err error
	)
	switch kind {
	case "select_clue":
		var m contracts.SelectClue
		if !decode(data, &m) {
			r.fail(c, contracts.ErrorCodeInvalidMessage, "")
			return true
		}
		if r.game == nil {
			r.fail(c, contracts.ErrorCodeWrongPhase, "")
			return true
		}
		r.log.Debug("clue picked", "game_id", r.gameID, "board_clue_id", m.ClueId, "user_id", c.UserID)
		e, err = r.game.Pick(now, c.UserID, string(m.ClueId))
	case "reading_done":
		var m contracts.ReadingDone
		if !decode(data, &m) {
			r.fail(c, contracts.ErrorCodeInvalidMessage, "")
			return true
		}
		if r.game == nil {
			return true
		}
		e, err = r.game.ReadingDone(now, c.UserID, string(m.ClueId))
	case "buzz":
		var m contracts.Buzz
		if !decode(data, &m) {
			r.fail(c, contracts.ErrorCodeInvalidMessage, "")
			return true
		}
		if r.game == nil {
			r.fail(c, contracts.ErrorCodeWrongPhase, "")
			return true
		}
		e, err = r.game.Buzz(now, c.UserID, string(m.ClueId))
		if m.ClientSentAt != nil && err == nil {
			r.log.Debug("buzz", "user_id", c.UserID, "latency_ms", now.UnixMilli()-int64(*m.ClientSentAt))
		}
	case "answer_progress":
		var m contracts.AnswerProgress
		if !decode(data, &m) {
			r.fail(c, contracts.ErrorCodeInvalidMessage, "")
			return true
		}
		if r.game == nil {
			return true
		}
		e, err = r.game.Progress(now, c.UserID, clip(m.Text))
	case "submit_answer":
		var m contracts.SubmitAnswer
		if !decode(data, &m) {
			r.fail(c, contracts.ErrorCodeInvalidMessage, "")
			return true
		}
		if r.game == nil {
			r.fail(c, contracts.ErrorCodeWrongPhase, "")
			return true
		}
		if m.Source == contracts.SubmitAnswerSourceTyped {
			e, err = r.game.TypedAnswer(now, c.UserID, string(m.ClueId), clip(m.Answer))
		} else {
			e, err = r.game.Answer(now, c.UserID, string(m.ClueId), clip(m.Answer), alternatives(m.Alternatives)...)
		}
	case "submit_wager":
		var m contracts.SubmitWager
		if !decode(data, &m) {
			r.fail(c, contracts.ErrorCodeInvalidMessage, "")
			return true
		}
		if r.game == nil {
			r.fail(c, contracts.ErrorCodeWrongPhase, "")
			return true
		}
		e, err = r.game.Wager(now, c.UserID, m.Amount)
	case "override_review":
		var m contracts.OverrideReview
		if !decode(data, &m) {
			r.fail(c, contracts.ErrorCodeInvalidMessage, "")
			return true
		}
		if r.game == nil {
			r.fail(c, contracts.ErrorCodeWrongPhase, "")
			return true
		}
		e, err = r.game.Review(now, c.UserID, m.Open)
	case "override_verdict":
		var m contracts.OverrideVerdict
		if !decode(data, &m) {
			r.fail(c, contracts.ErrorCodeInvalidMessage, "")
			return true
		}
		if r.game == nil {
			r.fail(c, contracts.ErrorCodeWrongPhase, "")
			return true
		}
		e, err = r.game.Override(now, c.UserID, string(m.AnswerId), m.Correct)
	default:
		return false
	}
	var reject *play.Reject
	switch {
	case errors.As(err, &reject):
		// A refused intent is a client mistake, not a server error.
		r.log.Debug("intent rejected", "type", kind, "user_id", c.UserID, "code", reject.Code)
		r.fail(c, reject.Code, "")
	case err == nil:
		r.applyGame(ctx, e)
	}
	return true
}

// startRound announces the board after start_game and connects everyone already here.
func (r *Room) startRound(ctx context.Context) {
	r.sendGame(play.Broadcast{All: contracts.RoundStarted{
		Type: "round_started", RoomId: contracts.Uuid(r.id), Seq: r.nextSeq(),
		Round: contracts.RoundSingle, Board: r.game.Board(false), ControllingUserId: r.controller(),
	}})
	r.connectAll(ctx)
}

func (r *Room) connectAll(ctx context.Context) {
	now := r.cfg.Now()
	for c := range r.clients {
		r.applyGame(ctx, r.game.Connect(now, c.UserID))
	}
}

func (r *Room) nextSeq() int {
	r.seq++
	return r.seq
}

func (r *Room) controller() *contracts.Uuid {
	var snap contracts.RoomSnapshot
	r.game.SnapshotFields(&snap, false)
	return snap.ControllingUserId
}
