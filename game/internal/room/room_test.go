package room

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sync"
	"testing"
	"time"
	"unicode/utf8"

	"schmegettes/game/internal/contracts"
	"schmegettes/game/internal/play"
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
	notAHost bool  // the host's access was removed
	hostErr  error // HostCanHost fails
	started  int
	resumed  int
	closed   bool

	game    GameData
	records []string
	ended   contracts.GameStatus

	selfRenames []string // SetName calls: remembered as the player's name
	hostRenames []string // RenameMember calls: this room only

	failAnswers bool // RecordAnswer always fails
	answerLen   int  // characters in the last answer written
	lastAnswer  play.Record
}

func newFakeStore() *fakeStore {
	return &fakeStore{
		lobby: Lobby{
			Status: contracts.RoomStatusOpen, HostID: hostID, MaxPlayers: 6,
			Members: []Member{{UserID: hostID, Name: "Wyatt", Role: contracts.PlayerRoleHost}},
		},
		game: GameData{
			GameID:  "game-1",
			Players: []play.Player{{UserID: alice, Name: "Alice"}, {UserID: bob, Name: "Bob"}},
			Board:   miniBoard(),
		},
	}
}

// miniBoard is one clue per round, so a test can play a whole game.
func miniBoard() []play.Clue {
	return []play.Clue{
		{ID: "clue-s", Round: contracts.RoundSingle, Category: "SCIENCE", Value: 200,
			Text: "This gas makes up 78 percent of the air", Response: "Nitrogen", State: contracts.ClueStateUnplayed},
		{ID: "clue-d", Round: contracts.RoundDouble, Category: "OPERA", Value: 800,
			Text: "Verdi wrote this Egyptian opera", Response: "Aida", State: contracts.ClueStateUnplayed},
	}
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
	s.selfRenames = append(s.selfRenames, userID)
	for i := range s.lobby.Members {
		if s.lobby.Members[i].UserID == userID {
			s.lobby.Members[i].Name = name
		}
	}
	return nil
}

// renames returns copies of the SetName and RenameMember calls so far, under the lock.
func (s *fakeStore) renames() (self, host []string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return append([]string(nil), s.selfRenames...), append([]string(nil), s.hostRenames...)
}

func (s *fakeStore) RenameMember(_ context.Context, _, userID, name string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.hostRenames = append(s.hostRenames, userID)
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

func (s *fakeStore) StartResumed(context.Context, string) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.resumed++
	s.lobby.Status = contracts.RoomStatusInGame
	s.lobby.Resume = nil
	return s.game.GameID, nil
}

func (s *fakeStore) StartGame(context.Context, string) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.started++
	if s.notAHost {
		return "", ErrNotAHost // start_game refuses a host without access
	}
	if s.startErr != nil {
		return "", s.startErr
	}
	s.lobby.Status = contracts.RoomStatusInGame
	return "game-1", nil
}

func (s *fakeStore) HostCanHost(context.Context, string) (bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return !s.notAHost, s.hostErr
}

func (s *fakeStore) Close(context.Context, string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.closed = true
	s.lobby.Status = contracts.RoomStatusClosed
	return nil
}

func (s *fakeStore) LoadGame(context.Context, string) (GameData, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.game.GameID == "" {
		return GameData{}, ErrNotFound
	}
	return s.game, nil
}

func (s *fakeStore) log(rec string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.records = append(s.records, rec)
}

func (s *fakeStore) RevealClue(_ context.Context, id string) error { s.log("reveal " + id); return nil }
func (s *fakeStore) RecordAnswer(_ context.Context, r play.Record) error {
	s.mu.Lock()
	fail := s.failAnswers
	s.answerLen = utf8.RuneCountInString(r.Answer)
	s.lastAnswer = r
	s.mu.Unlock()
	if fail {
		return errors.New("check constraint")
	}
	s.log("answer " + r.ClueID + " " + r.UserID + " " + string(r.Verdict))
	return nil
}
func (s *fakeStore) RecordWager(_ context.Context, r play.Record) error {
	s.log(fmt.Sprintf("wager %s %s %d", r.ClueID, r.UserID, r.Amount))
	return nil
}
func (s *fakeStore) SubmitFinalAnswer(_ context.Context, r play.Record) error {
	s.log("final answer " + r.UserID + " " + r.Answer)
	return nil
}
func (s *fakeStore) UpdateVerdict(_ context.Context, r play.Record) error {
	s.log(fmt.Sprintf("override %s %s %d", r.AnswerID, r.Verdict, r.Delta))
	return nil
}
func (s *fakeStore) FinishClue(_ context.Context, id string, st contracts.ClueState) error {
	s.log("finish " + id + " " + string(st))
	return nil
}
func (s *fakeStore) EndGame(_ context.Context, _ string, st contracts.GameStatus) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.ended = st
	s.records = append(s.records, "end "+string(st))
	s.lobby.Status = contracts.RoomStatusOpen
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
	t      *testing.T
	store  *fakeStore
	clock  *clock
	hub    *Hub
	timers *timers
}

