package play

// Wagers: Daily Doubles and Final Schmegettes. Rules and timings:
// docs/product-docs/features/wagers/.

import (
	"fmt"
	"sort"
	"time"

	"schmegettes/game/internal/contracts"
	"schmegettes/game/internal/judge"
)

// Timings from the wagers interaction design.
const (
	DDReveal          = 2 * time.Second
	WagerWindow       = 30 * time.Second
	WagerShown        = 2 * time.Second
	FinalTitle        = 3 * time.Second
	FinalAnswerWindow = 30 * time.Second
	RevealStep        = 8 * time.Second
	FinalEndPause     = 4 * time.Second
	// MinDDWager is the smallest Daily Double wager.
	MinDDWager = 5
)

// DailyDoubleAnnouncement is said before a Daily Double clue. Keep it in sync with
// web/src/lib/speech.ts.
func DailyDoubleAnnouncement(wager int) string {
	return fmt.Sprintf("For %d, here's the clue.", wager)
}

// FinalAnnouncement is said when the Final category appears. Keep it in sync with
// web/src/lib/speech.ts.
func FinalAnnouncement(category string) string {
	return fmt.Sprintf("The Final Schmegettes category is: %s.", category)
}

// ddActive reports whether the active clue is a Daily Double.
func (g *Game) ddActive() bool {
	return g.active != nil && g.active.DailyDouble && g.active != g.final
}

func (g *Game) inFinal() bool { return g.final != nil && g.active == g.final }

// ddRange is the picker's wager range: $5 to the larger of their score and the round's top value.
func (g *Game) ddRange() int {
	top := 0
	for _, c := range g.clues {
		if c.Round == g.active.Round && c.Value > top {
			top = c.Value
		}
	}
	return max(g.scores[g.control], top)
}

type wagerFields struct {
	min, max, wager          *int
	finalists, locked, order []contracts.Uuid
}

func (g *Game) wagerFields() wagerFields {
	var w wagerFields
	if g.ddActive() {
		lo, hi := MinDDWager, g.ddMax
		w.min, w.max = &lo, &hi
		if g.ddLocked {
			v := g.ddWager
			w.wager = &v
		}
	}
	if g.inFinal() {
		w.finalists = uuids(g.finalists)
		switch g.phase {
		case contracts.GamePhaseFinalWager:
			w.locked = g.listOf(g.finalLocked)
		case contracts.GamePhaseFinalAnswer:
			w.locked = g.listOf(g.submitted)
		case contracts.GamePhaseFinalReveal:
			w.order = uuids(g.revealOrder)
		}
	}
	return w
}

func uuids(ids []string) []contracts.Uuid {
	out := make([]contracts.Uuid, 0, len(ids))
	for _, id := range ids {
		out = append(out, contracts.Uuid(id))
	}
	return out
}

// listOf lists the finalists set in m, in join order.
func (g *Game) listOf(m map[string]bool) []contracts.Uuid {
	out := []contracts.Uuid{}
	for _, u := range g.finalists {
		if m[u] {
			out = append(out, contracts.Uuid(u))
		}
	}
	return out
}

// PrivateSnapshot adds a player's own Final wager and answer to their snapshot. The host
// device gets nothing: it is on the TV.
func (g *Game) PrivateSnapshot(m *contracts.RoomSnapshot, user string) {
	if user == g.s.HostID || !g.inFinal() || !g.isFinal[user] {
		return
	}
	if g.finalLocked[user] {
		w := g.finalWagers[user]
		m.MyWager = &w
	}
	if g.submitted[user] {
		a, yes := g.finalAnswers[user], true
		m.MyFinalAnswer, m.MyFinalSubmitted = &a, &yes
	} else if d, ok := g.drafts[user]; ok {
		no := false
		m.MyFinalAnswer, m.MyFinalSubmitted = &d, &no
	}
}

// private builds a broadcast whose owner's copy differs. The host user never gets one.
func (g *Game) private(all, mine any, user string) Broadcast {
	b := Broadcast{All: all}
	if user != g.s.HostID {
		b.Private = map[string]any{user: mine}
	}
	return b
}

// ---------------------------------------------------------------------------
// Daily Double
// ---------------------------------------------------------------------------

func (g *Game) startDailyDouble(now time.Time, e *Effects) {
	g.phase = contracts.GamePhaseDailyDoubleWager
	g.step = stepDDWager
	g.answering = ""
	g.ddWager, g.ddLocked = 0, false
	g.ddMax = g.ddRange()
	g.deadline = now.Add(DDReveal + WagerWindow)
	g.emitPhase(e)
}

