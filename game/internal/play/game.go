// Package play is the game's rules: picking, reading, buzzing, answering, judging, and rounds.
// It is pure: no sockets, database, or wall clock. Each input takes the current time and
// returns Effects (messages to broadcast, records to write); the caller owns I/O and fires
// Timeout at Deadline(). Rules: docs/product-docs/features/gameplay/.
package play

import (
	"errors"
	"sort"
	"strings"
	"time"

	"schmegettes/game/internal/contracts"
	"schmegettes/game/internal/judge"
)

// Timings from the gameplay interaction design.
const (
	Lockout      = 250 * time.Millisecond
	BuzzWindow   = 5 * time.Second
	AnswerWindow = 7 * time.Second
	// AnswerGrace lets the final transcript arrive after the phone stops listening.
	AnswerGrace   = 1500 * time.Millisecond
	ClueEndPause  = 3 * time.Second
	Interstitial  = 3 * time.Second
	MaxReading    = 12 * time.Second
	ProgressEvery = 250 * time.Millisecond
)

// ReadingTime estimates how long text-to-speech takes: about 2.5 words a second plus a
// second, at most MaxReading. Buzzing opens then if the host device never reports.
func ReadingTime(text string) time.Duration {
	words := len(strings.Fields(text))
	d := time.Second + time.Duration(float64(words)/2.5*float64(time.Second))
	return min(d, MaxReading)
}

// Clue is one board clue, with the text and response only the TV may see.
type Clue struct {
	ID       string
	Round    contracts.Round
	Col, Row int
	Category string
	Value    int
	Text     string
	Response string
	State    contracts.ClueState
}

// Player is a contestant (a playing host included), in join order.
type Player struct {
	UserID string
	Name   string
}

// Setup builds a game: fresh after start_game, or recovered from Postgres after a restart.
type Setup struct {
	RoomID  string
	GameID  string
	HostID  string
	Players []Player
	Board   []Clue
	// Recovery: scores so far, who last answered correctly (control), and who already
	// tried the active clue. Empty for a fresh game.
	Scores        map[string]int
	LastCorrect   string
	ActiveClueID  string
	AttemptedByID map[string]bool

	NextSeq func() int
	NewID   func() string
	// Pick returns a number in [0, n) for the opening controller.
	Pick func(n int) int
}

// Record is a write the caller must make, in order.
type Record struct {
	Kind     RecordKind
	ClueID   string
	AnswerID string
	UserID   string
	Answer   string
	Verdict  contracts.Verdict
	Delta    int
	State    contracts.ClueState // FinishClue
}

// RecordKind names a write.
type RecordKind int

// Writes, matching the Postgres functions in realtime-game-server.md ("Recording").
const (
	RevealClue RecordKind = iota
	RecordAnswer
	FinishClue
	EndGame
)

// Broadcast is one message for every socket. Host, when set, is the same message with the
// TV-only fields (clue text, correct response) filled in, for the host's sockets.
type Broadcast struct {
	All  any
	Host any
}

// Effects is what an input caused.
type Effects struct {
	Broadcasts []Broadcast
	Records    []Record
}

func (e *Effects) send(all any) { e.Broadcasts = append(e.Broadcasts, Broadcast{All: all}) }
func (e *Effects) sendSplit(all, host any) {
	e.Broadcasts = append(e.Broadcasts, Broadcast{All: all, Host: host})
}
func (e *Effects) record(r Record) { e.Records = append(e.Records, r) }

// Reject is an intent the rules refuse; the caller sends it back as an error message.
type Reject struct{ Code contracts.ErrorCode }

func (r *Reject) Error() string { return string(r.Code) }

func reject(code contracts.ErrorCode) error { return &Reject{Code: code} }

// ErrIgnored is a valid but late or duplicate intent (a second pick, a buzz while someone
// answers). The caller does nothing.
var ErrIgnored = errors.New("ignored")

type step int

const (
	stepNone step = iota
	stepReading
	stepBuzzing
	stepAnswering
	stepClueEnd
	stepInterstitial
)

// Game is one game's state.
type Game struct {
	s       Setup
	round   contracts.Round
	phase   contracts.GamePhase
	step    step
	clues   map[string]*Clue
	order   []string // clue ids in board order
	scores  map[string]int
	control string

	active    *Clue
	attempted map[string]bool
	answering string
	lockouts  map[string]time.Time
	lastProg  time.Time

	deadline time.Time
	paused   bool
	online   map[string]int // user -> open sockets
	over     bool
}

