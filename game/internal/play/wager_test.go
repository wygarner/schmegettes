package play

import (
	"encoding/json"
	"errors"
	"strings"
	"testing"
	"time"

	"schmegettes/game/internal/contracts"
)

func finalClue() *Clue {
	return &Clue{ID: "f", Round: contracts.RoundFinal, Category: "ISLANDS",
		Text: "This volcano erupted in 1883", Response: "Krakatoa", State: contracts.ClueStateUnplayed}
}

// ddBoard makes s1 (Single, $200) a Daily Double; the Single top value is $400.
func ddBoard(s *Setup) {
	s.Board[0].DailyDouble = true
}

// atFinal is a game whose boards are done, so it opens on Final when the TV connects.
func atFinal(scores map[string]int) func(*Setup) {
	return func(s *Setup) {
		for i := range s.Board {
			s.Board[i].State = contracts.ClueStateAnswered
		}
		s.Final = finalClue()
		s.Scores = scores
	}
}

// all returns every broadcast's All copy of type T, in order.
func all[T any](f *fixture) []T {
	var out []T
	for _, b := range f.sent {
		if m, ok := b.All.(T); ok {
			out = append(out, m)
		}
	}
	return out
}

func last[T any](t *testing.T, f *fixture) T {
	t.Helper()
	ms := all[T](f)
	if len(ms) == 0 {
		var zero T
		t.Fatalf("no %T sent", zero)
	}
	return ms[len(ms)-1]
}

func recs(f *fixture, kind RecordKind) []Record {
	var out []Record
	for _, r := range f.recs {
		if r.Kind == kind {
			out = append(out, r)
		}
	}
	return out
}

// shared is every byte any socket other than the owner of a private copy would get: the All
// and Host copies.
func shared(t *testing.T, bs []Broadcast) string {
	t.Helper()
	var b strings.Builder
	for _, m := range bs {
		for _, v := range []any{m.All, m.Host} {
			if v == nil {
				continue
			}
			data, err := json.Marshal(v)
			if err != nil {
				t.Fatal(err)
			}
			b.Write(data)
		}
	}
	return b.String()
}

func TestDailyDoubleWagerAndAnswer(t *testing.T) {
	f := setup(t, ddBoard)
	f.must(f.g.Pick(f.now, alice, "s1"))
	if f.g.Phase() != contracts.GamePhaseDailyDoubleWager {
		t.Fatalf("phase %s", f.g.Phase())
	}
	pc := last[contracts.PhaseChanged](t, f)
	if pc.ActiveClue == nil || pc.ActiveClue.DailyDouble == nil || !*pc.ActiveClue.DailyDouble {
		t.Error("the active clue isn't marked as a Daily Double")
	}
	if *pc.WagerMin != 5 || *pc.WagerMax != 400 {
		t.Errorf("range %d–%d, want 5–400 (Alice has $0; the Single top value is $400)", *pc.WagerMin, *pc.WagerMax)
	}
	if !f.g.Deadline().Equal(f.now.Add(DDReveal + WagerWindow)) {
		t.Errorf("deadline %v", f.g.Deadline())
	}

	if err := f.do(f.g.Wager(f.now, bob, 100)); code(err) != contracts.ErrorCodeNotYourTurn {
		t.Errorf("bob wagered on Alice's Daily Double: %v", err)
	}
	for _, bad := range []int{4, 401, 0} {
		if err := f.do(f.g.Wager(f.now, alice, bad)); code(err) != contracts.ErrorCodeInvalidWager {
			t.Errorf("wager %d: %v", bad, err)
		}
	}
	f.must(f.g.Wager(f.now, alice, 400))
	if err := f.do(f.g.Wager(f.now, alice, 300)); !errors.Is(err, ErrIgnored) {
		t.Errorf("a second wager: %v", err)
	}
	wl := last[contracts.WagerLocked](t, f)
	if wl.Amount == nil || *wl.Amount != 400 {
		t.Error("a Daily Double wager is public")
	}
	if r := recs(f, RecordWager); len(r) != 1 || r[0].Amount != 400 || r[0].UserID != alice {
		t.Errorf("wager records %+v", r)
	}

	f.toDeadline() // "Alice wagers $400"
	if f.g.Phase() != contracts.GamePhaseClueReading {
		t.Fatalf("phase %s", f.g.Phase())
	}
	if err := f.do(f.g.Buzz(f.now, bob, "s1")); !errors.Is(err, ErrIgnored) {
		t.Errorf("a buzz on a Daily Double: %v", err)
	}
	f.must(f.g.ReadingDone(f.now, host, "s1"))
	if f.g.Phase() != contracts.GamePhaseAnswering || f.g.answering != alice {
		t.Fatalf("phase %s, answering %q", f.g.Phase(), f.g.answering)
	}
	f.must(f.g.Answer(f.now, alice, "s1", "what is nitrogen"))
	aj := last[contracts.AnswerJudged](t, f)
	if aj.ScoreDelta != 400 || aj.Wager == nil || *aj.Wager != 400 {
		t.Errorf("judged %+v", aj)
	}
	if f.g.Scores()[alice] != 400 || f.g.Controller() != alice {
		t.Errorf("scores %v, control %s", f.g.Scores(), f.g.Controller())
	}
}

