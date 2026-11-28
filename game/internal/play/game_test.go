package play

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"testing"
	"time"

	"schmegettes/game/internal/contracts"
)

const (
	room  = "6f0d2a5e-8a0b-4c39-9a4e-2d1f0b7a9c11"
	host  = "host"
	alice = "alice"
	bob   = "bob"
	carol = "carol"
)

var t0 = time.Unix(1_800_000_000, 0)

// board: 2 categories × 1 clue per round, so rounds end quickly.
func board() []Clue {
	return []Clue{
		{ID: "s1", Round: contracts.RoundSingle, Col: 0, Row: 0, Category: "SCIENCE", Value: 200, Text: "This gas makes up 78% of the air", Response: "Nitrogen", State: contracts.ClueStateUnplayed},
		{ID: "s2", Round: contracts.RoundSingle, Col: 1, Row: 0, Category: "CAPITALS", Value: 400, Text: "France's capital", Response: "Paris", State: contracts.ClueStateUnplayed},
		{ID: "d1", Round: contracts.RoundDouble, Col: 0, Row: 0, Category: "OPERA", Value: 800, Text: "Verdi's Egyptian opera", Response: "Aida", State: contracts.ClueStateUnplayed},
		{ID: "d2", Round: contracts.RoundDouble, Col: 1, Row: 0, Category: "RHYME", Value: 1000, Text: "A fat cat", Response: "fat cat", State: contracts.ClueStateUnplayed},
	}
}

type fixture struct {
	t    *testing.T
	g    *Game
	now  time.Time
	seq  int
	sent []Broadcast
	recs []Record
}

func setup(t *testing.T, edit func(*Setup)) *fixture {
	t.Helper()
	f := &fixture{t: t, now: t0}
	ids := 0
	s := Setup{
		RoomID: room, GameID: "g1", HostID: host,
		Players: []Player{{alice, "Alice"}, {bob, "Bob"}},
		Board:   board(),
		NextSeq: func() int { f.seq++; return f.seq },
		NewID:   func() string { ids++; return fmt.Sprintf("answer-%d", ids) },
		Pick:    func(int) int { return 0 }, // Alice opens
	}
	if edit != nil {
		edit(&s)
	}
	f.g = New(s)
	for _, u := range []string{host, alice, bob} {
		f.take(f.g.Connect(f.now, u))
	}
	return f
}

func (f *fixture) take(e Effects) Effects {
	f.sent = append(f.sent, e.Broadcasts...)
	f.recs = append(f.recs, e.Records...)
	return e
}

func (f *fixture) do(e Effects, err error) error {
	f.take(e)
	return err
}

func (f *fixture) must(e Effects, err error) {
	f.t.Helper()
	if err := f.do(e, err); err != nil {
		f.t.Fatalf("unexpected %v", err)
	}
}

// toDeadline jumps to the pending deadline and fires it.
func (f *fixture) toDeadline() {
	f.t.Helper()
	if f.g.Deadline().IsZero() {
		f.t.Fatal("no deadline pending")
	}
	f.now = f.g.Deadline()
	f.take(f.g.Timeout(f.now))
}

func (f *fixture) openBuzzing(clue string) {
	f.t.Helper()
	f.must(f.g.Pick(f.now, f.g.control, clue))
	f.pastReveal()
	f.must(f.g.ReadingDone(f.now, host, clue))
}

// pastReveal moves the clock to the end of the pick reveal, as the TV would.
func (f *fixture) pastReveal() {
	if f.g.revealUntil.After(f.now) {
		f.now = f.g.revealUntil
	}
}

func code(err error) contracts.ErrorCode {
	var r *Reject
	if errors.As(err, &r) {
		return r.Code
	}
	return ""
}

func TestPickRules(t *testing.T) {
	f := setup(t, nil)
	if f.g.control != alice {
		t.Fatalf("opening controller %q", f.g.control)
	}
	if err := f.do(f.g.Pick(f.now, bob, "s1")); code(err) != contracts.ErrorCodeNotInControl {
		t.Errorf("bob picked: %v", err)
	}
	if err := f.do(f.g.Pick(f.now, alice, "d1")); !errors.Is(err, ErrIgnored) {
		t.Errorf("picked a Double clue in Single: %v", err)
	}
	f.must(f.g.Pick(f.now, alice, "s1"))
	if f.recs[0].Kind != RevealClue || f.recs[0].ClueID != "s1" {
		t.Errorf("reveal not recorded: %+v", f.recs)
	}
	if err := f.do(f.g.Pick(f.now, host, "s2")); !errors.Is(err, ErrIgnored) {
		t.Errorf("a second pick should be ignored: %v", err)
	}
}

