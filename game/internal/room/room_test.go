package room

import (
	"context"
	"encoding/json"
	"errors"
	"sync"
	"testing"
	"time"

	"schmegettes/game/internal/contracts"
)

const (
	roomID = "6f0d2a5e-8a0b-4c39-9a4e-2d1f0b7a9c11"
	hostID = "11111111-1111-4111-8111-111111111111"
	alice  = "22222222-2222-4222-8222-222222222222"
	bob    = "33333333-3333-4333-8333-333333333333"
)

type fakeStore struct {
	mu       sync.Mutex
	lobby    Lobby
	startErr error
	started  int
	closed   bool
}

func newFakeStore() *fakeStore {
	return &fakeStore{lobby: Lobby{
		Status: contracts.RoomStatusOpen, HostID: hostID, MaxPlayers: 6,
		Members: []Member{{UserID: hostID, Name: "Wyatt", Role: contracts.PlayerRoleHost}},
	}}
}

func (s *fakeStore) add(userID, name string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.lobby.Members = append(s.lobby.Members, Member{UserID: userID, Name: name, Role: contracts.PlayerRoleContestant})
}

func (s *fakeStore) Load(context.Context, string) (Lobby, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	l := s.lobby
	l.Members = append([]Member(nil), s.lobby.Members...)
	return l, nil
}

func (s *fakeStore) SetName(_ context.Context, _, userID, name string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i := range s.lobby.Members {
		if s.lobby.Members[i].UserID == userID {
			s.lobby.Members[i].Name = name
		}
	}
	return nil
}

func (s *fakeStore) SetHostPlays(_ context.Context, _ string, plays bool) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.lobby.HostPlays = plays
	return nil
}

func (s *fakeStore) Leave(_ context.Context, _, userID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	kept := s.lobby.Members[:0]
	for _, m := range s.lobby.Members {
		if m.UserID != userID {
			kept = append(kept, m)
		}
	}
	s.lobby.Members = kept
	return nil
}

func (s *fakeStore) StartGame(context.Context, string) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.started++
	if s.startErr != nil {
		return "", s.startErr
	}
	s.lobby.Status = contracts.RoomStatusInGame
	return "game-1", nil
}

func (s *fakeStore) Close(context.Context, string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.closed = true
	s.lobby.Status = contracts.RoomStatusClosed
	return nil
}

func (s *fakeStore) setStatus(st contracts.RoomStatus) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.lobby.Status = st
}

type clock struct {
	mu  sync.Mutex
	now time.Time
}

func (c *clock) Now() time.Time {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.now
}

func (c *clock) advance(d time.Duration) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.now = c.now.Add(d)
}

type fixture struct {
	t     *testing.T
	store *fakeStore
	clock *clock
	hub   *Hub
}

func setup(t *testing.T) *fixture {
	t.Helper()
	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	clk := &clock{now: time.Unix(1_800_000_000, 0)}
	store := newFakeStore()
	cfg := Config{HostAbsence: 30 * time.Minute, Tick: 5 * time.Millisecond, Now: clk.Now}
	return &fixture{t: t, store: store, clock: clk, hub: NewHub(ctx, store, cfg)}
}

type message struct {
	Type    string             `json:"type"`
	Seq     *int               `json:"seq"`
	Phase   string             `json:"phase"`
	Code    string             `json:"code"`
	Reason  string             `json:"reason"`
	Players []contracts.Player `json:"players"`
	Host    string             `json:"hostDisplayName"`
	Plays   bool               `json:"hostPlays"`
}

type conn struct {
	t      *testing.T
	client *Client
	room   *Room
	seq    int
}

func (f *fixture) connect(userID string) *conn {
	c := NewClient(userID)
	r := f.hub.Attach(roomID, c)
	cn := &conn{t: f.t, client: c, room: r, seq: -1}
	snap := cn.next()
	if snap.Type != "room_snapshot" {
		f.t.Fatalf("first message %q, want room_snapshot", snap.Type)
	}
	return cn
}

// next reads one message and checks seq grows by exactly one.
func (c *conn) next() message {
	c.t.Helper()
	select {
	case data := <-c.client.Out:
		var m message
		if err := json.Unmarshal(data, &m); err != nil {
			c.t.Fatal(err)
		}
		if m.Seq != nil {
			if m.Type != "room_snapshot" && *m.Seq != c.seq+1 {
				c.t.Fatalf("%s seq %d after %d", m.Type, *m.Seq, c.seq)
			}
			c.seq = *m.Seq
		}
		return m
	case <-time.After(2 * time.Second):
		c.t.Fatal("no message")
		return message{}
	}
}