func TestDailyDoubleRangeFollowsScore(t *testing.T) {
	for _, tc := range []struct {
		score, max int
	}{{-1000, 400}, {0, 400}, {1200, 1200}} {
		f := setup(t, func(s *Setup) {
			ddBoard(s)
			s.Scores = map[string]int{alice: tc.score}
		})
		f.must(f.g.Pick(f.now, alice, "s1"))
		if got := *last[contracts.PhaseChanged](t, f).WagerMax; got != tc.max {
			t.Errorf("score %d: max %d, want %d", tc.score, got, tc.max)
		}
	}
}

func TestDailyDoubleDefaultsAndMisses(t *testing.T) {
	f := setup(t, ddBoard)
	f.must(f.g.Pick(f.now, alice, "s1"))
	f.toDeadline() // no wager: $5
	if wl := last[contracts.WagerLocked](t, f); *wl.Amount != MinDDWager {
		t.Errorf("default wager %d", *wl.Amount)
	}
	f.toDeadline() // shown
	f.toDeadline() // reading
	if f.g.answering != alice {
		t.Fatal("the picker should answer after the reading")
	}
	// Alice drops: her window keeps running, and silence costs the wager.
	f.take(f.g.Disconnect(f.now, alice))
	if f.g.answering != alice {
		t.Fatal("a Daily Double answerer who disconnects keeps the floor")
	}
	f.toDeadline()
	if f.g.Scores()[alice] != -5 {
		t.Errorf("score %d, want -5", f.g.Scores()[alice])
	}
	if f.g.step != stepClueEnd {
		t.Errorf("a missed Daily Double should end, not reopen (step %d)", f.g.step)
	}
	if f.g.Controller() != alice {
		t.Error("the picker keeps control after a miss")
	}
}

func TestDailyDoublePauseKeepsWagerTime(t *testing.T) {
	f := setup(t, ddBoard)
	f.must(f.g.Pick(f.now, alice, "s1"))
	f.now = f.now.Add(10 * time.Second)
	f.take(f.g.Disconnect(f.now, host))
	if !f.g.Deadline().IsZero() {
		t.Fatal("timers run while paused")
	}
	f.now = f.now.Add(time.Minute)
	f.take(f.g.Connect(f.now, host))
	if want := f.now.Add(DDReveal + WagerWindow - 10*time.Second); !f.g.Deadline().Equal(want) {
		t.Errorf("deadline %v, want %v", f.g.Deadline(), want)
	}
	f.must(f.g.Wager(f.now, alice, 50))
}