// New builds a game. It starts paused until the host device connects (Connect).
func New(s Setup) *Game {
	g := &Game{
		s:         s,
		clues:     map[string]*Clue{},
		scores:    map[string]int{},
		attempted: map[string]bool{},
		lockouts:  map[string]time.Time{},
		online:    map[string]int{},
		paused:    true,
	}
	for i := range s.Board {
		c := s.Board[i]
		g.clues[c.ID] = &c
		g.order = append(g.order, c.ID)
	}
	for _, p := range s.Players {
		g.scores[p.UserID] = s.Scores[p.UserID]
	}

	g.round = contracts.RoundSingle
	if g.roundDone(contracts.RoundSingle) {
		g.round = contracts.RoundDouble
	}
	switch {
	case s.LastCorrect != "":
		g.control = s.LastCorrect
	case g.round == contracts.RoundDouble:
		g.control = g.lowestScore()
	case len(s.Players) > 0:
		g.control = s.Players[s.Pick(len(s.Players))].UserID
	}

	g.phase = contracts.GamePhaseBoard
	if c, ok := g.clues[s.ActiveClueID]; ok && c.State == contracts.ClueStateActive {
		g.active = c
		for u := range s.AttemptedByID {
			g.attempted[u] = true
		}
		g.phase = contracts.GamePhaseClueReading
		g.step = stepReading
	}
	if g.roundDone(contracts.RoundDouble) {
		g.phase = contracts.GamePhaseFinished
		g.over = true
	}
	return g
}

// Phase is the current phase.
func (g *Game) Phase() contracts.GamePhase { return g.phase }

// Deadline is when Timeout must be called; zero when nothing is pending.
func (g *Game) Deadline() time.Time { return g.deadline }

// Over reports whether the game has ended.
func (g *Game) Over() bool { return g.over }

// Scores returns a copy of the scores.
func (g *Game) Scores() map[string]int {
	out := make(map[string]int, len(g.scores))
	for k, v := range g.scores {
		out[k] = v
	}
	return out
}

func (g *Game) isContestant(user string) bool {
	_, ok := g.scores[user]
	return ok
}

func (g *Game) roundDone(r contracts.Round) bool {
	found := false
	for _, id := range g.order {
		c := g.clues[id]
		if c.Round != r {
			continue
		}
		found = true
		if c.State == contracts.ClueStateUnplayed || c.State == contracts.ClueStateActive {
			return false
		}
	}
	return found
}

// lowestScore picks Double Schmegettes' first controller: lowest score, join order on ties.
func (g *Game) lowestScore() string {
	best := ""
	for _, p := range g.s.Players {
		if best == "" || g.scores[p.UserID] < g.scores[best] {
			best = p.UserID
		}
	}
	return best
}

func ms(t time.Time) *int {
	if t.IsZero() {
		return nil
	}
	v := int(t.UnixMilli())
	return &v
}

func uid(s string) *contracts.Uuid {
	if s == "" {
		return nil
	}
	u := contracts.Uuid(s)
	return &u
}

func (g *Game) boardClue(c *Clue, host bool) contracts.BoardClue {
	bc := contracts.BoardClue{ClueId: contracts.Uuid(c.ID), Category: c.Category, Value: c.Value, State: c.State}
	if host && g.active == c {
		text := c.Text
		bc.ClueText = &text
	}
	return bc
}

// Board is the current round's clues in board order (column, then row).
func (g *Game) Board(host bool) []contracts.BoardClue {
	out := []contracts.BoardClue{}
	ids := append([]string(nil), g.order...)
	sort.SliceStable(ids, func(i, j int) bool {
		a, b := g.clues[ids[i]], g.clues[ids[j]]
		if a.Col != b.Col {
			return a.Col < b.Col
		}
		return a.Row < b.Row
	})
	for _, id := range ids {
		if c := g.clues[id]; c.Round == g.round {
			out = append(out, g.boardClue(c, host))
		}
	}
	return out
}

func (g *Game) attemptedList() []contracts.Uuid {
	out := []contracts.Uuid{}
	for _, p := range g.s.Players {
		if g.attempted[p.UserID] {
			out = append(out, contracts.Uuid(p.UserID))
		}
	}
	return out
}