// Wager locks a Daily Double or Final wager.
func (g *Game) Wager(now time.Time, user string, amount int) (Effects, error) {
	var e Effects
	if g.paused || g.over {
		return e, reject(contracts.ErrorCodeWrongPhase)
	}
	switch g.step {
	case stepDDWager:
		if user != g.control {
			return e, reject(contracts.ErrorCodeNotYourTurn)
		}
		if amount < MinDDWager || amount > g.ddMax {
			return e, reject(contracts.ErrorCodeInvalidWager)
		}
		g.lockDD(now, &e, amount)
		return e, nil
	case stepDDShown:
		return e, ErrIgnored
	case stepFinalCategory, stepFinalWager:
		if !g.isFinal[user] {
			return e, reject(contracts.ErrorCodeNotAFinalist)
		}
		if g.finalLocked[user] {
			return e, ErrIgnored
		}
		if amount < 0 || amount > g.preFinal[user] {
			return e, reject(contracts.ErrorCodeInvalidWager)
		}
		g.lockFinal(&e, user, amount)
		if g.step == stepFinalWager && g.allSet(g.finalLocked) {
			g.startFinalAnswer(now, &e)
		}
		return e, nil
	}
	return e, reject(contracts.ErrorCodeWrongPhase)
}

func (g *Game) lockDD(now time.Time, e *Effects, amount int) {
	g.ddWager, g.ddLocked = amount, true
	g.step = stepDDShown
	g.deadline = now.Add(WagerShown)
	e.record(Record{Kind: RecordWager, ClueID: g.active.ID, UserID: g.control, Amount: amount})
	e.send(contracts.WagerLocked{
		Type: "wager_locked", RoomId: contracts.Uuid(g.s.RoomID), Seq: g.s.NextSeq(),
		UserId: contracts.Uuid(g.control), Amount: &amount,
	})
	g.emitPhase(e)
}

func (g *Game) startDDAnswer(now time.Time, e *Effects) {
	g.answering = g.control
	g.phase = contracts.GamePhaseAnswering
	g.step = stepAnswering
	g.lastProg = time.Time{}
	g.deadline = now.Add(AnswerWindow + AnswerGrace)
	g.emitPhase(e)
}

// recoverDailyDouble resumes an active Daily Double after a restart.
func (g *Game) recoverDailyDouble(wager *int) {
	g.ddMax = g.ddRange()
	if wager != nil {
		g.ddWager, g.ddLocked = *wager, true
		return // clue_reading: read again when the TV is back
	}
	g.phase = contracts.GamePhaseDailyDoubleWager
	g.step = stepDDWager
	g.remaining = DDReveal + WagerWindow
}

// ---------------------------------------------------------------------------
// Final Schmegettes
// ---------------------------------------------------------------------------

// setFinalists takes everyone above $0 before Final, in join order.
func (g *Game) setFinalists(pre map[string]int) {
	g.preFinal = pre
	g.finalists = nil
	g.isFinal = map[string]bool{}
	for _, p := range g.s.Players {
		if pre[p.UserID] > 0 {
			g.finalists = append(g.finalists, p.UserID)
			g.isFinal[p.UserID] = true
		}
	}
}

func (g *Game) startFinal(now time.Time, e *Effects) {
	g.setFinalists(g.Scores())
	if len(g.finalists) == 0 {
		g.finalSkipped = true
		g.finish(e)
		return
	}
	g.round = contracts.RoundFinal
	g.active = g.final
	g.attempted = map[string]bool{}
	g.startFinalCategory(now, e)
}

func (g *Game) startFinalCategory(now time.Time, e *Effects) {
	g.phase = contracts.GamePhaseFinalCategory
	g.step = stepFinalCategory
	g.phaseStart = now
	g.deadline = now.Add(FinalTitle + ReadingTime(FinalAnnouncement(g.final.Category)))
	g.emitPhase(e)
}

func (g *Game) startFinalWager(now time.Time, e *Effects) {
	g.phase = contracts.GamePhaseFinalWager
	g.step = stepFinalWager
	g.deadline = now.Add(WagerWindow)
	g.emitPhase(e)
	if g.allSet(g.finalLocked) { // every wager came in during the category
		g.startFinalAnswer(now, e)
	}
}

func (g *Game) lockFinal(e *Effects, user string, amount int) {
	g.finalWagers[user] = amount
	g.finalLocked[user] = true
	e.record(Record{Kind: RecordWager, ClueID: g.final.ID, UserID: user, Amount: amount})
	all := contracts.WagerLocked{
		Type: "wager_locked", RoomId: contracts.Uuid(g.s.RoomID), Seq: g.s.NextSeq(), UserId: contracts.Uuid(user),
	}
	mine := all
	mine.Amount = &amount
	e.Broadcasts = append(e.Broadcasts, g.private(all, mine, user))
}

func (g *Game) allSet(m map[string]bool) bool {
	for _, u := range g.finalists {
		if !m[u] {
			return false
		}
	}
	return true
}

