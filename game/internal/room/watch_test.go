package room

import (
	"bytes"
	"encoding/json"
	"log/slog"
	"strings"
	"sync"
	"testing"
	"time"

	"schmegettes/game/internal/contracts"
)

// syncBuffer is a log sink the room goroutine writes while the test reads.
type syncBuffer struct {
	mu  sync.Mutex
	buf bytes.Buffer
}

func (b *syncBuffer) Write(p []byte) (int, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.buf.Write(p)
}

func (b *syncBuffer) String() string {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.buf.String()
}

// startedGameWith is startedGame with the room config adjusted. It returns the room's log.
func startedGameWith(t *testing.T, opt func(*Config)) (*fixture, *syncBuffer, *conn, *conn, *conn) {
	t.Helper()
	f := setupWith(t, opt)
	f.store.add(alice, "Alice")
	f.store.add(bob, "Bob")
	host := f.connect(hostID)
	logs := &syncBuffer{}
	// The room is idle between the snapshot and the next event, so the swap doesn't race.
	f.hubRoom().log = slog.New(slog.NewJSONHandler(logs, nil)).With("room_id", roomID)
	a := f.connect(alice)
	b := f.connect(bob)
	host.send(map[string]any{"type": "start_game"})
	for _, c := range []*conn{host, a, b} {
		c.until("round_started")
		c.until("phase_changed")
	}
	return f, logs, host, a, b
}

func TestARoomPanicIsContained(t *testing.T) {
	const otherRoom = "7a1e3b6f-9b1c-4d4a-8b5f-3e2a1c0b8d22"
	f, logs, host, a, b := startedGameWith(t, func(c *Config) {
		c.TestPanic = func(id string) bool { return id == roomID }
	})
	// Another room on the same instance.
	other := NewClient(hostID)
	otherRm := f.hub.Attach(otherRoom, other)
	<-other.Out // its snapshot

	picker := map[string]*conn{alice: a, bob: b}[controller(f)]
	picker.send(map[string]any{"type": "select_clue", "clueId": "clue-s"})

	for _, c := range []*conn{host, a, b} {
		if !c.closed() {
			t.Fatalf("%s's socket stayed open after the crash", c.client.UserID)
		}
		if c.client.CloseCode != CloseRoomCrashed {
			t.Errorf("close code %d, want %d", c.client.CloseCode, CloseRoomCrashed)
		}
	}

	line := logs.String()
	for _, want := range []string{`"level":"ERROR"`, `"msg":"room crashed"`, `"room_id":"` + roomID + `"`,
		`"game_id":"game-1"`, `"phase":"board"`, `"stack":"`} {
		if !strings.Contains(line, want) {
			t.Errorf("crash log missing %s: %s", want, line)
		}
	}
	if strings.Contains(line, "clue-s") {
		t.Errorf("crash log carries a message payload: %s", line)
	}

	// The hub forgets the crashed room and keeps serving the other one.
	deadline := time.Now().Add(2 * time.Second)
	for f.hubRoom() != nil && time.Now().Before(deadline) {
		time.Sleep(time.Millisecond)
	}
	if f.hubRoom() != nil {
		t.Fatal("hub still holds the crashed room")
	}
	ping, _ := json.Marshal(map[string]any{"type": "ping"})
	otherRm.Intent(other, ping)
	for ponged := false; !ponged; {
		select {
		case data := <-other.Out:
			ponged = strings.Contains(string(data), `"pong"`)
		case <-time.After(2 * time.Second):
			t.Fatal("the other room stopped serving")
		}
	}

	// The game isn't ended: a reconnect starts a fresh room that reloads it.
	f.store.mu.Lock()
	ended := f.store.ended
	f.store.mu.Unlock()
	if ended != "" {
		t.Fatalf("game ended as %q after a crash", ended)
	}
	c := NewClient(alice)
	f.hub.Attach(roomID, c)
	var snap message
	select {
	case data := <-c.Out:
		_ = json.Unmarshal(data, &snap)
	case <-time.After(2 * time.Second):
		t.Fatal("no snapshot on reconnect")
	}
	if snap.Type != "room_snapshot" || snap.Phase == string(contracts.GamePhaseLobby) {
		t.Fatalf("reconnect got %s in phase %q, want the game reloaded", snap.Type, snap.Phase)
	}
}

func TestStuckPhaseWatchdog(t *testing.T) {
	f, logs, host, a, b := startedGameWith(t, func(c *Config) { c.Watch = 2 * time.Millisecond })
	picker := map[string]*conn{alice: a, bob: b}[controller(f)]
	picker.send(map[string]any{"type": "select_clue", "clueId": "clue-s"})
	host.settle()
	// The room is idle after settle (its timer is fake and never fires), so reading is safe.
	r := f.hubRoom()
	deadline := r.game.Deadline()
	if deadline.IsZero() {
		t.Fatal("no deadline after a pick")
	}
	stuck := func() int { return strings.Count(logs.String(), `"msg":"phase stuck"`) }

	f.clock.advance(deadline.Sub(f.clock.Now()) + 29*time.Second)
	time.Sleep(30 * time.Millisecond)
	if n := stuck(); n != 0 {
		t.Fatalf("29 s over: %d reports, want none", n)
	}

	f.clock.advance(2 * time.Second)
	until := time.Now().Add(2 * time.Second)
	for stuck() == 0 && time.Now().Before(until) {
		time.Sleep(time.Millisecond)
	}
	time.Sleep(30 * time.Millisecond)
	if n := stuck(); n != 1 {
		t.Fatalf("31 s over: %d reports, want exactly 1", n)
	}
	line := logs.String()
	for _, want := range []string{`"level":"ERROR"`, `"game_id":"game-1"`, `"overdue_ms":31000`} {
		if !strings.Contains(line, want) {
			t.Errorf("stuck log missing %s: %s", want, line)
		}
	}
}