func (g *Game) phaseChanged(host bool) contracts.PhaseChanged {
	paused := g.paused
	m := contracts.PhaseChanged{
		Type: "phase_changed", RoomId: contracts.Uuid(g.s.RoomID), Seq: 0, Phase: g.phase,
		DeadlineAt: ms(g.deadline), AnsweringUserId: uid(g.answering),
		AttemptedUserIds: g.attemptedList(), ControllingUserId: uid(g.control), Paused: &paused,
	}
	if g.active != nil {
		bc := g.boardClue(g.active, host)
		m.ActiveClue = &bc
	}
	return m
}

// emitPhase broadcasts the current phase, with the clue text for the host only. Both
// copies share one seq.
func (g *Game) emitPhase(e *Effects) {
	seq := g.s.NextSeq()
	all, host := g.phaseChanged(false), g.phaseChanged(true)
	all.Seq, host.Seq = seq, seq
	e.sendSplit(all, host)
}

// SnapshotFields fills a room_snapshot with the game's state.
func (g *Game) SnapshotFields(m *contracts.RoomSnapshot, host bool) {
	m.Phase = g.phase
	m.Round = g.round
	m.Board = g.Board(host)
	m.ControllingUserId = uid(g.control)
	m.DeadlineAt = ms(g.deadline)
	m.AnsweringUserId = uid(g.answering)
	m.AttemptedUserIds = g.attemptedList()
	paused := g.paused
	m.Paused = &paused
	m.Scores = contracts.RoomSnapshotScores(g.Scores())
	if g.active != nil {
		bc := g.boardClue(g.active, host)
		m.ActiveClue = &bc
		id := contracts.Uuid(g.active.ID)
		m.ActiveClueId = &id
	}
}

// Pick starts a clue. The controller or the host may pick.
func (g *Game) Pick(now time.Time, user, clueID string) (Effects, error) {
	var e Effects
	if g.paused || g.over {
		return e, reject(contracts.ErrorCodeWrongPhase)
	}
	if g.phase != contracts.GamePhaseBoard || g.step != stepNone {
		return e, ErrIgnored // someone else's pick won
	}
	if user != g.control && user != g.s.HostID {
		return e, reject(contracts.ErrorCodeNotInControl)
	}
	c, ok := g.clues[clueID]
	if !ok || c.Round != g.round || c.State != contracts.ClueStateUnplayed {
		return e, ErrIgnored
	}
	c.State = contracts.ClueStateActive
	g.active = c
	g.attempted = map[string]bool{}
	g.lockouts = map[string]time.Time{}
	e.record(Record{Kind: RevealClue, ClueID: c.ID})
	g.startReading(now, &e)
	return e, nil
}

func (g *Game) startReading(now time.Time, e *Effects) {
	g.phase = contracts.GamePhaseClueReading
	g.step = stepReading
	g.answering = ""
	g.deadline = now.Add(ReadingTime(g.active.Text))
	g.emitPhase(e)
}

// ReadingDone opens buzzing when the host device finishes reading the clue aloud.
func (g *Game) ReadingDone(now time.Time, user, clueID string) (Effects, error) {
	var e Effects
	if user != g.s.HostID {
		return e, reject(contracts.ErrorCodeNotHost)
	}
	if g.paused || g.step != stepReading || g.active == nil || g.active.ID != clueID {
		return e, ErrIgnored
	}
	g.openBuzzing(now, &e)
	return e, nil
}

func (g *Game) openBuzzing(now time.Time, e *Effects) {
	g.phase = contracts.GamePhaseBuzzingOpen
	g.step = stepBuzzing
	g.answering = ""
	g.deadline = now.Add(BuzzWindow)
	g.emitPhase(e)
}

// Buzz handles a buzzer press. Early presses lock the player out for 250 ms.
func (g *Game) Buzz(now time.Time, user, clueID string) (Effects, error) {
	var e Effects
	if !g.isContestant(user) || g.paused || g.active == nil || g.active.ID != clueID {
		return e, ErrIgnored
	}
	if g.attempted[user] {
		return e, reject(contracts.ErrorCodeAlreadyAttempted)
	}
	switch g.step {
	case stepReading:
		until := now.Add(Lockout)
		g.lockouts[user] = until
		e.send(contracts.BuzzResult{
			Type: "buzz_result", RoomId: contracts.Uuid(g.s.RoomID), Seq: g.s.NextSeq(),
			UserId: contracts.Uuid(user), Outcome: contracts.BuzzResultOutcomeLockedOut, LockoutUntil: ms(until),
		})
		return e, nil
	case stepBuzzing:
		if now.Before(g.lockouts[user]) {
			return e, ErrIgnored
		}
		g.answering = user
		g.phase = contracts.GamePhaseAnswering
		g.step = stepAnswering
		g.lastProg = time.Time{}
		g.deadline = now.Add(AnswerWindow + AnswerGrace)
		e.send(contracts.BuzzResult{
			Type: "buzz_result", RoomId: contracts.Uuid(g.s.RoomID), Seq: g.s.NextSeq(),
			UserId: contracts.Uuid(user), Outcome: contracts.BuzzResultOutcomeWon,
		})
		g.emitPhase(&e)
		return e, nil
	}
	return e, ErrIgnored
}