func TestHostPicksOnlyWithControl(t *testing.T) {
	f := setup(t, nil)
	if err := f.do(f.g.Pick(f.now, host, "s2")); code(err) != contracts.ErrorCodeNotInControl {
		t.Errorf("the host device picked for Alice: %v", err)
	}
	// A playing host who has control picks like anyone else.
	f = setup(t, func(s *Setup) { s.Players = []Player{{host, "Wyatt"}, {alice, "Alice"}} })
	f.must(f.g.Pick(f.now, host, "s2"))
	if f.g.Phase() != contracts.GamePhaseClueReading {
		t.Errorf("phase %s", f.g.Phase())
	}
}

func TestReadingOpensBuzzing(t *testing.T) {
	t.Run("host reports speech ended", func(t *testing.T) {
		f := setup(t, nil)
		f.must(f.g.Pick(f.now, alice, "s1"))
		f.pastReveal()
		if err := f.do(f.g.ReadingDone(f.now, alice, "s1")); code(err) != contracts.ErrorCodeNotHost {
			t.Errorf("a contestant ended reading: %v", err)
		}
		f.must(f.g.ReadingDone(f.now, host, "s1"))
		if f.g.Phase() != contracts.GamePhaseBuzzingOpen || f.g.Deadline() != f.now.Add(BuzzWindow) {
			t.Errorf("phase %s deadline %v", f.g.Phase(), f.g.Deadline())
		}
	})
	t.Run("fallback timer", func(t *testing.T) {
		f := setup(t, nil)
		f.must(f.g.Pick(f.now, alice, "s1"))
		want := PickReveal + ReadingTime(board()[0].Text)
		if got := f.g.Deadline().Sub(f.now); got != want {
			t.Errorf("reading deadline %v, want %v", got, want)
		}
		f.toDeadline()
		if f.g.Phase() != contracts.GamePhaseBuzzingOpen {
			t.Errorf("phase %s", f.g.Phase())
		}
	})
}

func TestReadingTime(t *testing.T) {
	if got := ReadingTime("one two three four five"); got != 3*time.Second {
		t.Errorf("5 words: %v", got)
	}
	if got := ReadingTime(strings.Repeat("word ", 100)); got != MaxReading || MaxReading != 14*time.Second {
		t.Errorf("long clue: %v", got)
	}
}

func TestTimings(t *testing.T) {
	if BuzzWindow != 9*time.Second || AnswerWindow != 9*time.Second || ClueEndPause != 6*time.Second || ControlGrace != 10*time.Second {
		t.Errorf("buzz %v, answer %v, clue end %v, grace %v", BuzzWindow, AnswerWindow, ClueEndPause, ControlGrace)
	}
}

// three: Alice, Bob, and Carol in join order, all connected, Alice in control.
func three(t *testing.T) *fixture {
	f := setup(t, func(s *Setup) { s.Players = append(s.Players, Player{carol, "Carol"}) })
	f.take(f.g.Connect(f.now, carol))
	return f
}

func (f *fixture) controllerSent() string {
	f.t.Helper()
	for i := len(f.sent) - 1; i >= 0; i-- {
		if m, ok := f.sent[i].All.(contracts.PhaseChanged); ok && m.ControllingUserId != nil {
			return string(*m.ControllingUserId)
		}
	}
	return ""
}

