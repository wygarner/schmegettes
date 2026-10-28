package room

import (
	"encoding/json"
	"strings"
	"testing"
	"time"

	"schmegettes/game/internal/contracts"
)

// startedGame has the host and two players in a game that just started, Alice in control.
func startedGame(t *testing.T) (*fixture, *conn, *conn, *conn) {
	t.Helper()
	f := setup(t)
	f.store.add(alice, "Alice")
	f.store.add(bob, "Bob")
	host := f.connect(hostID)
	a := f.connect(alice)
	b := f.connect(bob)
	host.send(map[string]any{"type": "start_game"})
	for _, c := range []*conn{host, a, b} {
		c.until("round_started")
		if m := c.until("phase_changed"); m.Phase != "board" {
			t.Fatalf("phase %q", m.Phase)
		}
	}
	return f, host, a, b
}

type gameMessage struct {
	message
	ControllingUserID string `json:"controllingUserId"`
	UserID            string `json:"userId"`
	Outcome           string `json:"outcome"`
	Verdict           string `json:"verdict"`
	State             string `json:"state"`
	Paused            bool   `json:"paused"`
	Round             string `json:"round"`
	Results           []struct {
		UserID string `json:"userId"`
		Score  int    `json:"score"`
	} `json:"results"`
}

// raw collects every byte sent to a socket until it sees the given type.
func (c *conn) raw(typ string) (gameMessage, string) {
	c.t.Helper()
	var all strings.Builder
	for {
		select {
		case data := <-c.client.Out:
			all.Write(data)
			var m gameMessage
			_ = json.Unmarshal(data, &m)
			if m.Seq != nil {
				c.seq = *m.Seq
			}
			if m.Type == typ {
				return m, all.String()
			}
		case <-time.After(2 * time.Second):
			c.t.Fatalf("no %s; got %s", typ, all.String())
		}
	}
}

func controller(f *fixture) string {
	return string(*f.hubRoom().controller())
}

func (f *fixture) hubRoom() *Room {
	f.hub.mu.Lock()
	defer f.hub.mu.Unlock()
	return f.hub.rooms[roomID]
}

func TestAFullGameEndToEnd(t *testing.T) {
	f, host, a, b := startedGame(t)
	picker := map[string]*conn{alice: a, bob: b}[controller(f)]
	other := a
	if picker == a {
		other = b
	}

	// Single: pick, read, buzz, answer right.
	picker.send(map[string]any{"type": "select_clue", "clueId": "clue-s"})
	_, tvBytes := host.raw("phase_changed")
	if !strings.Contains(tvBytes, "78 percent") {
		t.Error("the TV didn't get the clue text")
	}
	host.send(map[string]any{"type": "reading_done", "clueId": "clue-s"})
	other.until("phase_changed") // clue_reading
	if m := other.until("phase_changed"); m.Phase != "buzzing_open" {
		t.Fatalf("phase %q", m.Phase)
	}
	other.send(map[string]any{"type": "buzz", "clueId": "clue-s"})
	if m, _ := other.raw("buzz_result"); m.Outcome != "won" {
		t.Fatalf("buzz %q", m.Outcome)
	}
	other.send(map[string]any{"type": "submit_answer", "clueId": "clue-s", "answer": "what is nitrogen", "source": "voice"})
	if m, _ := other.raw("answer_judged"); m.Verdict != "correct" {
		t.Fatalf("verdict %q", m.Verdict)
	}
	f.timers.fireAfter(host) // correct response shown for 3 s
	if m, _ := host.raw("round_started"); m.Round != "double" {
		t.Fatalf("round %q", m.Round)
	}
	f.timers.fireAfter(host) // "Double Jeopardy!" interstitial
	host.until("phase_changed")

	// Double: nobody buzzes.
	host.send(map[string]any{"type": "select_clue", "clueId": "clue-d"})
	host.send(map[string]any{"type": "reading_done", "clueId": "clue-d"})
	host.raw("phase_changed")
	f.timers.fireAfter(host) // 5 s with no buzz
	if m, _ := host.raw("clue_ended"); m.State != "unanswered" {
		t.Fatalf("state %q", m.State)
	}
	f.timers.fireAfter(host)
	if m, _ := host.raw("game_over"); len(m.Results) != 2 || m.Results[0].Score != 200 {
		t.Errorf("results %+v", m.Results)
	}

	f.store.mu.Lock()
	defer f.store.mu.Unlock()
	want := []string{
		"reveal clue-s", "answer clue-s " + other.client.UserID + " correct", "finish clue-s answered",
		"reveal clue-d", "finish clue-d unanswered", "end finished",
	}
	if strings.Join(f.store.records, "|") != strings.Join(want, "|") {
		t.Errorf("records\n got %v\nwant %v", f.store.records, want)
	}
}