// Progress relays the answering player's interim transcript, at most every 250 ms.
func (g *Game) Progress(now time.Time, user, text string) (Effects, error) {
	var e Effects
	if g.step != stepAnswering || user != g.answering || g.paused {
		return e, ErrIgnored
	}
	if !g.lastProg.IsZero() && now.Sub(g.lastProg) < ProgressEvery {
		return e, ErrIgnored
	}
	g.lastProg = now
	e.send(contracts.LiveTranscript{
		Type: "answer_progress", RoomId: contracts.Uuid(g.s.RoomID), Seq: g.s.NextSeq(),
		UserId: contracts.Uuid(user), Text: text,
	})
	return e, nil
}

// Answer judges the answering player's final transcript.
func (g *Game) Answer(now time.Time, user, clueID, text string) (Effects, error) {
	var e Effects
	if g.step != stepAnswering || user != g.answering || g.active == nil || g.active.ID != clueID || g.paused {
		return e, ErrIgnored
	}
	g.judge(now, &e, text)
	return e, nil
}

func (g *Game) judge(now time.Time, e *Effects, text string) {
	c, user := g.active, g.answering
	correct := text != "" && judge.IsCorrect(text, c.Response)
	verdict, delta := contracts.VerdictIncorrect, -c.Value
	if correct {
		verdict, delta = contracts.VerdictCorrect, c.Value
	}
	g.scores[user] += delta
	g.attempted[user] = true
	g.answering = ""
	id := g.s.NewID()
	e.record(Record{Kind: RecordAnswer, AnswerID: id, ClueID: c.ID, UserID: user, Answer: text, Verdict: verdict, Delta: delta})

	seq := g.s.NextSeq()
	all := contracts.AnswerJudged{
		Type: "answer_judged", RoomId: contracts.Uuid(g.s.RoomID), Seq: seq, AnswerId: contracts.Uuid(id),
		UserId: contracts.Uuid(user), Answer: text, Verdict: verdict, ScoreDelta: delta,
		Scores: contracts.AnswerJudgedScores(g.Scores()),
	}
	host := all
	if correct {
		resp := c.Response
		host.CorrectResponse = &resp
	}
	e.sendSplit(all, host)

	if correct {
		g.control = user
		g.endClue(now, e, contracts.ClueStateAnswered)
		return
	}
	g.afterMiss(now, e)
}

// afterMiss reopens buzzing while a connected contestant hasn't tried, else ends the clue.
func (g *Game) afterMiss(now time.Time, e *Effects) {
	for _, p := range g.s.Players {
		if !g.attempted[p.UserID] && g.online[p.UserID] > 0 {
			g.openBuzzing(now, e)
			return
		}
	}
	g.endClue(now, e, contracts.ClueStateUnanswered)
}

func (g *Game) endClue(now time.Time, e *Effects, state contracts.ClueState) {
	c := g.active
	c.State = state
	g.answering = ""
	g.step = stepClueEnd
	g.deadline = now.Add(ClueEndPause)
	e.record(Record{Kind: FinishClue, ClueID: c.ID, State: state})

	seq := g.s.NextSeq()
	all := contracts.ClueEnded{
		Type: "clue_ended", RoomId: contracts.Uuid(g.s.RoomID), Seq: seq, ClueId: contracts.Uuid(c.ID),
		State: contracts.ClueEndedState(state), ControllingUserId: uid(g.control),
		Scores: contracts.ClueEndedScores(g.Scores()),
	}
	host := all
	resp := c.Response
	host.CorrectResponse = &resp
	e.sendSplit(all, host)
}

// Timeout fires the pending deadline.
func (g *Game) Timeout(now time.Time) Effects {
	var e Effects
	if g.paused || g.deadline.IsZero() || now.Before(g.deadline) {
		return e
	}
	g.deadline = time.Time{}
	switch g.step {
	case stepReading:
		g.openBuzzing(now, &e)
	case stepBuzzing:
		g.endClue(now, &e, contracts.ClueStateUnanswered)
	case stepAnswering:
		// Silence counts as wrong, as on the show.
		g.judge(now, &e, "")
	case stepClueEnd:
		g.active = nil
		g.attempted = map[string]bool{}
		g.nextAfterClue(now, &e)
	case stepInterstitial:
		g.phase = contracts.GamePhaseBoard
		g.step = stepNone
		g.emitPhase(&e)
	}
	return e
}

