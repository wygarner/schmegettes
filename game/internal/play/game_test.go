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
	f.must(f.g.ReadingDone(f.now, host, clue))
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
		want := ReadingTime(Announcement("SCIENCE", 200) + " " + board()[0].Text)
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
	if got := Announcement("VOLCANOES", 1200); got != "Here's VOLCANOES for 1200." {
		t.Errorf("announcement %q", got)
	}
	// "Here's VOLCANOES for 400." adds 4 words to the clue's estimate.
	if got := ReadingTime(Announcement("VOLCANOES", 400) + " one"); got != 3*time.Second {
		t.Errorf("announced 1-word clue: %v", got)
	}
}

func TestTimings(t *testing.T) {
	if AnswerWindow != 14*time.Second || ClueEndPause != 6*time.Second || ControlGrace != 10*time.Second {
		t.Errorf("answer %v, clue end %v, grace %v", AnswerWindow, ClueEndPause, ControlGrace)
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
	f.must(f.g.Buzz(f.now, bob, "s1")) // during reading
	f.must(f.g.ReadingDone(f.now.Add(10*time.Millisecond), host, "s1"))

	if err := f.do(f.g.Buzz(t0.Add(249*time.Millisecond), bob, "s1")); !errors.Is(err, ErrIgnored) {
		t.Errorf("buzz inside the lockout: %v", err)
	}
	f.must(f.g.Buzz(t0.Add(250*time.Millisecond), bob, "s1"))
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
	if f.g.Deadline() != f.now.Add(AnswerWindow+AnswerGrace) {
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