func TestPhonesNeverReceiveClueTextOrResponse(t *testing.T) {
	f, host, a, b := startedGame(t)
	picker := map[string]*conn{alice: a, bob: b}[controller(f)]
	picker.send(map[string]any{"type": "select_clue", "clueId": "clue-s"})
	host.send(map[string]any{"type": "reading_done", "clueId": "clue-s"})
	picker.until("phase_changed")
	picker.until("phase_changed")
	picker.send(map[string]any{"type": "buzz", "clueId": "clue-s"})
	picker.send(map[string]any{"type": "submit_answer", "clueId": "clue-s", "answer": "nitrogen", "source": "voice"})

	_, tv := host.raw("clue_ended")
	if !strings.Contains(tv, "Nitrogen") {
		t.Error("the TV didn't get the correct response")
	}
	for _, phone := range []*conn{a, b} {
		_, bytes := phone.raw("clue_ended")
		for _, secret := range []string{"78 percent", "Nitrogen"} {
			if strings.Contains(bytes, secret) {
				t.Errorf("phone got %q: %s", secret, bytes)
			}
		}
	}
}

func TestRecoveryMidClue(t *testing.T) {
	f := setup(t)
	f.store.add(alice, "Alice")
	f.store.add(bob, "Bob")
	b := miniBoard()
	b[0].State = contracts.ClueStateActive
	f.store.lobby.Status = contracts.RoomStatusInGame
	f.store.game.Board = b
	f.store.game.ActiveClueID = "clue-s"
	f.store.game.Scores = map[string]int{alice: -200}
	f.store.game.Attempted = map[string]bool{alice: true}

	a := f.connect(alice) // a phone reconnects first: paused until the TV is back
	host := f.connect(hostID)
	if m, _ := host.raw("phase_changed"); m.Phase != "clue_reading" {
		t.Fatalf("phase %q", m.Phase)
	}
	a.until("phase_changed")
	a.send(map[string]any{"type": "buzz", "clueId": "clue-s"})
	if m := a.until("error"); m.Code != "already_attempted" {
		t.Errorf("code %q", m.Code)
	}
}

func TestAbandonAfterHostAbsence(t *testing.T) {
	f, host, a, _ := startedGame(t)
	host.room.Detach(host.client)
	if m, _ := a.raw("game_paused"); !m.Paused {
		t.Fatal("not paused")
	}
	f.clock.advance(31 * time.Minute)
	if m, _ := a.raw("room_closed"); m.Reason != "host_absent" {
		t.Errorf("reason %q", m.Reason)
	}
	f.store.mu.Lock()
	defer f.store.mu.Unlock()
	if f.store.ended != contracts.GameStatusAbandoned || !f.store.closed {
		t.Errorf("ended %q closed %v", f.store.ended, f.store.closed)
	}
}

func TestPickByNonController(t *testing.T) {
	f, _, a, b := startedGame(t)
	notPicker := map[string]*conn{alice: b, bob: a}[controller(f)]
	notPicker.send(map[string]any{"type": "select_clue", "clueId": "clue-s"})
	if m := notPicker.until("error"); m.Code != "not_in_control" {
		t.Errorf("code %q", m.Code)
	}
}

// answerOnce plays the Single clue up to an answer from whoever isn't in control.
func answerOnce(t *testing.T, answer string) (*fixture, *conn) {
	t.Helper()
	return answerOnceWith(t, answer, nil)
}

func answerOnceWith(t *testing.T, answer string, before func(*fixture)) (*fixture, *conn) {
	t.Helper()
	f, host, a, b := startedGame(t)
	if before != nil {
		before(f)
	}
	picker := map[string]*conn{alice: a, bob: b}[controller(f)]
	other := a
	if picker == a {
		other = b
	}
	picker.send(map[string]any{"type": "select_clue", "clueId": "clue-s"})
	host.send(map[string]any{"type": "reading_done", "clueId": "clue-s"})
	other.until("phase_changed")
	other.until("phase_changed")
	other.send(map[string]any{"type": "buzz", "clueId": "clue-s"})
	other.send(map[string]any{"type": "submit_answer", "clueId": "clue-s", "answer": answer, "source": "voice"})
	host.raw("answer_judged")
	// A wrong answer reopens buzzing for the other player; let that window close.
	f.timers.fireAfter(host)
	host.raw("clue_ended")
	return f, host
}

func TestLongAnswersAreClipped(t *testing.T) {
	f, _ := answerOnce(t, strings.Repeat("é", 300))
	f.store.mu.Lock()
	defer f.store.mu.Unlock()
	if f.store.answerLen != 200 {
		t.Errorf("wrote %d characters, want 200", f.store.answerLen)
	}
}

func TestAWriteThatKeepsFailingDoesNotBlockTheRest(t *testing.T) {
	f, _ := answerOnceWith(t, "oxygen", func(f *fixture) {
		f.store.mu.Lock()
		f.store.failAnswers = true
		f.store.mu.Unlock()
	})
	// The room's tick retries; after maxWriteTries the answer is dropped and the clue's
	// finish is written.
	deadline := time.Now().Add(2 * time.Second)
	for {
		f.store.mu.Lock()
		got := strings.Join(f.store.records, "|")
		f.store.mu.Unlock()
		if strings.Contains(got, "finish clue-s") {
			if strings.Contains(got, "answer clue-s") {
				t.Errorf("the failing answer was written: %s", got)
			}
			return
		}
		if time.Now().After(deadline) {
			t.Fatalf("later records blocked: %s", got)
		}
		time.Sleep(5 * time.Millisecond)
	}
}