func TestControlHandoff(t *testing.T) {
	t.Run("controller gone 10 s: next connected in join order", func(t *testing.T) {
		f := three(t)
		f.take(f.g.Disconnect(f.now, alice))
		if got := f.g.Deadline(); got != f.now.Add(ControlGrace) {
			t.Fatalf("handoff at %v", got)
		}
		f.take(f.g.Disconnect(f.now.Add(time.Second), bob)) // skipped: offline too
		f.toDeadline()
		if f.g.control != carol || f.controllerSent() != carol {
			t.Errorf("control %q, sent %q", f.g.control, f.controllerSent())
		}
		if !f.g.Deadline().IsZero() {
			t.Errorf("deadline left %v", f.g.Deadline())
		}
	})
	t.Run("wraps past the end of join order", func(t *testing.T) {
		f := three(t)
		f.g.control = carol
		f.take(f.g.Disconnect(f.now, carol))
		f.toDeadline()
		if f.g.control != alice {
			t.Errorf("control %q", f.g.control)
		}
	})
	t.Run("back within 10 s keeps control", func(t *testing.T) {
		f := three(t)
		f.take(f.g.Disconnect(f.now, alice))
		f.take(f.g.Connect(f.now.Add(9*time.Second), alice))
		if !f.g.Deadline().IsZero() {
			t.Errorf("still armed: %v", f.g.Deadline())
		}
		if f.g.control != alice {
			t.Errorf("control %q", f.g.control)
		}
	})
	t.Run("lost control isn't given back", func(t *testing.T) {
		f := three(t)
		f.take(f.g.Disconnect(f.now, alice))
		f.toDeadline()
		f.take(f.g.Connect(f.now, alice))
		if f.g.control != bob || !f.g.Deadline().IsZero() {
			t.Errorf("control %q deadline %v", f.g.control, f.g.Deadline())
		}
	})
	t.Run("nobody else connected: control stays until someone returns", func(t *testing.T) {
		f := setup(t, nil)
		f.take(f.g.Disconnect(f.now, bob))
		f.take(f.g.Disconnect(f.now, alice))
		f.toDeadline()
		if f.g.control != alice || !f.g.Deadline().IsZero() {
			t.Fatalf("control %q deadline %v", f.g.control, f.g.Deadline())
		}
		f.take(f.g.Connect(f.now, bob))
		if f.g.Deadline() != f.now.Add(ControlGrace) {
			t.Fatalf("not re-armed: %v", f.g.Deadline())
		}
		f.toDeadline()
		if f.g.control != bob {
			t.Errorf("control %q", f.g.control)
		}
	})
	t.Run("not while paused; resume re-arms", func(t *testing.T) {
		f := setup(t, nil)
		f.take(f.g.Disconnect(f.now, alice))
		f.take(f.g.Disconnect(f.now, host))
		if !f.g.Deadline().IsZero() {
			t.Fatalf("armed while paused: %v", f.g.Deadline())
		}
		f.now = f.now.Add(time.Minute)
		f.take(f.g.Connect(f.now, host))
		if f.g.Deadline() != f.now.Add(ControlGrace) {
			t.Errorf("not re-armed on resume: %v", f.g.Deadline())
		}
	})
	t.Run("not during a clue; armed when the board returns", func(t *testing.T) {
		f := setup(t, nil)
		f.openBuzzing("s1")
		f.take(f.g.Disconnect(f.now, alice))
		if f.g.Deadline() != f.now.Add(BuzzWindow) {
			t.Fatalf("deadline %v", f.g.Deadline())
		}
		f.toDeadline() // nobody buzzed: clue ends
		f.toDeadline() // back to the board
		if f.g.Phase() != contracts.GamePhaseBoard || f.g.Deadline() != f.now.Add(ControlGrace) {
			t.Fatalf("phase %s deadline %v", f.g.Phase(), f.g.Deadline())
		}
		f.toDeadline()
		if f.g.control != bob {
			t.Errorf("control %q", f.g.control)
		}
	})
	t.Run("a pick disarms", func(t *testing.T) {
		f := setup(t, nil)
		f.take(f.g.Disconnect(f.now, alice))
		f.take(f.g.Connect(f.now, alice))
		f.must(f.g.Pick(f.now, alice, "s1"))
		if f.g.Deadline() == f.now.Add(ControlGrace) {
			t.Errorf("handoff still pending")
		}
	})
}

func TestEarlyBuzzLockout(t *testing.T) {
	f := setup(t, nil)
	f.must(f.g.Pick(f.now, alice, "s1"))
	early := f.g.revealUntil.Add(-100 * time.Millisecond) // during the pick reveal
	f.must(f.g.Buzz(early, bob, "s1"))
	f.must(f.g.ReadingDone(f.g.revealUntil, host, "s1"))

	if err := f.do(f.g.Buzz(early.Add(249*time.Millisecond), bob, "s1")); !errors.Is(err, ErrIgnored) {
		t.Errorf("buzz inside the lockout: %v", err)
	}
	f.must(f.g.Buzz(early.Add(250*time.Millisecond), bob, "s1"))
	if f.g.answering != bob {
		t.Errorf("answering %q", f.g.answering)
	}
}

func TestFirstBuzzWins(t *testing.T) {
	f := setup(t, nil)
	f.openBuzzing("s1")
	f.must(f.g.Buzz(f.now, alice, "s1"))
	if err := f.do(f.g.Buzz(f.now.Add(time.Millisecond), bob, "s1")); !errors.Is(err, ErrIgnored) {
		t.Errorf("second buzz: %v", err)
	}
	if f.g.answering != alice || f.g.Phase() != contracts.GamePhaseAnswering {
		t.Errorf("answering %q phase %s", f.g.answering, f.g.Phase())
	}
	if f.g.Deadline() != f.now.Add(ListenWait+AnswerBegin+AnswerGrace) {
		t.Errorf("answer deadline %v", f.g.Deadline().Sub(f.now))
	}
}

func TestCorrectAnswerScoresAndTakesControl(t *testing.T) {
	f := setup(t, nil)
	f.openBuzzing("s1")
	f.must(f.g.Buzz(f.now, bob, "s1"))
	f.must(f.g.Answer(f.now, bob, "s1", "what is nitrogen"))
	if f.g.scores[bob] != 200 || f.g.control != bob {
		t.Errorf("score %d control %q", f.g.scores[bob], f.g.control)
	}
	last := f.recs[len(f.recs)-1]
	if last.Kind != FinishClue || last.State != contracts.ClueStateAnswered {
		t.Errorf("last record %+v", last)
	}
	f.toDeadline() // correct response shown for 3 s
	if f.g.Phase() != contracts.GamePhaseBoard {
		t.Errorf("phase %s", f.g.Phase())
	}
}