func TestFinalSkippedWhenNobodyIsAboveZero(t *testing.T) {
	f := setup(t, func(s *Setup) {
		for i := range s.Board {
			if s.Board[i].ID != "d2" {
				s.Board[i].State = contracts.ClueStateAnswered
			}
		}
		s.Final = finalClue()
		s.Scores = map[string]int{alice: 0, bob: -200}
	})
	f.openBuzzing("d2")
	f.toDeadline() // nobody buzzes
	f.toDeadline() // correct response
	if !f.g.Over() {
		t.Fatalf("phase %s", f.g.Phase())
	}
	over := last[contracts.GameOver](t, f)
	if over.FinalSkipped == nil || !*over.FinalSkipped {
		t.Error("finalSkipped not set")
	}
	for _, r := range recs(f, RevealClue) {
		if r.ClueID == "f" {
			t.Error("a skipped Final must stay unseen")
		}
	}
}

func TestFinalFlow(t *testing.T) {
	f := setup(t, atFinal(map[string]int{alice: 1000, bob: 400}))
	if f.g.Phase() != contracts.GamePhaseFinalCategory {
		t.Fatalf("phase %s", f.g.Phase())
	}
	pc := last[contracts.PhaseChanged](t, f)
	if len(pc.FinalistUserIds) != 2 {
		t.Errorf("finalists %v", pc.FinalistUserIds)
	}
	start := len(f.sent)

	// The title stays up 3 s, whatever the speech does.
	f.must(f.g.ReadingDone(f.now, host, "f"))
	if f.g.Phase() != contracts.GamePhaseFinalCategory || !f.g.Deadline().Equal(f.now.Add(FinalTitle)) {
		t.Fatalf("early reading_done: phase %s, deadline %v", f.g.Phase(), f.g.Deadline())
	}

	// Wagers: secret, in range, finalists only.
	if err := f.do(f.g.Wager(f.now, alice, 1001)); code(err) != contracts.ErrorCodeInvalidWager {
		t.Errorf("over her score: %v", err)
	}
	if err := f.do(f.g.Wager(f.now, host, 10)); code(err) != contracts.ErrorCodeNotAFinalist {
		t.Errorf("the host device wagered: %v", err)
	}
	f.must(f.g.Wager(f.now, alice, 700))
	b := f.sent[len(f.sent)-1]
	if mine, ok := b.Private[alice].(contracts.WagerLocked); !ok || mine.Amount == nil || *mine.Amount != 700 {
		t.Errorf("Alice's copy should carry her wager: %+v", b.Private)
	}
	f.toDeadline() // title done
	if f.g.Phase() != contracts.GamePhaseFinalWager {
		t.Fatalf("phase %s", f.g.Phase())
	}
	if got := last[contracts.PhaseChanged](t, f).LockedUserIds; len(got) != 1 || string(got[0]) != alice {
		t.Errorf("locked %v", got)
	}
	f.must(f.g.Wager(f.now, bob, 400)) // everyone locked: the clue comes up
	if f.g.Phase() != contracts.GamePhaseFinalAnswer {
		t.Fatalf("phase %s", f.g.Phase())
	}
	if r := recs(f, RevealClue); len(r) != 1 || r[0].ClueID != "f" {
		t.Errorf("reveal records %+v", r)
	}
	host := f.sent[len(f.sent)-1].Host.(contracts.PhaseChanged)
	if host.ActiveClue.ClueText == nil {
		t.Error("the TV should get the Final clue text")
	}

	// Answers: typed only; a draft counts when time runs out.
	if err := f.do(f.g.Answer(f.now, alice, "f", "krakatoa")); code(err) != contracts.ErrorCodeWrongPhase {
		t.Errorf("a voice answer in Final: %v", err)
	}
	f.must(f.g.Progress(f.now, bob, "what is krakatoa"))
	f.must(f.g.TypedAnswer(f.now, alice, "f", "what is krakatowa"))
	if err := f.do(f.g.TypedAnswer(f.now, alice, "f", "changed")); !errors.Is(err, ErrIgnored) {
		t.Errorf("a second submission: %v", err)
	}
	f.toDeadline() // reading done
	f.toDeadline() // 30 s: Bob's draft is submitted

	before := f.sent[start:]
	for i, m := range before {
		if _, ok := m.All.(contracts.AnswerJudged); ok {
			before = before[:i]
			break
		}
	}
	if leak := shared(t, before); strings.Contains(leak, "krakato") || strings.Contains(leak, `"amount"`) {
		t.Errorf("a Final wager or answer reached a shared copy: %s", leak)
	}

	// Reveal: lowest score first.
	if f.g.Phase() != contracts.GamePhaseFinalReveal {
		t.Fatalf("phase %s", f.g.Phase())
	}
	if order := last[contracts.PhaseChanged](t, f).RevealOrder; len(order) != 2 || string(order[0]) != bob {
		t.Errorf("reveal order %v", order)
	}
	first := last[contracts.AnswerJudged](t, f)
	if string(first.UserId) != bob || first.Answer != "what is krakatoa" || first.ScoreDelta != 400 || *first.Wager != 400 {
		t.Errorf("first reveal %+v", first)
	}
	f.toDeadline()
	second := last[contracts.AnswerJudged](t, f)
	if string(second.UserId) != alice || second.ScoreDelta != 700 {
		t.Errorf("second reveal %+v (a typo is judged generously)", second)
	}
	f.toDeadline() // correct response on the TV
	f.toDeadline()
	if !f.g.Over() {
		t.Fatalf("phase %s", f.g.Phase())
	}
	if s := f.g.Scores(); s[alice] != 1700 || s[bob] != 800 {
		t.Errorf("scores %v", s)
	}
	for _, r := range recs(f, RecordAnswer) {
		if r.ClueID == "f" && r.Source != contracts.AnswerSourceTyped {
			t.Errorf("a Final answer recorded as %s", r.Source)
		}
	}
	if r := recs(f, EndGame); len(r) != 1 {
		t.Error("the game should end once")
	}
}

