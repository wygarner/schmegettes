package play

import (
	"errors"
	"testing"
	"time"

	"schmegettes/game/internal/contracts"
)

// atClueEnd plays s1 (Alice's pick, $200): Bob buzzes and answers `bobSays`, then, when
// aliceSays is set, Alice buzzes and answers it. Otherwise the reopened window runs out.
// It stops on the correct-response screen.
func atClueEnd(t *testing.T, bobSays, aliceSays string) *fixture {
	t.Helper()
	f := setup(t, nil)
	f.openBuzzing("s1")
	f.must(f.g.Buzz(f.now, bob, "s1"))
	f.must(f.g.Answer(f.now, bob, "s1", bobSays))
	if aliceSays != "" {
		f.must(f.g.Buzz(f.now, alice, "s1"))
		f.must(f.g.Answer(f.now, alice, "s1", aliceSays))
	} else if f.g.step == stepBuzzing {
		f.toDeadline()
	}
	if f.g.step != stepClueEnd {
		t.Fatalf("not on the correct-response screen: step %d", f.g.step)
	}
	return f
}

func answerOf(t *testing.T, f *fixture, user string) string {
	t.Helper()
	for _, a := range f.g.clueAnswers {
		if a.user == user {
			return a.id
		}
	}
	t.Fatalf("no answer from %s", user)
	return ""
}

func TestOverrideMisheardAnswerToCorrect(t *testing.T) {
	f := atClueEnd(t, "crack a toe a", "")
	if f.g.Scores()[bob] != -200 || f.g.Controller() != alice {
		t.Fatalf("before: scores %v, control %s", f.g.Scores(), f.g.Controller())
	}
	id := answerOf(t, f, bob)
	f.must(f.g.Override(f.now, host, id, true))

	if f.g.Scores()[bob] != 200 {
		t.Errorf("bob %d, want +200 (a swing of twice the value)", f.g.Scores()[bob])
	}
	if f.g.Controller() != bob {
		t.Errorf("control %s, want bob (the only correct answer)", f.g.Controller())
	}
	vo := last[contracts.VerdictOverridden](t, f)
	if string(vo.AnswerId) != id || vo.Verdict != contracts.VerdictOverriddenCorrect || vo.ScoreDelta != 200 ||
		vo.ControllingUserId == nil || string(*vo.ControllingUserId) != bob || vo.Scores[bob] != 200 {
		t.Errorf("verdict_overridden %+v", vo)
	}
	r := recs(f, UpdateVerdict)
	if len(r) != 1 || r[0].AnswerID != id || r[0].Verdict != contracts.VerdictOverriddenCorrect || r[0].Delta != 200 {
		t.Errorf("records %+v", r)
	}

	// And back: control returns to whoever had it at the pick.
	f.must(f.g.Override(f.now, host, id, false))
	if f.g.Scores()[bob] != -200 || f.g.Controller() != alice {
		t.Errorf("after undoing: scores %v, control %s", f.g.Scores(), f.g.Controller())
	}
	if r := recs(f, UpdateVerdict); r[len(r)-1].Verdict != contracts.VerdictOverriddenIncorrect || r[len(r)-1].Delta != -200 {
		t.Errorf("records %+v", r)
	}
}