func TestWrongAnswerReopensForOthersOnly(t *testing.T) {
	f := setup(t, nil)
	f.openBuzzing("s1")
	f.must(f.g.Buzz(f.now, alice, "s1"))
	f.must(f.g.Answer(f.now, alice, "s1", "oxygen"))
	if f.g.scores[alice] != -200 || f.g.Phase() != contracts.GamePhaseBuzzingOpen {
		t.Fatalf("score %d phase %s", f.g.scores[alice], f.g.Phase())
	}
	if f.g.control != alice {
		t.Errorf("control moved on a wrong answer: %q", f.g.control)
	}
	if err := f.do(f.g.Buzz(f.now, alice, "s1")); code(err) != contracts.ErrorCodeAlreadyAttempted {
		t.Errorf("alice buzzed twice: %v", err)
	}
	f.must(f.g.Buzz(f.now, bob, "s1"))
	f.must(f.g.Answer(f.now, bob, "s1", "carbon"))
	// Everyone has tried: the clue ends unanswered and control stays.
	if f.g.step != stepClueEnd || f.g.clues["s1"].State != contracts.ClueStateUnanswered || f.g.control != alice {
		t.Errorf("step %d state %s control %q", f.g.step, f.g.clues["s1"].State, f.g.control)
	}
}

func TestSilenceIsWrong(t *testing.T) {
	f := setup(t, nil)
	f.openBuzzing("s1")
	f.must(f.g.Buzz(f.now, alice, "s1"))
	f.toDeadline()
	if f.g.scores[alice] != -200 {
		t.Errorf("score %d", f.g.scores[alice])
	}
	var answer Record
	for _, r := range f.recs {
		if r.Kind == RecordAnswer {
			answer = r
		}
	}
	if answer.Verdict != contracts.VerdictIncorrect || answer.Answer != "" {
		t.Errorf("recorded %+v", answer)
	}
}

func TestNoBuzzEndsUnanswered(t *testing.T) {
	f := setup(t, nil)
	f.openBuzzing("s1")
	f.toDeadline()
	if f.g.clues["s1"].State != contracts.ClueStateUnanswered || f.g.control != alice {
		t.Errorf("state %s control %q", f.g.clues["s1"].State, f.g.control)
	}
}

func TestDisconnectWhileAnsweringCostsNothing(t *testing.T) {
	f := setup(t, nil)
	f.openBuzzing("s1")
	f.must(f.g.Buzz(f.now, alice, "s1"))
	f.take(f.g.Disconnect(f.now, alice))
	if f.g.scores[alice] != 0 || !f.g.attempted[alice] || f.g.Phase() != contracts.GamePhaseBuzzingOpen {
		t.Errorf("score %d attempted %v phase %s", f.g.scores[alice], f.g.attempted[alice], f.g.Phase())
	}
	for _, r := range f.recs {
		if r.Kind == RecordAnswer {
			t.Errorf("an answer was recorded: %+v", r)
		}
	}
}

func TestHostPauseRereadsTheClue(t *testing.T) {
	f := setup(t, nil)
	f.openBuzzing("s1")
	f.must(f.g.Buzz(f.now, alice, "s1"))
	f.take(f.g.Disconnect(f.now, host))
	if !f.g.paused || !f.g.Deadline().IsZero() {
		t.Fatal("not paused")
	}
	if err := f.do(f.g.Answer(f.now, alice, "s1", "nitrogen")); !errors.Is(err, ErrIgnored) {
		t.Errorf("answer while paused: %v", err)
	}
	f.now = f.now.Add(10 * time.Minute)
	f.take(f.g.Connect(f.now, host))
	if f.g.paused || f.g.Phase() != contracts.GamePhaseClueReading {
		t.Fatalf("paused %v phase %s", f.g.paused, f.g.Phase())
	}
	if f.g.attempted[alice] {
		t.Error("a player cut off mid-answer should get to try again")
	}
}