func TestFinalDefaults(t *testing.T) {
	f := setup(t, atFinal(map[string]int{alice: 500, bob: 500}))
	f.toDeadline() // category
	f.must(f.g.Wager(f.now, bob, 300))
	f.toDeadline() // Alice never wagers: $0
	f.toDeadline() // reading
	f.toDeadline() // nobody answers
	if order := last[contracts.PhaseChanged](t, f).RevealOrder; string(order[0]) != alice {
		t.Errorf("a tie reveals in join order: %v", order)
	}
	f.toDeadline()
	if s := f.g.Scores(); s[alice] != 500 || s[bob] != 200 {
		t.Errorf("scores %v: a $0 wager changes nothing; no answer costs the wager", s)
	}
}

func TestTypedAnswersOnlyInFinal(t *testing.T) {
	f := setup(t, nil)
	f.openBuzzing("s1")
	if err := f.do(f.g.TypedAnswer(f.now, alice, "s1", "nitrogen")); code(err) != contracts.ErrorCodeWrongPhase {
		t.Errorf("typed answer on a regular clue: %v", err)
	}
}

func TestPlayingHostNeverGetsAPrivateCopy(t *testing.T) {
	f := setup(t, func(s *Setup) {
		atFinal(map[string]int{host: 900, alice: 400})(s)
		s.Players = []Player{{host, "Wyatt"}, {alice, "Alice"}}
	})
	f.must(f.g.Wager(f.now, host, 600))
	if b := f.sent[len(f.sent)-1]; b.Private != nil {
		t.Errorf("the host device got a private copy: %+v", b.Private)
	}
	var snap contracts.RoomSnapshot
	f.g.PrivateSnapshot(&snap, host)
	if snap.MyWager != nil {
		t.Error("the host device's snapshot carries the host's Final wager")
	}
	f.g.PrivateSnapshot(&snap, alice)
	if snap.MyWager != nil {
		t.Error("Alice hasn't wagered")
	}
}