// timers stands in for time.AfterFunc: tests fire the latest one on demand.
type timers struct {
	mu   sync.Mutex
	next func()
}

func (tm *timers) after(_ time.Duration, f func()) func() bool {
	tm.mu.Lock()
	defer tm.mu.Unlock()
	tm.next = f
	return func() bool { return true }
}

// fireAfter waits until the room has handled everything sent so far (a ping's pong comes back
// only after earlier events, including arming the next timer), then fires the latest timer.
func (tm *timers) fireAfter(c *conn) {
	c.t.Helper()
	c.send(map[string]any{"type": "ping"})
	c.until("pong")
	tm.mu.Lock()
	f := tm.next
	tm.mu.Unlock()
	if f == nil {
		c.t.Fatal("no timer armed")
	}
	f()
}

// readingDone reports the TV finished reading, once the pick reveal is over: it waits for the
// room to handle everything sent so far (the pick), moves the clock past the reveal, then
// sends reading_done.
func (f *fixture) readingDone(tv *conn, clueID string) {
	tv.t.Helper()
	tv.send(map[string]any{"type": "ping"})
	tv.until("pong")
	f.clock.advance(play.PickReveal)
	tv.send(map[string]any{"type": "reading_done", "clueId": clueID})
}

func setup(t *testing.T) *fixture { t.Helper(); return setupWith(t, nil) }