// until reads messages until one has the given type.
func (c *conn) until(typ string) message {
	c.t.Helper()
	for {
		if m := c.next(); m.Type == typ {
			return m
		}
	}
}

func (c *conn) send(v any) {
	data, _ := json.Marshal(v)
	c.room.Intent(c.client, data)
}

func (c *conn) closed() bool {
	select {
	case <-c.client.Done:
		return true
	case <-time.After(2 * time.Second):
		return false
	}
}

func names(players []contracts.Player) map[string]bool {
	out := map[string]bool{}
	for _, p := range players {
		out[p.DisplayName] = p.Connected
	}
	return out
}

func TestJoinShowsUpForEveryone(t *testing.T) {
	f := setup(t)
	host := f.connect(hostID)
	if m := host.next(); m.Type != "lobby_updated" || m.Host != "Wyatt" || len(m.Players) != 0 {
		t.Fatalf("host's first update %+v", m)
	}

	f.store.add(alice, "Alice")
	a := f.connect(alice)
	for _, c := range []*conn{host, a} {
		m := c.until("lobby_updated")
		if connected, ok := names(m.Players)["Alice"]; !ok || !connected {
			t.Errorf("Alice missing or offline: %+v", m.Players)
		}
	}
}

func TestPresenceAcrossTwoSockets(t *testing.T) {
	f := setup(t)
	host := f.connect(hostID)
	host.next()
	f.store.add(alice, "Alice")
	a1 := f.connect(alice)
	host.until("lobby_updated")
	a2 := f.connect(alice)
	host.until("lobby_updated")

	a1.room.Detach(a1.client)
	if m := host.until("lobby_updated"); !names(m.Players)["Alice"] {
		t.Error("Alice offline with one socket still open")
	}
	a2.room.Detach(a2.client)
	m := host.until("lobby_updated")
	if connected, ok := names(m.Players)["Alice"]; !ok || connected {
		t.Errorf("Alice should be listed and offline: %+v", m.Players)
	}
}

func TestHostOnlyIntents(t *testing.T) {
	f := setup(t)
	f.store.add(alice, "Alice")
	f.store.add(bob, "Bob")
	f.connect(hostID)
	a := f.connect(alice)
	a.next()
	for _, intent := range []any{
		map[string]any{"type": "start_game"},
		map[string]any{"type": "set_host_plays", "plays": true},
	} {
		a.send(intent)
		if m := a.until("error"); m.Code != "not_host" {
			t.Errorf("%v: %q", intent, m.Code)
		}
	}
	if f.store.started != 0 {
		t.Error("a contestant started the game")
	}
}

func TestStartNeedsTwoAndCountsAPlayingHost(t *testing.T) {
	f := setup(t)
	f.store.add(alice, "Alice")
	host := f.connect(hostID)
	host.next()

	host.send(map[string]any{"type": "start_game"})
	if m := host.until("error"); m.Code != "not_enough_players" {
		t.Fatalf("code %q", m.Code)
	}

	host.send(map[string]any{"type": "set_host_plays", "plays": true})
	if m := host.until("lobby_updated"); !m.Plays || !names(m.Players)["Wyatt"] {
		t.Fatalf("host not listed as playing: %+v", m)
	}

	host.send(map[string]any{"type": "start_game"})
	host.send(map[string]any{"type": "start_game"}) // double press
	if m := host.until("phase_changed"); m.Phase != "building_board" {
		t.Fatalf("phase %q", m.Phase)
	}
	if m := host.until("phase_changed"); m.Phase != "board" {
		t.Fatalf("phase %q", m.Phase)
	}
	host.send(map[string]any{"type": "ping"})
	host.until("pong")
	if f.store.started != 1 {
		t.Errorf("start_game ran %d times", f.store.started)
	}

	host.send(map[string]any{"type": "set_display_name", "displayName": "Late"})
	if m := host.until("error"); m.Code != "wrong_phase" {
		t.Errorf("rename after start: %q", m.Code)
	}
}