func TestRoundsAndGameOver(t *testing.T) {
	f := setup(t, nil)
	play := func(clue, who, answer string) {
		f.t.Helper()
		f.openBuzzing(clue)
		f.must(f.g.Buzz(f.now, who, clue))
		f.must(f.g.Answer(f.now, who, clue, answer))
		f.toDeadline()
	}
	play("s1", alice, "nitrogen") // Alice 200
	// Bob misses s2. Buzzing reopens for Alice; play's last deadline closes it with no buzz,
	// so the clue now shows its correct response. The next deadline starts Double Schmegettes.
	play("s2", bob, "lyon") // Bob -400
	f.toDeadline()
	if f.g.step != stepInterstitial || f.g.round != contracts.RoundDouble {
		t.Fatalf("step %d round %s", f.g.step, f.g.round)
	}
	if f.g.control != bob {
		t.Errorf("Double should open with the lowest score (Bob), got %q", f.g.control)
	}
	f.toDeadline()
	if f.g.Phase() != contracts.GamePhaseBoard {
		t.Fatalf("phase %s", f.g.Phase())
	}
	play("d1", alice, "aida")  // Alice 1000
	play("d2", bob, "fat cat") // Bob 600
	if !f.g.Over() || f.g.Phase() != contracts.GamePhaseFinished {
		t.Fatalf("over %v phase %s", f.g.Over(), f.g.Phase())
	}
	if last := f.recs[len(f.recs)-1]; last.Kind != EndGame {
		t.Errorf("last record %+v", last)
	}
	res := f.g.Results()
	if res[0].UserId != alice || res[0].Score != 1000 || res[1].Score != 600 || res[1].Placement != 2 {
		t.Errorf("results %+v", res)
	}
}

func TestTiedPlacements(t *testing.T) {
	f := setup(t, func(s *Setup) {
		s.Players = append(s.Players, Player{"carol", "Carol"})
		s.Scores = map[string]int{alice: 400, bob: 400, "carol": 200}
	})
	res := f.g.Results()
	if res[0].Placement != 1 || res[1].Placement != 1 || res[2].Placement != 3 {
		t.Errorf("placements %+v", res)
	}
}

func TestRecoveryResumesTheActiveClue(t *testing.T) {
	b := board()
	b[0].State = contracts.ClueStateAnswered
	b[1].State = contracts.ClueStateActive
	f := setup(t, func(s *Setup) {
		s.Board = b
		s.Scores = map[string]int{alice: 200, bob: -400}
		s.LastCorrect = alice
		s.ActiveClueID = "s2"
		s.AttemptedByID = map[string]bool{bob: true}
	})
	if f.g.control != alice || f.g.scores[bob] != -400 {
		t.Errorf("control %q scores %v", f.g.control, f.g.scores)
	}
	if f.g.Phase() != contracts.GamePhaseClueReading || !f.g.attempted[bob] {
		t.Errorf("phase %s attempted %v", f.g.Phase(), f.g.attempted)
	}
	if err := f.do(f.g.Buzz(f.now, bob, "s2")); code(err) != contracts.ErrorCodeAlreadyAttempted {
		t.Errorf("bob buzzed again after recovery: %v", err)
	}
}

func TestPhonesNeverGetClueTextOrResponse(t *testing.T) {
	f := setup(t, nil)
	f.openBuzzing("s1")
	f.must(f.g.Buzz(f.now, alice, "s1"))
	f.must(f.g.Answer(f.now, alice, "s1", "nitrogen"))
	f.toDeadline()
	for _, b := range f.sent {
		data, _ := json.Marshal(b.All)
		for _, secret := range []string{"78% of the air", "Nitrogen"} {
			if strings.Contains(string(data), secret) {
				t.Errorf("phone copy contains %q: %s", secret, data)
			}
		}
	}
	// The TV does get them.
	var tv strings.Builder
	for _, b := range f.sent {
		if b.Host != nil {
			data, _ := json.Marshal(b.Host)
			tv.Write(data)
		}
	}
	if !strings.Contains(tv.String(), "78% of the air") || !strings.Contains(tv.String(), "Nitrogen") {
		t.Error("the TV never got the clue text and response")
	}
}

func TestProgressThrottle(t *testing.T) {
	f := setup(t, nil)
	f.openBuzzing("s1")
	f.must(f.g.Buzz(f.now, alice, "s1"))
	f.must(f.g.Progress(f.now, alice, "what"))
	if err := f.do(f.g.Progress(f.now.Add(100*time.Millisecond), alice, "what is")); !errors.Is(err, ErrIgnored) {
		t.Errorf("not throttled: %v", err)
	}
	f.must(f.g.Progress(f.now.Add(ProgressEvery), alice, "what is nit"))
	if err := f.do(f.g.Progress(f.now, bob, "x")); !errors.Is(err, ErrIgnored) {
		t.Errorf("a non-answerer streamed: %v", err)
	}
}

func TestSeqIsSharedByBothCopies(t *testing.T) {
	f := setup(t, nil)
	f.must(f.g.Pick(f.now, alice, "s1"))
	last := f.sent[len(f.sent)-1]
	a, h := last.All.(contracts.PhaseChanged), last.Host.(contracts.PhaseChanged)
	if a.Seq != h.Seq || a.Seq == 0 {
		t.Errorf("seq %d / %d", a.Seq, h.Seq)
	}
}

