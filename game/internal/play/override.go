package play

// Host overrides: the host fixes a misjudged answer on the clue just played, or on the Final
// answer being revealed. Rules: docs/product-docs/features/scoreboard-and-overrides/.

import (
	"time"

	"schmegettes/game/internal/contracts"
)

// judged is one judged answer that may still be overridden.
type judged struct {
	id      string
	user    string
	text    string
	verdict contracts.Verdict
	delta   int
	// amount is what the answer is worth: the clue's value, or the wager.
	amount int
	// judgeVerdict and rule are the judge's verdict and why; an override never changes them.
	judgeVerdict contracts.Verdict
	rule         contracts.MatchRule
	// prevVerdict and prevDelta are what a voided answer was before an earlier answer on
	// the clue was overridden to correct, so flipping that override back restores it.
	prevVerdict contracts.Verdict
	prevDelta   int
}

func (a *judged) correct() bool {
	return a.verdict == contracts.VerdictCorrect || a.verdict == contracts.VerdictOverriddenCorrect
}

// overrideWindow lists the answers the host may override right now: the clue just played,
// during its correct-response screen, or the finalist being revealed, during their step.
func (g *Game) overrideWindow() []*judged {
	if g.paused || g.over {
		return nil
	}
	switch g.step {
	case stepClueEnd:
		if g.active != nil && g.active != g.final {
			return g.clueAnswers
		}
	case stepFinalReveal:
		return g.clueAnswers
	}
	return nil
}

func reviewedUsers(answers []*judged) []contracts.Uuid {
	out := []contracts.Uuid{}
	seen := map[string]bool{}
	for _, a := range answers {
		if !seen[a.user] {
			seen[a.user] = true
			out = append(out, contracts.Uuid(a.user))
		}
	}
	return out
}

// Review opens or closes the host's review of a verdict. While it is open the clock is
// paused: the step keeps its time left and resumes with it.
func (g *Game) Review(now time.Time, user string, open bool) (Effects, error) {
	var e Effects
	if user != g.s.HostID {
		return e, reject(contracts.ErrorCodeNotHost)
	}
	answers := g.overrideWindow()
	if len(answers) == 0 {
		return e, reject(contracts.ErrorCodeWrongPhase)
	}
	if open == g.reviewing {
		return e, ErrIgnored
	}
	if open {
		g.reviewLeft = max(g.deadline.Sub(now), 0)
		g.deadline = time.Time{}
	} else {
		g.deadline = now.Add(g.reviewLeft)
		g.reviewLeft = 0
	}
	g.reviewing = open
	g.emitReview(&e, answers)
	return e, nil
}

func (g *Game) emitReview(e *Effects, answers []*judged) {
	e.send(contracts.OverrideReviewChanged{
		Type: "override_review_changed", RoomId: contracts.Uuid(g.s.RoomID), Seq: g.s.NextSeq(),
		Open: g.reviewing, UserIds: reviewedUsers(answers), DeadlineAt: ms(g.deadline),
	})
}

// Override sets one answer's verdict. The answer scores ±its amount (the clue's value, or the
// wager), so the score swings by twice that. On a regular clue, control goes to the latest
// correct answer on it, or back to whoever had control when it was picked; a Daily Double
// and Final never move control.
func (g *Game) Override(now time.Time, user, answerID string, correct bool) (Effects, error) {
	var e Effects
	if user != g.s.HostID {
		return e, reject(contracts.ErrorCodeNotHost)
	}
	answers := g.overrideWindow()
	if len(answers) == 0 {
		return e, reject(contracts.ErrorCodeWrongPhase)
	}
	var a *judged
	for _, x := range answers {
		if x.id == answerID {
			a = x
		}
	}
	if a == nil {
		return e, reject(contracts.ErrorCodeUnknownAnswer)
	}
	if a.verdict == contracts.VerdictVoided {
		return e, reject(contracts.ErrorCodeAnswerVoided)
	}
	if a.correct() == correct {
		return e, ErrIgnored
	}
	verdict, delta := contracts.VerdictOverriddenIncorrect, -a.amount
	if correct {
		verdict, delta = contracts.VerdictOverriddenCorrect, a.amount
	}
	g.scores[a.user] += delta - a.delta
	a.verdict, a.delta = verdict, delta

	// On a regular clue an override to correct ends the clue there: the answers after it
	// only happened because of the judge's mistake, so they don't count. Flipping it back
	// restores them as they were.
	var changed []*judged
	regular := g.step == stepClueEnd && !g.ddActive()
	if regular {
		after := false
		for _, x := range answers {
			if x == a {
				after = true
				continue
			}
			if !after {
				continue
			}
			switch {
			case correct && x.verdict != contracts.VerdictVoided:
				x.prevVerdict, x.prevDelta = x.verdict, x.delta
				g.scores[x.user] -= x.delta
				x.verdict, x.delta = contracts.VerdictVoided, 0
				changed = append(changed, x)
			case !correct && x.verdict == contracts.VerdictVoided:
				x.verdict, x.delta = x.prevVerdict, x.prevDelta
				g.scores[x.user] += x.delta
				changed = append(changed, x)
			}
		}
		g.control = g.controlAtPick
		for _, x := range answers {
			if x.correct() {
				g.control = x.user // the latest counted correct answer wins
			}
		}
	}

	e.record(Record{Kind: UpdateVerdict, AnswerID: a.id, UserID: a.user, Verdict: verdict, Delta: delta,
		JudgeVerdict: a.judgeVerdict, Rule: a.rule})
	var others []contracts.VerdictOverriddenVoidedElem
	for _, x := range changed {
		e.record(Record{Kind: UpdateVerdict, AnswerID: x.id, UserID: x.user, Verdict: x.verdict, Delta: x.delta,
			JudgeVerdict: x.judgeVerdict, Rule: x.rule})
		others = append(others, contracts.VerdictOverriddenVoidedElem{
			AnswerId: contracts.Uuid(x.id), UserId: contracts.Uuid(x.user), Verdict: x.verdict, ScoreDelta: x.delta,
		})
	}
	e.send(contracts.VerdictOverridden{
		Type: "verdict_overridden", RoomId: contracts.Uuid(g.s.RoomID), Seq: g.s.NextSeq(),
		AnswerId: contracts.Uuid(a.id), UserId: contracts.Uuid(a.user), Verdict: verdict, ScoreDelta: delta,
		Scores: contracts.VerdictOverriddenScores(g.Scores()), ControllingUserId: uid(g.control),
		DeadlineAt: ms(g.deadline), Voided: others,
	})
	return e, nil
}

// closeReview ends an open review when the host device leaves; the step keeps its time left.
func (g *Game) closeReview(e *Effects) {
	if !g.reviewing {
		return
	}
	answers := g.overrideWindow()
	g.reviewing = false
	g.reviewLeft = 0
	if len(answers) > 0 {
		g.emitReview(e, answers)
	}
}

// overrideSnapshot adds the overridable answers (host copy only) and the review state.
func (g *Game) overrideSnapshot(m *contracts.RoomSnapshot, host bool) {
	answers := g.overrideWindow()
	if len(answers) == 0 {
		return
	}
	reviewing := g.reviewing
	m.OverrideReview = &reviewing
	if !host {
		return
	}
	for _, a := range answers {
		m.ClueAnswers = append(m.ClueAnswers, contracts.RoomSnapshotClueAnswersElem{
			AnswerId: contracts.Uuid(a.id), UserId: contracts.Uuid(a.user), Answer: a.text,
			Verdict: a.verdict, ScoreDelta: a.delta,
		})
	}
}