// startFinalAnswer shows the clue: it is read, then finalists have FinalAnswerWindow to type.
// Typing is allowed from the moment the clue appears.
func (g *Game) startFinalAnswer(now time.Time, e *Effects) {
	if !g.finalShown {
		g.finalShown = true
		g.final.State = contracts.ClueStateActive
		e.record(Record{Kind: RevealClue, ClueID: g.final.ID})
	}
	g.phase = contracts.GamePhaseFinalAnswer
	g.step = stepFinalReading
	g.deadline = now.Add(ReadingTime(g.final.Text))
	g.emitPhase(e)
}

func (g *Game) openFinalAnswers(now time.Time, e *Effects) {
	g.step = stepFinalAnswer
	g.deadline = now.Add(FinalAnswerWindow)
	g.emitPhase(e)
	if g.allSet(g.submitted) { // everyone answered while the clue was read
		g.startReveal(now, e)
	}
}

// saveDraft keeps a finalist's typed draft. It is never broadcast; it is submitted for them
// if time runs out.
func (g *Game) saveDraft(user, text string) error {
	if g.paused || !g.isFinal[user] || g.submitted[user] {
		return ErrIgnored
	}
	g.drafts[user] = text
	return nil
}

// TypedAnswer locks a finalist's typed Final answer.
func (g *Game) TypedAnswer(now time.Time, user, clueID, text string) (Effects, error) {
	var e Effects
	if g.phase != contracts.GamePhaseFinalAnswer {
		return e, reject(contracts.ErrorCodeWrongPhase) // only Final is typed
	}
	if !g.isFinal[user] {
		return e, reject(contracts.ErrorCodeNotAFinalist)
	}
	if g.paused || clueID != g.final.ID || g.submitted[user] {
		return e, ErrIgnored
	}
	g.submitFinal(&e, user, text)
	if g.allSet(g.submitted) {
		g.startReveal(now, &e)
	}
	return e, nil
}

func (g *Game) submitFinal(e *Effects, user, text string) {
	g.finalAnswers[user] = text
	g.submitted[user] = true
	delete(g.drafts, user)
	e.record(Record{Kind: SubmitFinalAnswer, ClueID: g.final.ID, UserID: user, Answer: text})
	all := contracts.FinalSubmitted{
		Type: "final_submitted", RoomId: contracts.Uuid(g.s.RoomID), Seq: g.s.NextSeq(), UserId: contracts.Uuid(user),
	}
	mine := all
	mine.Answer = &text
	e.Broadcasts = append(e.Broadcasts, g.private(all, mine, user))
}

// startReveal reveals finalists one at a time, lowest score before Final first (join order
// on ties), so the leader goes last.
func (g *Game) startReveal(now time.Time, e *Effects) {
	g.phase = contracts.GamePhaseFinalReveal
	g.revealOrder = append([]string(nil), g.finalists...)
	sort.SliceStable(g.revealOrder, func(i, j int) bool {
		return g.preFinal[g.revealOrder[i]] < g.preFinal[g.revealOrder[j]]
	})
	g.revealIdx = 0
	g.emitPhase(e)
	g.revealNext(now, e)
}

func (g *Game) revealNext(now time.Time, e *Effects) {
	for g.revealIdx < len(g.revealOrder) && g.finalRevealed[g.revealOrder[g.revealIdx]] {
		g.revealIdx++
	}
	if g.revealIdx >= len(g.revealOrder) {
		g.endFinal(now, e)
		return
	}
	user := g.revealOrder[g.revealIdx]
	g.revealIdx++
	text, wager := g.finalAnswers[user], g.finalWagers[user]
	correct := text != "" && judge.IsCorrect(text, g.final.Response)
	verdict, delta := contracts.VerdictIncorrect, -wager
	if correct {
		verdict, delta = contracts.VerdictCorrect, wager
	}
	g.scores[user] += delta
	g.finalRevealed[user] = true
	id := g.s.NewID()
	e.record(Record{Kind: RecordAnswer, AnswerID: id, ClueID: g.final.ID, UserID: user, Answer: text,
		Verdict: verdict, Delta: delta, Source: contracts.AnswerSourceTyped})
	e.send(contracts.AnswerJudged{
		Type: "answer_judged", RoomId: contracts.Uuid(g.s.RoomID), Seq: g.s.NextSeq(), AnswerId: contracts.Uuid(id),
		UserId: contracts.Uuid(user), Answer: text, Verdict: verdict, ScoreDelta: delta, Wager: &wager,
		Scores: contracts.AnswerJudgedScores(g.Scores()),
	})
	g.step = stepFinalReveal
	g.deadline = now.Add(RevealStep)
}