func TestPickReveal(t *testing.T) {
	t.Run("the pick's phase_changed carries the reveal; buzzing waits for it", func(t *testing.T) {
		f := setup(t, nil)
		f.must(f.g.Pick(f.now, alice, "s1"))
		pc := last[contracts.PhaseChanged](t, f)
		if pc.RevealUntil == nil || *pc.RevealUntil != *ms(f.now.Add(PickReveal)) {
			t.Fatalf("revealUntil %v", pc.RevealUntil)
		}
		// The TV reports early: buzzing still waits for the reveal.
		f.must(f.g.ReadingDone(f.now.Add(time.Second), host, "s1"))
		if f.g.Phase() != contracts.GamePhaseClueReading || !f.g.Deadline().Equal(f.now.Add(PickReveal)) {
			t.Fatalf("phase %s deadline %v", f.g.Phase(), f.g.Deadline())
		}
		f.toDeadline()
		if f.g.Phase() != contracts.GamePhaseBuzzingOpen {
			t.Errorf("phase %s after the reveal", f.g.Phase())
		}
		if pc := last[contracts.PhaseChanged](t, f); pc.RevealUntil != nil {
			t.Error("a later phase_changed repeats the reveal")
		}
	})
	t.Run("the reveal is 2.25 s: a reading_done at 2 s still waits, and a buzz then is early", func(t *testing.T) {
		if PickReveal != 2250*time.Millisecond {
			t.Fatalf("PickReveal %v", PickReveal)
		}
		f := setup(t, nil)
		f.must(f.g.Pick(f.now, alice, "s1"))
		during := f.now.Add(2 * time.Second) // the card is holding
		f.must(f.g.Buzz(during, bob, "s1"))
		f.must(f.g.ReadingDone(during, host, "s1"))
		if f.g.Phase() != contracts.GamePhaseClueReading || !f.g.Deadline().Equal(f.now.Add(2250*time.Millisecond)) {
			t.Fatalf("phase %s deadline %v", f.g.Phase(), f.g.Deadline())
		}
		if f.g.answering != "" {
			t.Errorf("a buzz during the reveal was taken: %q", f.g.answering)
		}
		if !f.g.lockouts[bob].After(during) {
			t.Error("a buzz during the reveal isn't locked out")
		}
	})
	t.Run("a snapshot never carries it", func(t *testing.T) {
		f := setup(t, nil)
		f.must(f.g.Pick(f.now, alice, "s1"))
		var m contracts.RoomSnapshot
		f.g.SnapshotFields(&m, true)
		if b, _ := json.Marshal(m); strings.Contains(string(b), "revealUntil") {
			t.Error("snapshot has revealUntil")
		}
	})
	t.Run("a re-read after a pause has no reveal", func(t *testing.T) {
		f := setup(t, nil)
		f.must(f.g.Pick(f.now, alice, "s1"))
		f.now = f.now.Add(500 * time.Millisecond) // mid-reveal
		f.take(f.g.Disconnect(f.now, host))
		f.now = f.now.Add(time.Minute)
		f.take(f.g.Connect(f.now, host))
		pc := last[contracts.PhaseChanged](t, f)
		if pc.Phase != contracts.GamePhaseClueReading || pc.RevealUntil != nil {
			t.Fatalf("phase %s revealUntil %v", pc.Phase, pc.RevealUntil)
		}
		if want := f.now.Add(ReadingTime(board()[0].Text)); !f.g.Deadline().Equal(want) {
			t.Errorf("re-read deadline %v, want %v", f.g.Deadline(), want)
		}
		f.must(f.g.ReadingDone(f.now, host, "s1"))
		if f.g.Phase() != contracts.GamePhaseBuzzingOpen {
			t.Errorf("phase %s", f.g.Phase())
		}
	})
}

