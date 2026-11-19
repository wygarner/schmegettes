package room

import (
	"encoding/json"
	"strings"
	"testing"
	"time"

	"schmegettes/game/internal/contracts"
	"schmegettes/game/internal/play"
)

// finalGame starts a game whose boards are done, so it opens on Final. The host plays.
// Scores: Wyatt (host) $900, Alice $600, Bob $300.
func finalGame(t *testing.T) (*fixture, *conn, *conn, *conn) {
	t.Helper()
	f := setup(t)
	f.store.add(alice, "Alice")
	f.store.add(bob, "Bob")
	f.store.lobby.HostPlays = true
	board := miniBoard()
	for i := range board {
		board[i].State = contracts.ClueStateAnswered
	}
	f.store.game.Board = board
	f.store.game.Players = []play.Player{{UserID: hostID, Name: "Wyatt"}, {UserID: alice, Name: "Alice"}, {UserID: bob, Name: "Bob"}}
	f.store.game.Final = &play.Clue{ID: "clue-f", Round: contracts.RoundFinal, Category: "ISLANDS",
		Text: "This volcano erupted in 1883", Response: "Krakatoa", State: contracts.ClueStateUnplayed}
	f.store.game.Scores = map[string]int{hostID: 900, alice: 600, bob: 300}

	host := f.connect(hostID)
	a := f.connect(alice)
	b := f.connect(bob)
	host.send(map[string]any{"type": "start_game"})
	for _, c := range []*conn{host, a, b} {
		for m := c.until("phase_changed"); m.Phase != string(contracts.GamePhaseFinalCategory); m = c.until("phase_changed") {
			if m.Phase != string(contracts.GamePhaseBuildingBoard) {
				t.Fatalf("phase %q", m.Phase)
			}
		}
	}
	return f, host, a, b
}

// readUntil returns every message a socket gets up to and including the first of type typ.
func (c *conn) readUntil(typ string) []string {
	c.t.Helper()
	var out []string
	for {
		select {
		case data := <-c.client.Out:
			out = append(out, string(data))
			var m message
			_ = json.Unmarshal(data, &m)
			if m.Seq != nil {
				c.seq = *m.Seq
			}
			if m.Type == typ {
				return out
			}
		case <-time.After(2 * time.Second):
			c.t.Fatalf("no %s; got %v", typ, out)
		}
	}
}

func wager(amount int) map[string]any {
	return map[string]any{"type": "submit_wager", "amount": amount}
}

func typed(text string) map[string]any {
	return map[string]any{"type": "submit_answer", "clueId": "clue-f", "answer": text, "source": "typed"}
}

func TestFinalWagersReachOnlyTheirOwner(t *testing.T) {
	f, host, a, b := finalGame(t)
	a.send(wager(500))
	host.send(wager(800))
	b.send(wager(200))
	f.timers.fireAfter(host) // the category screen ends; everyone has locked in

	want := map[*conn]string{a: `"amount":500`, b: `"amount":200`}
	for c, own := range map[string]*conn{"host": host, "alice": a, "bob": b} {
		got := strings.Join(own.readUntil("phase_changed"), "")
		for _, amount := range []string{`"amount":500`, `"amount":800`, `"amount":200`} {
			if strings.Contains(got, amount) && amount != want[own] {
				t.Errorf("%s got %s: %s", c, amount, got)
			}
		}
		if mine := want[own]; mine != "" && !strings.Contains(got, mine) {
			t.Errorf("%s didn't get their own wager", c)
		}
	}
	host.settle()
	if !strings.Contains(strings.Join(f.store.records, "|"), "wager clue-f "+hostID+" 800") {
		t.Errorf("records %v", f.store.records)
	}
}

func TestFinalAnswersStaySecretUntilTheReveal(t *testing.T) {
	f, host, a, b := finalGame(t)
	for _, c := range []*conn{host, a, b} {
		c.send(wager(100))
	}
	f.timers.fireAfter(host) // the category screen ends
	for _, c := range []*conn{host, a, b} {
		c.readUntil("phase_changed") // final_answer: the clue is up
	}

	a.send(map[string]any{"type": "answer_progress", "clueId": "clue-f", "text": "krakatoa"})
	host.send(typed("etna"))
	b.send(typed("what is krakatoa"))
	a.settle()

	// A second socket for Alice gets her draft; one for the host device gets nothing private.
	a2 := NewClient(alice)
	f.hub.Attach(roomID, a2)
	snap := string(<-a2.Out)
	if !strings.Contains(snap, `"myFinalAnswer":"krakatoa"`) || !strings.Contains(snap, `"myWager":100`) {
		t.Errorf("Alice's snapshot lacks her own draft or wager: %s", snap)
	}
	// The new socket took Alice's seat over (another device); the test follows it from here.
	var first struct {
		Seq int `json:"seq"`
	}
	_ = json.Unmarshal([]byte(snap), &first)
	a = &conn{t: t, client: a2, room: a.room, seq: first.Seq}
	host2 := NewClient(hostID)
	f.hub.Attach(roomID, host2)
	if snap := string(<-host2.Out); strings.Contains(snap, "myWager") || strings.Contains(snap, "myFinalAnswer") ||
		strings.Contains(snap, "etna") {
		t.Errorf("the host device's snapshot carries the host's secrets: %s", snap)
	}

	f.timers.fireAfter(host) // reading done
	f.timers.fireAfter(host) // time's up: Alice's draft is submitted, the reveal starts

	for name, c := range map[string]*conn{"host": host, "alice": a, "bob": b} {
		msgs := c.readUntil("answer_judged")
		for _, m := range msgs[:len(msgs)-1] {
			if strings.Contains(m, "krakatoa") && !(c == a && strings.Contains(m, "final_submitted")) &&
				!(c == b && strings.Contains(m, "final_submitted")) {
				t.Errorf("%s saw a Final answer before the reveal: %s", name, m)
			}
			if strings.Contains(m, "etna") {
				t.Errorf("%s saw the host's Final answer before the reveal: %s", name, m)
			}
		}
		if c == a {
			continue
		}
		for _, m := range msgs[:len(msgs)-1] {
			if strings.Contains(m, "final_submitted") && strings.Contains(m, `"userId":"`+alice+`"`) &&
				strings.Contains(m, "krakatoa") {
				t.Errorf("%s got Alice's private copy: %s", name, m)
			}
		}
	}
	host.settle()
	if !strings.Contains(strings.Join(f.store.records, "|"), "final answer "+alice+" krakatoa") {
		t.Errorf("Alice's draft wasn't submitted: %v", f.store.records)
	}
}

func TestWagerRejections(t *testing.T) {
	_, host, a, _ := finalGame(t)
	a.send(wager(601))
	if m := a.until("error"); m.Code != string(contracts.ErrorCodeInvalidWager) {
		t.Errorf("code %q", m.Code)
	}
	host.send(map[string]any{"type": "submit_wager", "amount": -1})
	if m := host.until("error"); m.Code != string(contracts.ErrorCodeInvalidWager) {
		t.Errorf("a negative amount: %q", m.Code)
	}
}