func (g *Game) nextAfterClue(now time.Time, e *Effects) {
	if !g.roundDone(g.round) {
		g.phase = contracts.GamePhaseBoard
		g.step = stepNone
		g.emitPhase(e)
		return
	}
	if g.round == contracts.RoundSingle && !g.roundDone(contracts.RoundDouble) {
		g.round = contracts.RoundDouble
		g.control = g.lowestScore()
		g.step = stepInterstitial
		g.deadline = now.Add(Interstitial)
		e.send(contracts.RoundStarted{
			Type: "round_started", RoomId: contracts.Uuid(g.s.RoomID), Seq: g.s.NextSeq(),
			Round: g.round, Board: g.Board(false), ControllingUserId: uid(g.control),
		})
		return
	}
	g.finish(e)
}

func (g *Game) finish(e *Effects) {
	g.over = true
	g.phase = contracts.GamePhaseFinished
	g.step = stepNone
	g.deadline = time.Time{}
	e.record(Record{Kind: EndGame})
	g.emitPhase(e)
	e.send(contracts.GameOver{
		Type: "game_over", RoomId: contracts.Uuid(g.s.RoomID), Seq: g.s.NextSeq(), Results: g.Results(),
	})
}

// Results ranks contestants, highest score first; ties share a placement (1, 1, 3).
func (g *Game) Results() []contracts.GameOverResultsElem {
	players := append([]Player(nil), g.s.Players...)
	sort.SliceStable(players, func(i, j int) bool { return g.scores[players[i].UserID] > g.scores[players[j].UserID] })
	out := make([]contracts.GameOverResultsElem, 0, len(players))
	for i, p := range players {
		place := i + 1
		if i > 0 && g.scores[p.UserID] == out[i-1].Score {
			place = out[i-1].Placement
		}
		out = append(out, contracts.GameOverResultsElem{
			UserId: contracts.Uuid(p.UserID), DisplayName: p.Name, Score: g.scores[p.UserID], Placement: place,
		})
	}
	return out
}

// Connect counts a socket. The host device's first socket resumes a paused game.
func (g *Game) Connect(now time.Time, user string) Effects {
	g.online[user]++
	if user == g.s.HostID && g.online[user] == 1 && g.paused {
		return g.resume(now)
	}
	return Effects{}
}

// Disconnect drops a socket. The host device's last socket pauses the game; a player who
// drops while answering loses nothing and can't try this clue again.
func (g *Game) Disconnect(now time.Time, user string) Effects {
	var e Effects
	if g.online[user] > 0 {
		g.online[user]--
	}
	if g.online[user] > 0 {
		return e
	}
	if user == g.s.HostID {
		return g.pause()
	}
	if !g.paused && g.step == stepAnswering && g.answering == user {
		g.attempted[user] = true
		g.answering = ""
		g.afterMiss(now, &e)
	}
	return e
}

func (g *Game) pause() Effects {
	var e Effects
	if g.paused || g.over {
		g.paused = true
		return e
	}
	g.paused = true
	g.deadline = time.Time{}
	// A player cut off mid-answer may try again when the clue is re-read.
	if g.step == stepAnswering {
		g.answering = ""
	}
	e.send(contracts.GamePaused{Type: "game_paused", RoomId: contracts.Uuid(g.s.RoomID), Seq: g.s.NextSeq(), Paused: true})
	return e
}

func (g *Game) resume(now time.Time) Effects {
	var e Effects
	g.paused = false
	if g.over {
		return e
	}
	e.send(contracts.GamePaused{Type: "game_paused", RoomId: contracts.Uuid(g.s.RoomID), Seq: g.s.NextSeq(), Paused: false})
	switch g.step {
	case stepReading, stepBuzzing, stepAnswering:
		// The clue is read again from the start; who already tried stays out.
		g.lockouts = map[string]time.Time{}
		g.startReading(now, &e)
	case stepClueEnd:
		g.deadline = now.Add(ClueEndPause)
	case stepInterstitial:
		g.deadline = now.Add(Interstitial)
	default:
		g.emitPhase(&e)
	}
	return e
}