func TestStartFailureReturnsToLobby(t *testing.T) {
	f := setup(t)
	f.store.add(alice, "Alice")
	f.store.add(bob, "Bob")
	f.store.startErr = errors.New("no clues")
	host := f.connect(hostID)
	host.next()

	host.send(map[string]any{"type": "start_game"})
	host.until("phase_changed")
	if m := host.until("phase_changed"); m.Phase != "lobby" {
		t.Fatalf("phase %q", m.Phase)
	}
	if m := host.until("error"); m.Code != "internal" {
		t.Errorf("code %q", m.Code)
	}
}

func TestRenameAndValidation(t *testing.T) {
	f := setup(t)
	f.store.add(alice, "Alice")
	f.connect(hostID)
	a := f.connect(alice)
	a.next()

	a.send(map[string]any{"type": "set_display_name", "displayName": "Ally"})
	if m := a.until("lobby_updated"); !names(m.Players)["Ally"] {
		t.Errorf("rename not shown: %+v", m.Players)
	}
	for _, bad := range []any{
		map[string]any{"type": "set_display_name", "displayName": ""},
		map[string]any{"type": "set_display_name", "displayName": "   "},
		map[string]any{"type": "set_display_name", "displayName": "123456789012345678901"},
		map[string]any{"type": "set_display_name", "displayName": "A", "extra": 1},
	} {
		a.send(bad)
		if m := a.until("error"); m.Code != "invalid_name" {
			t.Errorf("%v: %q", bad, m.Code)
		}
	}
	a.room.Intent(a.client, []byte("not json"))
	if m := a.until("error"); m.Code != "invalid_message" {
		t.Errorf("garbage: %q", m.Code)
	}
}

func TestLeave(t *testing.T) {
	f := setup(t)
	f.store.add(alice, "Alice")
	host := f.connect(hostID)
	host.next()
	a := f.connect(alice)
	host.until("lobby_updated")

	a.send(map[string]any{"type": "leave_room"})
	if !a.closed() {
		t.Fatal("leaver's socket not released")
	}
	if m := host.until("lobby_updated"); len(m.Players) != 0 {
		t.Errorf("Alice still listed: %+v", m.Players)
	}

	host.send(map[string]any{"type": "leave_room"})
	if m := host.until("error"); m.Code != "invalid_message" {
		t.Errorf("host leave: %q", m.Code)
	}
}

func TestHostAbsenceClosesTheLobby(t *testing.T) {
	f := setup(t)
	f.store.add(alice, "Alice")
	host := f.connect(hostID)
	a := f.connect(alice)
	host.room.Detach(host.client)
	a.until("lobby_updated")

	f.clock.advance(29 * time.Minute)
	time.Sleep(30 * time.Millisecond) // several ticks
	select {
	case <-a.client.Done:
		t.Fatal("closed before 30 minutes")
	default:
	}

	f.clock.advance(time.Minute)
	if m := a.until("room_closed"); m.Reason != "host_absent" {
		t.Errorf("reason %q", m.Reason)
	}
	if !a.closed() || !f.store.closed {
		t.Error("room not closed")
	}
}

func TestHostReturningResetsTheTimer(t *testing.T) {
	f := setup(t)
	f.store.add(alice, "Alice")
	host := f.connect(hostID)
	a := f.connect(alice)
	host.room.Detach(host.client)
	f.clock.advance(20 * time.Minute)
	f.connect(hostID)
	f.clock.advance(20 * time.Minute)
	time.Sleep(30 * time.Millisecond)
	select {
	case <-a.client.Done:
		t.Fatal("closed though the host came back")
	default:
	}
}

func TestClosedElsewhere(t *testing.T) {
	f := setup(t)
	host := f.connect(hostID)
	f.store.setStatus(contracts.RoomStatusClosed)
	if m := host.until("room_closed"); m.Reason != "replaced" {
		t.Errorf("reason %q", m.Reason)
	}
	if !host.closed() {
		t.Error("socket not released")
	}
	// The hub forgets the room, and a closed room can't be reopened.
	deadline := time.Now().Add(time.Second)
	for f.hub.Running() != 0 && time.Now().Before(deadline) {
		time.Sleep(time.Millisecond)
	}
	late := NewClient(hostID)
	f.hub.Attach(roomID, late)
	select {
	case <-late.Done:
	case <-time.After(2 * time.Second):
		t.Error("a closed room accepted a socket")
	}
}