// setupWith is setup with the room config adjusted by opt.
func setupWith(t *testing.T, opt func(*Config)) *fixture {
	t.Helper()
	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	clk := &clock{now: time.Unix(1_800_000_000, 0)}
	store := newFakeStore()
	tm := &timers{}
	cfg := Config{HostAbsence: 30 * time.Minute, Tick: 5 * time.Millisecond, Now: clk.Now, AfterFunc: tm.after}
	if opt != nil {
		opt(&cfg)
	}
	return &fixture{t: t, store: store, clock: clk, hub: NewHub(ctx, store, cfg), timers: tm}
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
	Resume  *struct {
		Players []struct {
			UserID string `json:"userId"`
			Score  int    `json:"score"`
			Back   bool   `json:"back"`
		} `json:"players"`
	} `json:"resume"`
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

// settle waits until the room has handled every event sent before it: the room handles
// events one at a time, so a pong comes back only after them.
func (c *conn) settle() {
	c.t.Helper()
	c.send(map[string]any{"type": "ping"})
	c.until("pong")
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
	a2 := f.connect(alice) // another device: it takes the seat over
	if m := host.until("lobby_updated"); !names(m.Players)["Alice"] {
		t.Error("Alice offline while her new socket is open")
	}
	if !a1.closed() {
		t.Fatal("the first socket should be closed")
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

func TestStartNeedsOneAndCountsAPlayingHost(t *testing.T) {
	f := setup(t)
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

func TestHostRenamesAMember(t *testing.T) {
	f := setup(t)
	f.store.add(alice, "Alice")
	f.store.add(bob, "Bob")
	host := f.connect(hostID)
	host.next()
	a := f.connect(alice)
	host.until("lobby_updated")

	// The host renames Alice: everyone sees it, and it isn't remembered as her name.
	host.send(map[string]any{"type": "set_display_name", "displayName": "Dan", "userId": alice})
	// Alice's own connect may still be queued: wait for the update that carries the rename.
	renamed := false
	for i := 0; i < 3 && !renamed; i++ {
		m := a.until("lobby_updated")
		renamed = names(m.Players)["Dan"] && !names(m.Players)["Alice"]
	}
	if !renamed {
		t.Error("host rename not shown to the renamed player")
	}
	self, hostRenames := f.store.renames()
	if len(hostRenames) != 1 || hostRenames[0] != alice {
		t.Errorf("host renames %v", hostRenames)
	}
	if len(self) != 0 {
		t.Errorf("a host rename went through SetName: %v", self)
	}

	// The host's own id is the self path: remembered.
	host.send(map[string]any{"type": "set_display_name", "displayName": "Wy", "userId": hostID})
	host.send(map[string]any{"type": "ping"}) // intents run in order: after the pong, the rename is done
	host.until("pong")
	if self, _ := f.store.renames(); len(self) != 1 || self[0] != hostID {
		t.Errorf("self renames %v", self)
	}

	// Only the host renames others.
	a.send(map[string]any{"type": "set_display_name", "displayName": "Robert", "userId": bob})
	if m := a.until("error"); m.Code != "not_host" {
		t.Errorf("non-host rename: %q", m.Code)
	}
	// Someone who isn't in the room.
	host.send(map[string]any{"type": "set_display_name", "displayName": "X", "userId": "99999999-9999-4999-8999-999999999999"})
	if m := host.until("error"); m.Code != "invalid_message" {
		t.Errorf("unknown member: %q", m.Code)
	}
	// Names are 1 to 20 characters, for others too.
	host.send(map[string]any{"type": "set_display_name", "displayName": "123456789012345678901", "userId": alice})
	if m := host.until("error"); m.Code != "invalid_name" {
		t.Errorf("long name: %q", m.Code)
	}
	if _, hostRenames := f.store.renames(); len(hostRenames) != 1 {
		t.Errorf("refused renames reached the store: %v", hostRenames)
	}
}

func TestHostCantRenameInAResumeLobby(t *testing.T) {
	f := setup(t)
	f.store.add(alice, "Alice")
	f.store.lobby.Resume = &Resume{}
	host := f.connect(hostID)
	host.next()

	host.send(map[string]any{"type": "set_display_name", "displayName": "Dan", "userId": alice})
	if m := host.until("error"); m.Code != "wrong_phase" {
		t.Errorf("resume lobby rename: %q", m.Code)
	}
	if _, hostRenames := f.store.renames(); len(hostRenames) != 0 {
		t.Errorf("renamed in a resume lobby: %v", hostRenames)
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
	a.settle() // the room has recorded when the host left

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
	a.settle()
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
		t.Fatal("a closed room accepted a socket")
	}
	// A socket that missed the first room_closed is told why, so it stops reconnecting.
	select {
	case data := <-late.Out:
		var m message
		_ = json.Unmarshal(data, &m)
		if m.Type != "room_closed" || m.Reason != "closed" {
			t.Errorf("late socket got %s", data)
		}
	default:
		t.Error("late socket was dropped without room_closed")
	}
}

func TestAnotherDeviceTakesTheSeatOver(t *testing.T) {
	f := setup(t)
	f.store.add(alice, "Alice")
	f.connect(hostID)
	first := f.connect(alice)
	f.connect(alice) // the same account on another device
	if !first.closed() {
		t.Fatal("the older socket is still open")
	}
	if first.client.CloseCode != CloseOtherDevice {
		t.Errorf("close code %d, want %d", first.client.CloseCode, CloseOtherDevice)
	}
}

func TestTheHostsSecondTabIsNotTakenOver(t *testing.T) {
	f := setup(t)
	first := f.connect(hostID)
	f.connect(hostID)
	if first.closed() {
		t.Error("the host's first socket was closed")
	}
}

func TestResumeLobbyThenStart(t *testing.T) {
	f := setup(t)
	f.store.mu.Lock()
	f.store.lobby.Resume = &Resume{GameID: "game-1", StartedAt: time.Unix(1_700_000_000, 0), Players: []ResumePlayer{
		{UserID: alice, Name: "Alice", Score: 1200}, {UserID: bob, Name: "Bob", Score: 400},
	}}
	f.store.game.Scores = map[string]int{alice: 1200, bob: 400}
	f.store.mu.Unlock()
	f.store.add(alice, "Alice")

	host := f.connect(hostID)
	a := f.connect(alice)
	m := host.until("lobby_updated")
	if m.Resume == nil || len(m.Resume.Players) != 2 || !m.Resume.Players[0].Back || m.Resume.Players[1].Back {
		t.Fatalf("resume payload %+v", m.Resume)
	}

	host.send(map[string]any{"type": "start_game"})
	snap := a.until("room_snapshot")
	if snap.Phase != "board" {
		t.Fatalf("phase %q after resuming", snap.Phase)
	}
	if f.store.resumed != 1 || f.store.started != 0 {
		t.Errorf("resumed %d, started %d", f.store.resumed, f.store.started)
	}
	// Bob isn't back: he keeps his seat and score, shown away.
	var bobSeat *contracts.Player
	for i := range snap.Players {
		if string(snap.Players[i].UserId) == bob {
			bobSeat = &snap.Players[i]
		}
	}
	if bobSeat == nil || bobSeat.Connected || bobSeat.Score != 400 {
		t.Errorf("Bob's seat %+v", bobSeat)
	}
}