// endFinal shows the correct response on the TV, then the game ends.
func (g *Game) endFinal(now time.Time, e *Effects) {
	c := g.final
	c.State = contracts.ClueStateAnswered
	g.step = stepFinalEnd
	g.deadline = now.Add(FinalEndPause)
	e.record(Record{Kind: FinishClue, ClueID: c.ID, State: c.State})
	seq := g.s.NextSeq()
	all := contracts.ClueEnded{
		Type: "clue_ended", RoomId: contracts.Uuid(g.s.RoomID), Seq: seq, ClueId: contracts.Uuid(c.ID),
		State: contracts.ClueEndedStateAnswered, Scores: contracts.ClueEndedScores(g.Scores()),
	}
	host := all
	resp := c.Response
	host.CorrectResponse = &resp
	e.sendSplit(all, host)
}

// wagerTimeout fires a wager-flow deadline.
func (g *Game) wagerTimeout(now time.Time, e *Effects) {
	switch g.step {
	case stepDDWager:
		g.lockDD(now, e, MinDDWager)
	case stepDDShown:
		g.startReading(now, e)
	case stepFinalCategory:
		g.startFinalWager(now, e)
	case stepFinalWager:
		for _, u := range g.finalists {
			if !g.finalLocked[u] {
				g.lockFinal(e, u, 0)
			}
		}
		g.startFinalAnswer(now, e)
	case stepFinalReading:
		g.openFinalAnswers(now, e)
	case stepFinalAnswer:
		for _, u := range g.finalists {
			if !g.submitted[u] {
				g.submitFinal(e, u, g.drafts[u])
			}
		}
		g.startReveal(now, e)
	case stepFinalReveal:
		g.revealNext(now, e)
	case stepFinalEnd:
		g.finish(e)
	}
}

// timeLeft is what a timed wager-flow step keeps across a pause. A reveal step restarts.
func (g *Game) timeLeft(now time.Time) time.Duration {
	switch g.step {
	case stepDDWager, stepDDShown, stepFinalWager, stepFinalAnswer, stepFinalEnd:
		return max(g.deadline.Sub(now), 0)
	case stepFinalReveal:
		return RevealStep
	}
	return 0
}

// resumeWager restarts a wager-flow step when the host device is back.
func (g *Game) resumeWager(now time.Time, e *Effects) {
	switch g.step {
	case stepFinalCategory:
		g.startFinalCategory(now, e) // the category is announced again
	case stepFinalReading:
		g.startFinalAnswer(now, e) // the clue is read again
	case stepFinalWager:
		if g.allSet(g.finalLocked) {
			g.startFinalAnswer(now, e)
			return
		}
		g.deadline = now.Add(g.remaining)
		g.emitPhase(e)
	default:
		g.deadline = now.Add(g.remaining)
		g.emitPhase(e)
	}
}

// recoverFinal resumes a game whose Double board is done, after a restart.
func (g *Game) recoverFinal(s Setup) {
	done := g.final == nil || g.final.State == contracts.ClueStateAnswered || g.final.State == contracts.ClueStateUnanswered
	pre := g.Scores()
	for u, d := range s.FinalDeltas {
		pre[u] -= d
		g.finalRevealed[u] = true
	}
	g.setFinalists(pre)
	if done || len(g.finalists) == 0 {
		g.phase = contracts.GamePhaseFinished
		g.over = true
		return
	}
	g.round = contracts.RoundFinal
	g.active = g.final
	for u, w := range s.FinalWagers {
		if g.isFinal[u] {
			g.finalWagers[u], g.finalLocked[u] = w, true
		}
	}
	if g.final.State == contracts.ClueStateUnplayed {
		if len(s.FinalWagers) == 0 {
			g.phase, g.step = contracts.GamePhaseFinalCategory, stepFinalCategory
			return
		}
		g.phase, g.step = contracts.GamePhaseFinalWager, stepFinalWager
		g.remaining = WagerWindow
		return
	}
	// The clue was shown.
	g.finalShown = true
	for u, a := range s.FinalAnswers {
		if g.isFinal[u] {
			g.finalAnswers[u], g.submitted[u] = a, true
		}
	}
	if len(s.FinalDeltas) == 0 {
		g.phase, g.step = contracts.GamePhaseFinalAnswer, stepFinalReading
		return
	}
	g.phase = contracts.GamePhaseFinalReveal
	g.revealOrder = append([]string(nil), g.finalists...)
	sort.SliceStable(g.revealOrder, func(i, j int) bool {
		return g.preFinal[g.revealOrder[i]] < g.preFinal[g.revealOrder[j]]
	})
	g.step = stepFinalReveal
	g.remaining = 0 // reveal the next finalist as soon as the TV is back
}

// Finalists is how many contestants play Final.
func (g *Game) Finalists() int { return len(g.finalists) }

// FinalSkipped reports whether Final was skipped because nobody was above $0.
func (g *Game) FinalSkipped() bool { return g.finalSkipped }