func TestOverrideToCorrectVoidsTheLaterAnswers(t *testing.T) {
	f := atClueEnd(t, "crack a toe a", "nitrogen") // Bob wrong, then Alice right
	if f.g.Controller() != alice {
		t.Fatalf("control %s", f.g.Controller())
	}
	bobID, aliceID := answerOf(t, f, bob), answerOf(t, f, alice)
	f.must(f.g.Override(f.now, host, bobID, true))
	if f.g.Scores()[bob] != 200 || f.g.Scores()[alice] != 0 {
		t.Errorf("scores %v, want bob 200 and alice 0 (her answer doesn't count)", f.g.Scores())
	}
	if f.g.Controller() != bob {
		t.Errorf("control %s, want bob", f.g.Controller())
	}
	vo := last[contracts.VerdictOverridden](t, f)
	if len(vo.Voided) != 1 || string(vo.Voided[0].AnswerId) != aliceID ||
		vo.Voided[0].Verdict != contracts.VerdictVoided || vo.Voided[0].ScoreDelta != 0 {
		t.Errorf("voided %+v", vo.Voided)
	}
	r := recs(f, UpdateVerdict)
	if len(r) != 2 || r[0].AnswerID != bobID || r[1].AnswerID != aliceID ||
		r[1].Verdict != contracts.VerdictVoided || r[1].Delta != 0 || r[1].JudgeVerdict != contracts.VerdictCorrect {
		t.Errorf("records %+v", r)
	}

	// A voided answer can't be overridden.
	if err := f.do(f.g.Override(f.now, host, aliceID, false)); code(err) != contracts.ErrorCodeAnswerVoided {
		t.Errorf("override of a voided answer: %v", err)
	}

	// Flipping Bob back restores Alice's answer as it was judged.
	f.must(f.g.Override(f.now, host, bobID, false))
	if f.g.Scores()[bob] != -200 || f.g.Scores()[alice] != 200 {
		t.Errorf("after undoing: scores %v", f.g.Scores())
	}
	if f.g.Controller() != alice {
		t.Errorf("control %s, want alice", f.g.Controller())
	}
	vo = last[contracts.VerdictOverridden](t, f)
	if len(vo.Voided) != 1 || vo.Voided[0].Verdict != contracts.VerdictCorrect || vo.Voided[0].ScoreDelta != 200 {
		t.Errorf("restored %+v", vo.Voided)
	}
}

func TestOverrideToCorrectGivesBackALaterWrongAnswer(t *testing.T) {
	f := atClueEnd(t, "crack a toe a", "oxygen") // Bob wrong, then Alice wrong
	if f.g.Scores()[alice] != -200 {
		t.Fatalf("alice %d", f.g.Scores()[alice])
	}
	f.must(f.g.Override(f.now, host, answerOf(t, f, bob), true))
	if f.g.Scores()[bob] != 200 || f.g.Scores()[alice] != 0 {
		t.Errorf("scores %v, want bob 200 and alice 0 (her loss given back)", f.g.Scores())
	}
	// Twice more: back and forth leaves the same totals.
	f.must(f.g.Override(f.now, host, answerOf(t, f, bob), false))
	f.must(f.g.Override(f.now, host, answerOf(t, f, bob), true))
	if f.g.Scores()[bob] != 200 || f.g.Scores()[alice] != 0 {
		t.Errorf("after flipping twice: %v", f.g.Scores())
	}
}

func TestSnapshotListsVoidedAnswers(t *testing.T) {
	f := atClueEnd(t, "crack a toe a", "nitrogen")
	f.must(f.g.Override(f.now, host, answerOf(t, f, bob), true))
	var snap contracts.RoomSnapshot
	f.g.SnapshotFields(&snap, true)
	var found bool
	for _, a := range snap.ClueAnswers {
		if string(a.UserId) == alice {
			found = a.Verdict == contracts.VerdictVoided && a.ScoreDelta == 0
		}
	}
	if !found {
		t.Errorf("clue answers %+v", snap.ClueAnswers)
	}
}

func TestOverrideRules(t *testing.T) {
	f := setup(t, nil)
	f.openBuzzing("s1")
	f.must(f.g.Buzz(f.now, bob, "s1"))
	if err := f.do(f.g.Override(f.now, host, "answer-1", true)); code(err) != contracts.ErrorCodeWrongPhase {
		t.Errorf("override while answering: %v", err)
	}
	if err := f.do(f.g.Review(f.now, host, true)); code(err) != contracts.ErrorCodeWrongPhase {
		t.Errorf("review while answering: %v", err)
	}

	f = atClueEnd(t, "oxygen", "")
	id := answerOf(t, f, bob)
	if err := f.do(f.g.Override(f.now, alice, id, true)); code(err) != contracts.ErrorCodeNotHost {
		t.Errorf("a phone overrode: %v", err)
	}
	if err := f.do(f.g.Review(f.now, bob, true)); code(err) != contracts.ErrorCodeNotHost {
		t.Errorf("a phone opened a review: %v", err)
	}
	if err := f.do(f.g.Override(f.now, host, "nope", true)); code(err) != contracts.ErrorCodeUnknownAnswer {
		t.Errorf("unknown answer: %v", err)
	}
	if err := f.do(f.g.Override(f.now, host, id, false)); !errors.Is(err, ErrIgnored) {
		t.Errorf("the same verdict again: %v", err)
	}
	f.toDeadline() // the correct-response screen ends: the board is back
	if err := f.do(f.g.Override(f.now, host, id, true)); code(err) != contracts.ErrorCodeWrongPhase {
		t.Errorf("override after the clue: %v", err)
	}
}

