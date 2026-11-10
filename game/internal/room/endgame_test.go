package room

import (
	"fmt"
	"strings"
	"testing"
)

// wrongAnswer plays clue-s: the player who didn't pick buzzes and is judged wrong, nobody
// else buzzes, and the clue ends on its correct-response screen. It returns the answer's id.
func wrongAnswer(t *testing.T, f *fixture, host, a, b *conn) (answerer *conn, answerID string) {
	t.Helper()
	picker := map[string]*conn{alice: a, bob: b}[controller(f)]
	answerer = a
	if picker == a {
		answerer = b
	}
	picker.send(map[string]any{"type": "select_clue", "clueId": "clue-s"})
	host.send(map[string]any{"type": "reading_done", "clueId": "clue-s"})
	for {
		if m := answerer.until("phase_changed"); m.Phase == "buzzing_open" {
			break
		}
	}
	answerer.send(map[string]any{"type": "buzz", "clueId": "clue-s"})
	answerer.until("buzz_result")
	answerer.send(map[string]any{"type": "submit_answer", "clueId": "clue-s", "answer": "crack a toe a", "source": "voice"})
	judged, _ := host.raw("answer_judged")
	if judged.Verdict != "incorrect" {
		t.Fatalf("verdict %q", judged.Verdict)
	}
	f.timers.fireAfter(host) // the reopened 5 s run out
	host.raw("clue_ended")
	return answerer, judged.AnswerID
}

func TestHostOverridesAVerdict(t *testing.T) {
	f, host, a, b := startedGame(t)
	answerer, id := wrongAnswer(t, f, host, a, b)

	// Phones can't review or override.
	answerer.send(map[string]any{"type": "override_review", "open": true})
	if m := answerer.until("error"); m.Code != "not_host" {
		t.Errorf("a phone opened a review: %q", m.Code)
	}
	answerer.send(map[string]any{"type": "override_verdict", "answerId": id, "correct": true})
	if m := answerer.until("error"); m.Code != "not_host" {
		t.Errorf("a phone overrode: %q", m.Code)
	}

	host.send(map[string]any{"type": "override_review", "open": true})
	if m, _ := answerer.raw("override_review_changed"); !m.Open {
		t.Error("the review should be open for everyone")
	}
	host.send(map[string]any{"type": "override_verdict", "answerId": "not-an-answer-id-0000000000000000", "correct": true})
	if m := host.until("error"); m.Code != "unknown_answer" {
		t.Errorf("unknown answer: %q", m.Code)
	}
	host.send(map[string]any{"type": "override_verdict", "answerId": id, "correct": true})
	m, _ := answerer.raw("verdict_overridden")
	if m.Verdict != "overridden_correct" || m.ScoreDelta != 200 || m.ControllingUserID != answerer.client.UserID {
		t.Errorf("verdict_overridden %+v", m)
	}
	host.send(map[string]any{"type": "override_review", "open": false})
	host.raw("override_review_changed")
	host.settle()

	f.store.mu.Lock()
	defer f.store.mu.Unlock()
	want := fmt.Sprintf("override %s overridden_correct 200", id)
	if !strings.Contains(strings.Join(f.store.records, "|"), want) {
		t.Errorf("records %v, want %q", f.store.records, want)
	}
}

// finishedGame plays both clues with nobody buzzing, to the final scores.
func finishedGame(t *testing.T) (*fixture, *conn, *conn, *conn) {
	t.Helper()
	f, host, a, b := startedGame(t)
	players := map[string]*conn{alice: a, bob: b}
	players[controller(f)].send(map[string]any{"type": "select_clue", "clueId": "clue-s"})
	host.send(map[string]any{"type": "reading_done", "clueId": "clue-s"})
	host.raw("phase_changed")
	f.timers.fireAfter(host) // no buzz
	host.raw("clue_ended")
	f.timers.fireAfter(host)
	host.raw("round_started")
	f.timers.fireAfter(host) // interstitial
	host.until("phase_changed")
	players[controller(f)].send(map[string]any{"type": "select_clue", "clueId": "clue-d"})
	host.send(map[string]any{"type": "reading_done", "clueId": "clue-d"})
	host.raw("phase_changed")
	f.timers.fireAfter(host)
	host.raw("clue_ended")
	f.timers.fireAfter(host)
	host.raw("game_over")
	a.raw("game_over")
	b.raw("game_over")
	return f, host, a, b
}

func TestLeaveFromTheScoreboardThenRematch(t *testing.T) {
	f, host, a, b := finishedGame(t)

	b.send(map[string]any{"type": "leave_room"})
	if !b.closed() {
		t.Fatal("Bob's socket should close when he leaves")
	}

	a.send(map[string]any{"type": "rematch"})
	if m := a.until("error"); m.Code != "not_host" {
		t.Errorf("a phone asked for a rematch: %q", m.Code)
	}

	host.send(map[string]any{"type": "rematch"})
	for _, c := range []*conn{host, a} {
		snap := c.until("room_snapshot")
		if snap.Phase != "lobby" {
			t.Fatalf("phase %q, want lobby", snap.Phase)
		}
		for _, p := range snap.Players {
			if string(p.UserId) == bob {
				t.Error("Bob left; he isn't in the rematch lobby")
			}
			if p.Score != 0 {
				t.Errorf("%s has %d; scores reset", p.DisplayName, p.Score)
			}
		}
	}

	// A second press does nothing; Start builds a new game as in any lobby.
	host.send(map[string]any{"type": "rematch"})
	host.settle()
	f.store.add("carol", "Carol") // Bob left: a new player joins by code before Start
	f.connect("carol")
	host.send(map[string]any{"type": "start_game"})
	host.until("round_started")
}

func TestRematchOnlyAfterTheGame(t *testing.T) {
	_, host, _, _ := startedGame(t)
	host.send(map[string]any{"type": "rematch"})
	if m := host.until("error"); m.Code != "wrong_phase" {
		t.Errorf("rematch mid-game: %q", m.Code)
	}
}