func TestResponseTail(t *testing.T) {
	end := func(t *testing.T) *fixture {
		f := setup(t, nil)
		f.openBuzzing("s1")
		f.toDeadline() // nobody buzzed: the correct response is up
		if f.g.step != stepClueEnd || !f.g.Deadline().Equal(f.now.Add(ClueEndPause)) {
			t.Fatalf("step %v deadline %v", f.g.step, f.g.Deadline())
		}
		return f
	}
	t.Run("the board returns 1 s after the response is read", func(t *testing.T) {
		f := end(t)
		read := f.now.Add(2500 * time.Millisecond)
		f.must(f.g.ReadingDone(read, host, "s1"))
		if !f.g.Deadline().Equal(read.Add(ResponseTail)) {
			t.Errorf("deadline %v, want %v", f.g.Deadline(), read.Add(ResponseTail))
		}
	})
	t.Run("never later than the 6 s cap", func(t *testing.T) {
		f := end(t)
		capAt := f.g.Deadline()
		f.must(f.g.ReadingDone(f.now.Add(5800*time.Millisecond), host, "s1"))
		if !f.g.Deadline().Equal(capAt) {
			t.Errorf("deadline %v, want the cap %v", f.g.Deadline(), capAt)
		}
	})
	t.Run("an open override review keeps the tail for when it closes", func(t *testing.T) {
		f := setup(t, nil)
		f.openBuzzing("s1")
		f.must(f.g.Buzz(f.now, bob, "s1"))
		f.must(f.g.Answer(f.now, bob, "s1", "nitrogen")) // right: the clue ends
		f.must(f.g.Review(f.now, host, true))
		f.must(f.g.ReadingDone(f.now.Add(2*time.Second), host, "s1"))
		f.now = f.now.Add(10 * time.Second)
		f.must(f.g.Review(f.now, host, false))
		if !f.g.Deadline().Equal(f.now.Add(ResponseTail)) {
			t.Errorf("deadline %v, want %v", f.g.Deadline(), f.now.Add(ResponseTail))
		}
	})
	t.Run("only the host device reports it", func(t *testing.T) {
		f := end(t)
		if err := f.do(f.g.ReadingDone(f.now, alice, "s1")); code(err) != contracts.ErrorCodeNotHost {
			t.Errorf("a contestant ended the response: %v", err)
		}
	})
}

func TestTimerPace(t *testing.T) {
	// The pace sets the buzz window only; answering always has its two stages.
	answer := ListenWait + AnswerBegin + AnswerGrace
	for _, c := range []struct {
		pace contracts.TimerPace
		buzz time.Duration
	}{
		{"", 9 * time.Second},
		{contracts.TimerPaceStandard, 9 * time.Second},
		{contracts.TimerPaceRelaxed, 15 * time.Second},
		{contracts.TimerPaceFast, 5 * time.Second},
	} {
		t.Run(string(c.pace), func(t *testing.T) {
			f := setup(t, func(s *Setup) { s.Pace = c.pace })
			f.openBuzzing("s1")
			if got := f.g.Deadline().Sub(f.now); got != c.buzz {
				t.Errorf("buzz window %v, want %v", got, c.buzz)
			}
			f.must(f.g.Buzz(f.now, bob, "s1"))
			if got := f.g.Deadline().Sub(f.now); got != answer {
				t.Errorf("answer cap %v, want %v", got, answer)
			}
			var m contracts.RoomSnapshot
			f.g.SnapshotFields(&m, false)
			if *m.BuzzWindowMs != int(c.buzz.Milliseconds()) || *m.AnswerWindowMs != int(AnswerBegin.Milliseconds()) {
				t.Errorf("snapshot %d / %d", *m.BuzzWindowMs, *m.AnswerWindowMs)
			}
		})
	}
	t.Run("a Daily Double answer has the same stages", func(t *testing.T) {
		f := setup(t, func(s *Setup) { ddBoard(s); s.Pace = contracts.TimerPaceFast })
		f.must(f.g.Pick(f.now, alice, "s1"))
		f.must(f.g.Wager(f.now, alice, 100))
		f.toDeadline() // the wager shown, then the clue read
		f.must(f.g.ReadingDone(f.now, host, "s1"))
		if f.g.Phase() != contracts.GamePhaseAnswering || f.g.Deadline().Sub(f.now) != answer {
			t.Errorf("phase %s, answer cap %v", f.g.Phase(), f.g.Deadline().Sub(f.now))
		}
	})
}