func TestNoOverrideWhenNobodyBuzzed(t *testing.T) {
	f := setup(t, nil)
	f.openBuzzing("s1")
	f.toDeadline() // nobody buzzed
	if f.g.step != stepClueEnd {
		t.Fatalf("step %d", f.g.step)
	}
	if err := f.do(f.g.Review(f.now, host, true)); code(err) != contracts.ErrorCodeWrongPhase {
		t.Errorf("review with nothing to override: %v", err)
	}
}

func TestReviewPausesTheClock(t *testing.T) {
	f := atClueEnd(t, "oxygen", "")
	left := f.g.Deadline().Sub(f.now) - 2*time.Second
	f.now = f.now.Add(2 * time.Second)
	f.must(f.g.Review(f.now, host, true))
	if !f.g.Deadline().IsZero() {
		t.Fatalf("the clock still runs: %v", f.g.Deadline())
	}
	rc := last[contracts.OverrideReviewChanged](t, f)
	if !rc.Open || len(rc.UserIds) != 1 || string(rc.UserIds[0]) != bob || rc.DeadlineAt != nil {
		t.Errorf("review opened %+v", rc)
	}
	if err := f.do(f.g.Review(f.now, host, true)); !errors.Is(err, ErrIgnored) {
		t.Errorf("opened twice: %v", err)
	}

	f.now = f.now.Add(time.Minute)
	f.take(f.g.Timeout(f.now))
	if f.g.step != stepClueEnd {
		t.Fatal("the screen moved on while the host was reviewing")
	}
	f.must(f.g.Review(f.now, host, false))
	if want := f.now.Add(left); !f.g.Deadline().Equal(want) {
		t.Errorf("deadline %v, want %v (the 4 s that were left)", f.g.Deadline(), want)
	}
	if rc := last[contracts.OverrideReviewChanged](t, f); rc.Open || rc.DeadlineAt == nil {
		t.Errorf("review closed %+v", rc)
	}
}

func TestHostDeviceLeavingClosesTheReview(t *testing.T) {
	f := atClueEnd(t, "oxygen", "")
	f.now = f.now.Add(time.Second)
	f.must(f.g.Review(f.now, host, true))
	f.take(f.g.Disconnect(f.now, host))
	if f.g.reviewing {
		t.Fatal("still reviewing while paused")
	}
	if rc := last[contracts.OverrideReviewChanged](t, f); rc.Open {
		t.Error("the review should close for everyone")
	}
	f.now = f.now.Add(time.Minute)
	f.take(f.g.Connect(f.now, host))
	if want := f.now.Add(ClueEndPause - time.Second); !f.g.Deadline().Equal(want) {
		t.Errorf("deadline %v, want the 5 s that were left", f.g.Deadline())
	}
}

func TestDailyDoubleOverrideKeepsControl(t *testing.T) {
	f := setup(t, ddBoard)
	f.must(f.g.Pick(f.now, alice, "s1"))
	f.must(f.g.Wager(f.now, alice, 300))
	f.toDeadline()
	f.must(f.g.ReadingDone(f.now, host, "s1"))
	f.must(f.g.Answer(f.now, alice, "s1", "nitrous"))
	if f.g.Scores()[alice] != -300 {
		t.Fatalf("score %d", f.g.Scores()[alice])
	}
	f.must(f.g.Override(f.now, host, answerOf(t, f, alice), true))
	if f.g.Scores()[alice] != 300 || f.g.Controller() != alice {
		t.Errorf("scores %v, control %s", f.g.Scores(), f.g.Controller())
	}
	if vo := last[contracts.VerdictOverridden](t, f); vo.ScoreDelta != 300 {
		t.Errorf("the wager is the amount: %+v", vo)
	}
}