func TestFinalPauseKeepsTime(t *testing.T) {
	f := setup(t, atFinal(map[string]int{alice: 500, bob: 500}))
	f.toDeadline() // into the wager
	f.now = f.now.Add(20 * time.Second)
	f.take(f.g.Disconnect(f.now, host))
	f.now = f.now.Add(time.Hour)
	f.take(f.g.Connect(f.now, host))
	if want := f.now.Add(10 * time.Second); !f.g.Deadline().Equal(want) {
		t.Errorf("deadline %v, want %v", f.g.Deadline(), want)
	}
}

func TestFinalRecovery(t *testing.T) {
	scores := map[string]int{alice: 1000, bob: 400}
	tests := []struct {
		name  string
		edit  func(*Setup)
		phase contracts.GamePhase
		check func(*testing.T, *fixture)
	}{
		{"category", func(*Setup) {}, contracts.GamePhaseFinalCategory, nil},
		{"some wagers", func(s *Setup) { s.FinalWagers = map[string]int{alice: 700} }, contracts.GamePhaseFinalWager,
			func(t *testing.T, f *fixture) {
				if !f.g.finalLocked[alice] || f.g.finalLocked[bob] {
					t.Error("locks not restored")
				}
			}},
		{"answering", func(s *Setup) {
			s.Final.State = contracts.ClueStateActive
			s.FinalWagers = map[string]int{alice: 700, bob: 400}
			s.FinalAnswers = map[string]string{alice: "krakatoa"}
		}, contracts.GamePhaseFinalAnswer, func(t *testing.T, f *fixture) {
			if !f.g.submitted[alice] || f.g.submitted[bob] {
				t.Error("submissions not restored")
			}
		}},
		{"mid reveal", func(s *Setup) {
			s.Final.State = contracts.ClueStateActive
			s.FinalWagers = map[string]int{alice: 700, bob: 400}
			s.FinalAnswers = map[string]string{alice: "krakatoa", bob: "etna"}
			s.FinalDeltas = map[string]int{bob: -400}
			s.Scores = map[string]int{alice: 1000, bob: 0}
		}, contracts.GamePhaseFinalReveal, func(t *testing.T, f *fixture) {
			if !f.g.isFinal[bob] {
				t.Error("Bob was a finalist before his reveal took him to $0")
			}
			f.toDeadline() // reveal resumes at once with Alice
			aj := last[contracts.AnswerJudged](t, f)
			if string(aj.UserId) != alice || aj.ScoreDelta != 700 {
				t.Errorf("resumed reveal %+v", aj)
			}
		}},
		{"done", func(s *Setup) { s.Final.State = contracts.ClueStateAnswered }, contracts.GamePhaseFinished, nil},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			f := setup(t, func(s *Setup) {
				atFinal(scores)(s)
				tc.edit(s)
			})
			if f.g.Phase() != tc.phase {
				t.Fatalf("phase %s, want %s", f.g.Phase(), tc.phase)
			}
			if tc.check != nil {
				tc.check(t, f)
			}
		})
	}
}

func TestDailyDoubleRecovery(t *testing.T) {
	f := setup(t, func(s *Setup) {
		ddBoard(s)
		s.Board[0].State = contracts.ClueStateActive
		s.ActiveClueID = "s1"
	})
	if f.g.Phase() != contracts.GamePhaseDailyDoubleWager {
		t.Fatalf("no wager yet: phase %s", f.g.Phase())
	}
	w := 300
	f = setup(t, func(s *Setup) {
		ddBoard(s)
		s.Board[0].State = contracts.ClueStateActive
		s.ActiveClueID = "s1"
		s.Scores = map[string]int{alice: 600}
		s.LastCorrect = alice
		s.DDWager = &w
	})
	if f.g.Phase() != contracts.GamePhaseClueReading || f.g.ddWager != 300 {
		t.Fatalf("phase %s, wager %d", f.g.Phase(), f.g.ddWager)
	}
	f.toDeadline()
	if f.g.answering != alice {
		t.Error("the picker answers after the re-read")
	}
}