func TestAnswerStages(t *testing.T) {
	stage := func(f *fixture) contracts.AnswerStage {
		var m contracts.RoomSnapshot
		f.g.SnapshotFields(&m, false)
		if m.AnswerStage == nil {
			return ""
		}
		return *m.AnswerStage
	}
	t.Run("listening starts the begin clock", func(t *testing.T) {
		f := setup(t, nil)
		f.openBuzzing("s1")
		f.must(f.g.Buzz(f.now, bob, "s1"))
		if stage(f) != contracts.AnswerStageBegin {
			t.Fatalf("stage %q", stage(f))
		}
		f.now = f.now.Add(800 * time.Millisecond)
		f.must(f.g.AnswerStatus(f.now, bob, "s1", contracts.AnswerStatusStatusListening))
		if got := f.g.Deadline().Sub(f.now); got != AnswerBegin+AnswerGrace {
			t.Errorf("begin deadline %v", got)
		}
		if err := f.do(f.g.AnswerStatus(f.now, bob, "s1", contracts.AnswerStatusStatusListening)); !errors.Is(err, ErrIgnored) {
			t.Errorf("a second listening: %v", err)
		}
		f.toDeadline() // silence
		if f.g.scores[bob] != -200 || f.g.Phase() == contracts.GamePhaseAnswering {
			t.Errorf("score %d phase %s", f.g.scores[bob], f.g.Phase())
		}
	})
	t.Run("begun opens the finish stage, and its deadline judges what was heard", func(t *testing.T) {
		f := setup(t, nil)
		f.openBuzzing("s1")
		f.must(f.g.Buzz(f.now, bob, "s1"))
		f.must(f.g.AnswerStatus(f.now, bob, "s1", contracts.AnswerStatusStatusListening))
		f.now = f.now.Add(5 * time.Second) // thinking
		f.must(f.g.AnswerStatus(f.now, bob, "s1", contracts.AnswerStatusStatusBegun))
		if stage(f) != contracts.AnswerStageFinish || f.g.Deadline().Sub(f.now) != AnswerFinish+AnswerGrace {
			t.Fatalf("stage %q deadline %v", stage(f), f.g.Deadline().Sub(f.now))
		}
		f.must(f.g.Progress(f.now, bob, "nitrogen"))
		f.toDeadline() // the final transcript never came
		if f.g.scores[bob] != 200 {
			t.Errorf("bob %d, want +200 from the last thing heard", f.g.scores[bob])
		}
	})
	t.Run("only the answering player moves the stages", func(t *testing.T) {
		f := setup(t, nil)
		f.openBuzzing("s1")
		f.must(f.g.Buzz(f.now, bob, "s1"))
		if err := f.do(f.g.AnswerStatus(f.now, alice, "s1", contracts.AnswerStatusStatusBegun)); !errors.Is(err, ErrIgnored) {
			t.Errorf("alice moved bob's stage: %v", err)
		}
		if err := f.do(f.g.AnswerStatus(f.now, bob, "s2", contracts.AnswerStatusStatusBegun)); !errors.Is(err, ErrIgnored) {
			t.Errorf("another clue: %v", err)
		}
		if stage(f) != contracts.AnswerStageBegin {
			t.Errorf("stage %q", stage(f))
		}
	})
	t.Run("a submitted answer is judged at once", func(t *testing.T) {
		f := setup(t, nil)
		f.openBuzzing("s1")
		f.must(f.g.Buzz(f.now, bob, "s1"))
		f.must(f.g.Answer(f.now, bob, "s1", "nitrogen"))
		if f.g.scores[bob] != 200 || stage(f) != "" {
			t.Errorf("bob %d stage %q", f.g.scores[bob], stage(f))
		}
	})
}

func TestSnapshotCarriesQuickPicks(t *testing.T) {
	for _, on := range []bool{false, true} {
		f := setup(t, func(s *Setup) { s.QuickPicks = on })
		var m contracts.RoomSnapshot
		f.g.SnapshotFields(&m, false)
		if m.QuickPicks == nil || *m.QuickPicks != on {
			t.Errorf("QuickPicks %v: snapshot has %v", on, m.QuickPicks)
		}
	}
}

func TestNoDoubleGoesFromSingleToFinal(t *testing.T) {
	f := setup(t, func(s *Setup) {
		s.NoDouble = true
		var single []Clue
		for _, c := range s.Board {
			if c.Round == contracts.RoundSingle {
				single = append(single, c)
			}
		}
		s.Board = single
		s.Final = &Clue{ID: "f1", Round: contracts.RoundFinal, Category: "ISLANDS", Text: "Volcano", Response: "Krakatoa"}
	})
	f.openBuzzing("s1")
	f.must(f.g.Buzz(f.now, alice, "s1"))
	f.must(f.g.Answer(f.now, alice, "s1", "nitrogen"))
	f.toDeadline() // the correct response
	f.openBuzzing("s2")
	f.toDeadline() // nobody buzzed
	f.toDeadline() // the correct response
	if f.g.Phase() != contracts.GamePhaseFinalCategory {
		t.Fatalf("phase %s after the Single board, want Final (no Double interstitial)", f.g.Phase())
	}
	if rs := all[contracts.RoundStarted](f); len(rs) != 0 {
		t.Errorf("a round_started was sent: %+v", rs)
	}
}

func TestNoDoubleRecoversIntoFinal(t *testing.T) {
	f := setup(t, func(s *Setup) {
		s.NoDouble = true
		var single []Clue
		for _, c := range s.Board {
			if c.Round == contracts.RoundSingle {
				c.State = contracts.ClueStateAnswered
				single = append(single, c)
			}
		}
		s.Board = single
		s.Final = &Clue{ID: "f1", Round: contracts.RoundFinal, Category: "ISLANDS", Text: "Volcano", Response: "Krakatoa",
			State: contracts.ClueStateUnplayed}
		s.Scores = map[string]int{alice: 400, bob: 200}
	})
	if f.g.Phase() != contracts.GamePhaseFinalCategory {
		t.Errorf("a recovered game with Double off and Single done is at %s, want Final", f.g.Phase())
	}
}