func TestFinalRevealOverride(t *testing.T) {
	f := setup(t, atFinal(map[string]int{alice: 1000, bob: 400}))
	f.must(f.g.Wager(f.now, alice, 500))
	f.must(f.g.Wager(f.now, bob, 300))
	f.toDeadline() // title done: everyone locked, the clue comes up
	f.must(f.g.TypedAnswer(f.now, alice, "f", "krakatoa"))
	f.must(f.g.TypedAnswer(f.now, bob, "f", "crakatoe island volcano"))
	if f.g.Phase() != contracts.GamePhaseFinalReveal {
		t.Fatalf("phase %s", f.g.Phase())
	}
	// Bob (lowest) is on the stage.
	bobsAnswer := answerOf(t, f, bob)
	if f.g.Scores()[bob] != 100 {
		t.Fatalf("bob %d", f.g.Scores()[bob])
	}
	control := f.g.Controller()
	f.must(f.g.Review(f.now, host, true))
	f.must(f.g.Override(f.now, host, bobsAnswer, true))
	f.must(f.g.Review(f.now, host, false))
	if f.g.Scores()[bob] != 700 || f.g.Controller() != control {
		t.Errorf("scores %v, control %s (Final never moves control)", f.g.Scores(), f.g.Controller())
	}
	f.toDeadline() // Alice's turn
	if err := f.do(f.g.Override(f.now, host, bobsAnswer, false)); code(err) != contracts.ErrorCodeUnknownAnswer {
		t.Errorf("Bob's answer after the reveal moved on: %v", err)
	}
	f.toDeadline() // correct response
	f.toDeadline() // finished
	for _, r := range all[contracts.GameOver](f) {
		for _, res := range r.Results {
			if res.UserId == contracts.Uuid(bob) && res.Score != 700 {
				t.Errorf("game over has bob at %d", res.Score)
			}
		}
	}
}

func TestSnapshotListsOverridableAnswersForTheTVOnly(t *testing.T) {
	f := atClueEnd(t, "oxygen", "")
	f.must(f.g.Review(f.now, host, true))
	var tv, phone contracts.RoomSnapshot
	f.g.SnapshotFields(&tv, true)
	f.g.SnapshotFields(&phone, false)
	if len(tv.ClueAnswers) != 1 || tv.ClueAnswers[0].Answer != "oxygen" || tv.OverrideReview == nil || !*tv.OverrideReview {
		t.Errorf("TV snapshot %+v %v", tv.ClueAnswers, tv.OverrideReview)
	}
	if len(phone.ClueAnswers) != 0 || phone.OverrideReview == nil || !*phone.OverrideReview {
		t.Errorf("phone snapshot %+v %v", phone.ClueAnswers, phone.OverrideReview)
	}
}

func TestGameOverCarriesTheGamesTimes(t *testing.T) {
	start := t0.Add(-41 * time.Minute)
	f := setup(t, func(s *Setup) {
		for i := range s.Board[:3] {
			s.Board[i].State = contracts.ClueStateAnswered // only d2 is left, and no Final
		}
		s.StartedAt = start
	})
	f.openBuzzing("d2")
	f.toDeadline() // nobody buzzes
	f.toDeadline() // the correct response, then the game ends
	over := last[contracts.GameOver](t, f)
	if over.StartedAt == nil || *over.StartedAt != int(start.UnixMilli()) {
		t.Errorf("startedAt %v", over.StartedAt)
	}
	if over.FinishedAt == nil || *over.FinishedAt != int(f.now.UnixMilli()) {
		t.Errorf("finishedAt %v", over.FinishedAt)
	}
}
