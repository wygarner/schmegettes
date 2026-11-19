// Package room runs live rooms. Each room is one goroutine that owns its state; sockets talk
// to it through channels, so intents are handled one at a time. For now a room lives on a
// single game/ instance: lobby state is rebuilt from Postgres, so a restart costs a reconnect.
// See docs/system-docs/architecture/realtime-game-server.md.
package room

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"strings"
	"time"
	"unicode/utf8"

	"schmegettes/game/internal/contracts"
	"schmegettes/game/internal/play"
)

// Store errors.
var (
	ErrNotFound    = errors.New("room not found")
	ErrRoomFull    = errors.New("room full")
	ErrNotOpen     = errors.New("room not open")
	ErrInvalidName = errors.New("invalid name")
	ErrNotAHost    = errors.New("not a host") // the room's host has no host access (private access)
)

// Member is one row of room_members, with the name to show.
type Member struct {
	UserID string
	Name   string
	Role   contracts.PlayerRole
}

// Lobby is a room as stored: status, host, and members in join order.
type Lobby struct {
	Status     contracts.RoomStatus
	HostID     string
	HostPlays  bool
	MaxPlayers int
	Members    []Member
	// Resume is set in a resume lobby: the abandoned game being resumed.
	Resume *Resume
}

// Resume is the game a resume lobby resumes, with its contestants and their scores.
type Resume struct {
	GameID    string
	StartedAt time.Time
	Players   []ResumePlayer
}

// ResumePlayer is one of the resumed game's contestants, in join order.
type ResumePlayer struct {
	UserID string
	Name   string
	Score  int
}

// Store is the database work a room needs. PGStore runs it as game_engine.
type Store interface {
	Load(ctx context.Context, roomID string) (Lobby, error)
	SetName(ctx context.Context, roomID, userID, name string) error
	SetHostPlays(ctx context.Context, roomID string, plays bool) error
	Leave(ctx context.Context, roomID, userID string) error
	StartGame(ctx context.Context, roomID string) (gameID string, err error)
	// StartResumed starts a resume lobby's game where it stopped (start_resumed_game).
	StartResumed(ctx context.Context, roomID string) (gameID string, err error)
	// HostCanHost reports whether the room's host still has host access.
	HostCanHost(ctx context.Context, roomID string) (bool, error)
	Close(ctx context.Context, roomID string) error

	// Gameplay, as game_engine (supabase functions; see realtime-game-server.md, "Recording").
	LoadGame(ctx context.Context, roomID string) (GameData, error)
	RevealClue(ctx context.Context, clueID string) error
	RecordAnswer(ctx context.Context, rec play.Record) error
	RecordWager(ctx context.Context, rec play.Record) error
	SubmitFinalAnswer(ctx context.Context, rec play.Record) error
	UpdateVerdict(ctx context.Context, rec play.Record) error
	FinishClue(ctx context.Context, clueID string, state contracts.ClueState) error
	EndGame(ctx context.Context, gameID string, status contracts.GameStatus) error
}

// Config holds a room's timings. Tests shorten them.
type Config struct {
	// HostAbsence closes a lobby whose host device has been gone this long.
	HostAbsence time.Duration
	// Tick is how often a room checks host absence and whether it was closed elsewhere.
	Tick time.Duration
	// Now is the clock.
	Now func() time.Time
	// AfterFunc runs f after d and returns a function that cancels it (time.AfterFunc).
	AfterFunc func(d time.Duration, f func()) (stop func() bool)
}

// DefaultConfig is the production timing.
func DefaultConfig() Config {
	return Config{
		HostAbsence: 30 * time.Minute, Tick: 30 * time.Second, Now: time.Now,
		AfterFunc: func(d time.Duration, f func()) func() bool { return time.AfterFunc(d, f).Stop },
	}
}

// Client is one socket. The room writes encoded server messages to Out and closes Done when
// it stops serving the client (left the room, room closed, or too slow to keep up).
type Client struct {
	UserID string
	Out    chan []byte
	Done   chan struct{}
	// CloseCode, when set before Done closes, is the WebSocket close code to send (for
	// example CloseOtherDevice). Zero is a normal closure.
	CloseCode int
}

// CloseOtherDevice closes a player's older socket when they open the game on another
// device: the old page says so and doesn't reconnect.
const CloseOtherDevice = 4001

// NewClient makes a client with a send buffer.
func NewClient(userID string) *Client {
	return &Client{UserID: userID, Out: make(chan []byte, 64), Done: make(chan struct{})}
}

type eventKind int

const (
	evAttach eventKind = iota
	evDetach
	evIntent
	evTimer
)

type event struct {
	kind   eventKind
	client *Client
	data   []byte
	gen    int // evTimer: which schedule() armed it
}

// Room is one live room.
type Room struct {
	id     string
	store  Store
	cfg    Config
	events chan event
	done   chan struct{}

	// Owned by run().
	lobby      Lobby
	phase      contracts.GamePhase
	seq        int
	clients    map[*Client]bool
	hostGoneAt time.Time // zero while a host socket is open
	log        *slog.Logger

	// The game in progress, once Start succeeds (or on load of a room in a game).
	game       *play.Game
	gameID     string
	pending    []play.Record
	writeTries int // failures of pending[0]
	stopTimer  func() bool
	timerGen   int
}

func newRoom(id string, store Store, cfg Config) *Room {
	return &Room{
		id: id, store: store, cfg: cfg,
		events:  make(chan event),
		done:    make(chan struct{}),
		clients: map[*Client]bool{},
		log:     slog.With("room_id", id),
	}
}

// send delivers an event unless the room has stopped.
func (r *Room) send(ev event) bool {
	select {
	case r.events <- ev:
		return true
	case <-r.done:
		return false
	}
}

// Intent passes a client's raw message to the room.
func (r *Room) Intent(c *Client, data []byte) { r.send(event{kind: evIntent, client: c, data: data}) }

// Detach removes a client whose socket closed.
func (r *Room) Detach(c *Client) { r.send(event{kind: evDetach, client: c}) }

// load reads the room. It reports false when the room can't be served.
func (r *Room) load(ctx context.Context) bool {
	lobby, err := r.store.Load(ctx, r.id)
	if err != nil {
		if !errors.Is(err, ErrNotFound) {
			r.log.Error("room load failed", "err", err)
		}
		return false
	}
	r.lobby = lobby
	switch lobby.Status {
	case contracts.RoomStatusClosed:
		return false
	case contracts.RoomStatusInGame:
		r.phase = contracts.GamePhaseBoard
		if !r.loadGame(ctx) {
			return false
		}
	default:
		r.phase = contracts.GamePhaseLobby
	}
	r.hostGoneAt = r.cfg.Now()
	r.log.Info("room loaded", "phase", r.phase)
	return true
}

// run is the room's loop. It returns when the room closes or empties out of the lobby.
func (r *Room) run(ctx context.Context, first *Client, onExit func()) {
	// Leave the hub before closing done, so a socket that finds the room stopped gets a new one.
	defer close(r.done)
	defer onExit()
	if !r.load(ctx) {
		// Tell the socket why before letting it go; a client that missed the original
		// room_closed would otherwise keep reconnecting.
		r.sendTo(first, contracts.RoomClosed{Type: "room_closed", RoomId: contracts.Uuid(r.id), Reason: contracts.RoomClosedReasonClosed})
		close(first.Done)
		return
	}
	r.attach(ctx, first)

	ticker := time.NewTicker(r.cfg.Tick)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			r.drop("shutdown")
			if r.stopTimer != nil {
				r.stopTimer()
			}
			return
		case ev := <-r.events:
			switch ev.kind {
			case evAttach:
				r.attach(ctx, ev.client)
			case evDetach:
				r.detach(ev.client)
			case evIntent:
				r.handle(ctx, ev.client, ev.data)
			case evTimer:
				r.fire(ctx, ev.gen)
			}
		case <-ticker.C:
			if r.tick(ctx) {
				return
			}
		}
		// A finished game has nothing left to run. A game in progress stays loaded so its
		// pause and abandonment timers keep running; a lobby closes on host absence.
		if len(r.clients) == 0 && r.phase == contracts.GamePhaseFinished {
			r.drop("empty")
			return
		}
	}
}

// tick closes the room when its host has been gone too long or it was closed elsewhere.
// It reports whether the room stopped.
func (r *Room) tick(ctx context.Context) bool {
	r.flush(ctx)
	if r.game != nil && !r.game.Over() && !r.hostGoneAt.IsZero() &&
		r.cfg.Now().Sub(r.hostGoneAt) >= r.cfg.HostAbsence {
		return r.abandon(ctx)
	}
	if r.phase == contracts.GamePhaseLobby && !r.hostGoneAt.IsZero() &&
		r.cfg.Now().Sub(r.hostGoneAt) >= r.cfg.HostAbsence {
		if err := r.store.Close(ctx, r.id); err != nil {
			r.log.Error("room close failed", "err", err)
			return false
		}
		r.closeRoom(contracts.RoomClosedReasonHostAbsent)
		return true
	}
	lobby, err := r.store.Load(ctx, r.id)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			r.closeRoom(contracts.RoomClosedReasonReplaced)
			return true
		}
		r.log.Warn("room status check failed", "err", err)
		return false
	}
	if lobby.Status == contracts.RoomStatusClosed {
		r.closeRoom(contracts.RoomClosedReasonReplaced)
		return true
	}
	return false
}

func (r *Room) closeRoom(reason contracts.RoomClosedReason) {
	r.log.Info("room closed", "reason", reason)
	r.broadcast(contracts.RoomClosed{Type: "room_closed", RoomId: contracts.Uuid(r.id), Reason: reason})
	r.drop(string(reason))
}

// drop stops serving every client.
func (r *Room) drop(reason string) {
	for c := range r.clients {
		r.release(c)
	}
	r.log.Info("room dropped", "reason", reason)
}

func (r *Room) release(c *Client) {
	if r.clients[c] {
		delete(r.clients, c)
		close(c.Done)
	}
}

func (r *Room) hostConnected() bool {
	for c := range r.clients {
		if c.UserID == r.lobby.HostID {
			return true
		}
	}
	return false
}

func (r *Room) attach(ctx context.Context, c *Client) {
	// A player on a new device takes their seat over: the older socket closes with
	// CloseOtherDevice. The host's TV view has its own rule (only the host's session).
	if c.UserID != r.lobby.HostID {
		for old := range r.clients {
			if old.UserID != c.UserID {
				continue
			}
			old.CloseCode = CloseOtherDevice
			r.release(old)
			r.log.Info("socket replaced", "user_id", c.UserID)
			if r.game != nil {
				r.applyGame(ctx, r.game.Disconnect(r.cfg.Now(), old.UserID))
			}
		}
	}
	r.clients[c] = true
	if c.UserID == r.lobby.HostID {
		r.hostGoneAt = time.Time{}
	}
	// A new socket may be a new member (they joined through api/), so reload before telling
	// anyone. The snapshot goes to the newcomer; the update goes to everyone.
	if r.phase == contracts.GamePhaseLobby {
		r.reload(ctx)
	}
	r.sendTo(c, r.snapshotFor(c))
	if r.phase == contracts.GamePhaseLobby {
		r.broadcast(r.lobbyUpdated())
	}
	if r.game != nil {
		r.applyGame(ctx, r.game.Connect(r.cfg.Now(), c.UserID))
	}
}

func (r *Room) detach(c *Client) {
	if !r.clients[c] {
		return
	}
	r.release(c)
	if c.UserID == r.lobby.HostID && !r.hostConnected() {
		r.hostGoneAt = r.cfg.Now()
	}
	if r.phase == contracts.GamePhaseLobby {
		r.broadcast(r.lobbyUpdated())
	}
	if r.game != nil {
		r.applyGame(context.Background(), r.game.Disconnect(r.cfg.Now(), c.UserID))
	}
}

func (r *Room) reload(ctx context.Context) {
	lobby, err := r.store.Load(ctx, r.id)
	if err != nil {
		r.log.Warn("room reload failed", "err", err)
		return
	}
	r.lobby = lobby
}

// players lists contestants and spectators in join order, plus the host while they play.
func (r *Room) players() []contracts.Player {
	online := map[string]bool{}
	for c := range r.clients {
		online[c.UserID] = true
	}
	out := []contracts.Player{}
	for _, m := range r.lobby.Members {
		if m.Role == contracts.PlayerRoleHost && !r.lobby.HostPlays {
			continue
		}
		score := 0
		if r.game != nil {
			score = r.game.Scores()[m.UserID]
		}
		out = append(out, contracts.Player{
			UserId: contracts.Uuid(m.UserID), DisplayName: m.Name, Role: m.Role, Connected: online[m.UserID], Score: score,
		})
	}
	// A resumed game's contestants who aren't back keep their seat and score, shown as away.
	if r.game != nil {
		member := map[string]bool{}
		for _, m := range r.lobby.Members {
			member[m.UserID] = true
		}
		for _, p := range r.game.Players() {
			if member[p.UserID] {
				continue
			}
			out = append(out, contracts.Player{
				UserId: contracts.Uuid(p.UserID), DisplayName: p.Name, Role: contracts.PlayerRoleContestant,
				Connected: false, Score: r.game.Scores()[p.UserID],
			})
		}
	}
	return out
}

// resumeLobby is the resume payload: the game's contestants, and who is back.
func (r *Room) resumeLobby() *contracts.ResumeLobby {
	res := r.lobby.Resume
	if res == nil {
		return nil
	}
	member := map[string]bool{}
	for _, m := range r.lobby.Members {
		member[m.UserID] = true
	}
	out := &contracts.ResumeLobby{
		GameId: contracts.Uuid(res.GameID), StartedAt: int(res.StartedAt.UnixMilli()),
		Players: []contracts.ResumeLobbyPlayersElem{},
	}
	for _, p := range res.Players {
		out.Players = append(out.Players, contracts.ResumeLobbyPlayersElem{
			UserId: contracts.Uuid(p.UserID), DisplayName: p.Name, Score: p.Score, Back: member[p.UserID],
		})
	}
	return out
}

func (r *Room) contestants() int {
	n := 0
	for _, m := range r.lobby.Members {
		if m.Role == contracts.PlayerRoleContestant || (m.Role == contracts.PlayerRoleHost && r.lobby.HostPlays) {
			n++
		}
	}
	return n
}

func (r *Room) hostName() string {
	for _, m := range r.lobby.Members {
		if m.UserID == r.lobby.HostID {
			return m.Name
		}
	}
	return ""
}

func (r *Room) snapshot() contracts.RoomSnapshot {
	name, plays, maxPlayers := r.hostName(), r.lobby.HostPlays, r.lobby.MaxPlayers
	return contracts.RoomSnapshot{
		Type: "room_snapshot", RoomId: contracts.Uuid(r.id), Seq: r.seq, Phase: r.phase,
		Round: contracts.RoundSingle, Players: r.players(), Board: []contracts.BoardClue{},
		HostDisplayName: &name, HostPlays: &plays, MaxPlayers: &maxPlayers, Resume: r.resumeLobby(),
	}
}

// snapshotFor is the snapshot for one socket: with a game, the host's copy carries the
// active clue's text.
func (r *Room) snapshotFor(c *Client) contracts.RoomSnapshot {
	snap := r.snapshot()
	if r.game != nil {
		r.game.SnapshotFields(&snap, c.UserID == r.lobby.HostID)
		if c.UserID != r.lobby.HostID {
			r.game.PrivateSnapshot(&snap, c.UserID)
		}
	}
	return snap
}

func (r *Room) lobbyUpdated() contracts.LobbyUpdated {
	return contracts.LobbyUpdated{
		Type: "lobby_updated", RoomId: contracts.Uuid(r.id),
		HostUserId: contracts.Uuid(r.lobby.HostID), HostDisplayName: r.hostName(),
		HostPlays: r.lobby.HostPlays, MaxPlayers: r.lobby.MaxPlayers, Players: r.players(), Resume: r.resumeLobby(),
	}
}

// broadcast stamps the next seq on msg and sends it to every client.
func (r *Room) broadcast(msg any) {
	r.seq++
	switch m := msg.(type) {
	case contracts.LobbyUpdated:
		m.Seq = r.seq
		msg = m
	case contracts.PhaseChanged:
		m.Seq = r.seq
		msg = m
	case contracts.RoomClosed:
		m.Seq = r.seq
		msg = m
	}
	data, err := json.Marshal(msg)
	if err != nil {
		r.log.Error("encode failed", "err", err)
		return
	}
	for c := range r.clients {
		r.deliver(c, data)
	}
}

func (r *Room) sendTo(c *Client, msg any) {
	data, err := json.Marshal(msg)
	if err != nil {
		r.log.Error("encode failed", "err", err)
		return
	}
	r.deliver(c, data)
}

// deliver never blocks the room: a client that can't keep up is dropped and reconnects.
func (r *Room) deliver(c *Client, data []byte) {
	select {
	case c.Out <- data:
	default:
		r.log.Warn("client too slow, dropping", "user_id", c.UserID)
		r.release(c)
	}
}

// refuseHost tells the host's devices (only) that their host access was removed.
func (r *Room) refuseHost() {
	for c := range r.clients {
		if c.UserID == r.lobby.HostID {
			r.fail(c, contracts.ErrorCodeNotAHost, "Your host access was removed, so you can't start games.")
		}
	}
}

func (r *Room) fail(c *Client, code contracts.ErrorCode, message string) {
	e := contracts.Error{Type: "error", Code: code}
	if message != "" {
		e.Message = &message
	}
	r.sendTo(c, e)
}

// decode reads a message strictly: unknown fields are rejected, as the schema says.
func decode(data []byte, into any) bool {
	dec := json.NewDecoder(strings.NewReader(string(data)))
	dec.DisallowUnknownFields()
	return dec.Decode(into) == nil
}

func validName(name string) bool {
	n := utf8.RuneCountInString(name)
	return n >= 1 && n <= 20 && strings.TrimSpace(name) != ""
}

func (r *Room) handle(ctx context.Context, c *Client, data []byte) {
	if !r.clients[c] {
		return
	}
	var envelope struct {
		Type string `json:"type"`
	}
	if err := json.Unmarshal(data, &envelope); err != nil {
		r.fail(c, contracts.ErrorCodeInvalidMessage, "")
		return
	}
	isHost := c.UserID == r.lobby.HostID

	switch envelope.Type {
	case "ping":
		if !decode(data, &contracts.Ping{}) {
			r.fail(c, contracts.ErrorCodeInvalidMessage, "")
			return
		}
		r.sendTo(c, contracts.Pong{Type: "pong", ServerTime: int(r.cfg.Now().UnixMilli())})

	case "set_display_name":
		var m contracts.SetDisplayName
		if !decode(data, &m) || !validName(m.DisplayName) {
			r.fail(c, contracts.ErrorCodeInvalidName, "Names are 1 to 20 characters")
			return
		}
		if r.phase != contracts.GamePhaseLobby {
			r.fail(c, contracts.ErrorCodeWrongPhase, "")
			return
		}
		r.apply(ctx, c, r.store.SetName(ctx, r.id, c.UserID, m.DisplayName))

	case "set_host_plays":
		var m contracts.SetHostPlays
		if !decode(data, &m) {
			r.fail(c, contracts.ErrorCodeInvalidMessage, "")
			return
		}
		if !isHost {
			r.fail(c, contracts.ErrorCodeNotHost, "")
			return
		}
		if r.phase != contracts.GamePhaseLobby {
			r.fail(c, contracts.ErrorCodeWrongPhase, "")
			return
		}
		r.apply(ctx, c, r.store.SetHostPlays(ctx, r.id, m.Plays))

	case "leave_room":
		if !decode(data, &contracts.LeaveRoom{}) {
			r.fail(c, contracts.ErrorCodeInvalidMessage, "")
			return
		}
		if isHost {
			r.fail(c, contracts.ErrorCodeInvalidMessage, "The host can't leave the room")
			return
		}
		// A player may leave in the lobby, or on the final scoreboard (the game has ended).
		if r.phase != contracts.GamePhaseLobby && r.phase != contracts.GamePhaseFinished {
			r.fail(c, contracts.ErrorCodeWrongPhase, "")
			return
		}
		if err := r.store.Leave(ctx, r.id, c.UserID); err != nil {
			r.log.Error("leave failed", "err", err, "user_id", c.UserID)
			r.fail(c, contracts.ErrorCodeInternal, "")
			return
		}
		for other := range r.clients {
			if other.UserID == c.UserID {
				r.release(other)
			}
		}
		r.reload(ctx)
		if r.phase == contracts.GamePhaseLobby {
			r.broadcast(r.lobbyUpdated())
		}

	case "rematch":
		if !decode(data, &contracts.Rematch{}) {
			r.fail(c, contracts.ErrorCodeInvalidMessage, "")
			return
		}
		if !isHost {
			r.fail(c, contracts.ErrorCodeNotHost, "")
			return
		}
		if r.phase != contracts.GamePhaseFinished {
			if r.phase != contracts.GamePhaseLobby { // a second press once back in the lobby is a no-op
				r.fail(c, contracts.ErrorCodeWrongPhase, "")
			}
			return
		}
		r.rematch(ctx)

	case "start_game":
		if !decode(data, &contracts.StartGame{}) {
			r.fail(c, contracts.ErrorCodeInvalidMessage, "")
			return
		}
		if !isHost {
			r.fail(c, contracts.ErrorCodeNotHost, "")
			return
		}
		if r.phase != contracts.GamePhaseLobby {
			return // a second press while starting
		}
		if r.contestants() < 1 {
			r.fail(c, contracts.ErrorCodeNotEnoughPlayers, "Need at least 1 player")
			return
		}
		r.start(ctx, c)

	default:
		if !r.handleGame(ctx, c, envelope.Type, data) {
			r.fail(c, contracts.ErrorCodeInvalidMessage, "")
		}
	}
}

// apply finishes a lobby change: refresh the room and tell everyone, or report the error.
func (r *Room) apply(ctx context.Context, c *Client, err error) {
	switch {
	case err == nil:
		r.reload(ctx)
		r.broadcast(r.lobbyUpdated())
	case errors.Is(err, ErrInvalidName):
		r.fail(c, contracts.ErrorCodeInvalidName, "Names are 1 to 20 characters")
	case errors.Is(err, ErrRoomFull):
		r.fail(c, contracts.ErrorCodeRoomFull, "")
	case errors.Is(err, ErrNotOpen):
		r.fail(c, contracts.ErrorCodeGameStarted, "")
	default:
		r.log.Error("lobby change failed", "err", err, "user_id", c.UserID)
		r.fail(c, contracts.ErrorCodeInternal, "")
	}
}

func (r *Room) start(ctx context.Context, host *Client) {
	r.log.Info("game start requested", "user_id", host.UserID)
	resuming := r.lobby.Resume != nil
	r.setPhase(contracts.GamePhaseBuildingBoard)
	start := r.store.StartGame
	if resuming {
		start = r.store.StartResumed
	}
	gameID, err := start(ctx, r.id)
	if errors.Is(err, ErrNotAHost) {
		r.log.Info("start refused: not a host", "room_id", r.id)
		r.setPhase(contracts.GamePhaseLobby)
		r.refuseHost()
		return
	}
	if err != nil {
		r.log.Error("start_game failed", "err", err, "user_id", host.UserID)
		r.setPhase(contracts.GamePhaseLobby)
		msg := "Couldn't build a board. Try again."
		data, _ := json.Marshal(contracts.Error{Type: "error", Code: contracts.ErrorCodeInternal, Message: &msg})
		for c := range r.clients {
			r.deliver(c, data)
		}
		return
	}
	r.log.Info("game started", "game_id", gameID, "resumed", resuming)
	r.lobby.Status = contracts.RoomStatusInGame
	r.lobby.Resume = nil
	if !r.loadGame(ctx) {
		r.setPhase(contracts.GamePhaseLobby)
		msg := "Couldn't load the board. Try again."
		data, _ := json.Marshal(contracts.Error{Type: "error", Code: contracts.ErrorCodeInternal, Message: &msg})
		for c := range r.clients {
			r.deliver(c, data)
		}
		return
	}
	if resuming {
		// The game picks up where it stopped: everyone gets the whole state, as after a restart.
		r.log.Info("game resumed", "game_id", gameID, "players_back", r.contestants())
		for c := range r.clients {
			r.sendTo(c, r.snapshotFor(c))
		}
		r.connectAll(ctx)
		return
	}
	r.startRound(ctx)
}

// rematch takes everyone still in the room back to the lobby after a finished game. The
// database already reopened the room (end_game), so Start builds a fresh board as usual.
func (r *Room) rematch(ctx context.Context) {
	// Checked before anything is reset, so a refused host keeps the final scoreboard.
	canHost, err := r.store.HostCanHost(ctx, r.id)
	if err != nil {
		r.log.Error("host access check failed", "err", err, "room_id", r.id)
		for c := range r.clients {
			if c.UserID == r.lobby.HostID {
				r.fail(c, contracts.ErrorCodeInternal, "")
			}
		}
		return
	}
	if !canHost {
		r.log.Info("rematch refused: not a host", "room_id", r.id)
		r.refuseHost()
		return
	}
	r.flush(ctx)
	if r.stopTimer != nil {
		r.stopTimer()
		r.stopTimer = nil
	}
	r.game, r.gameID, r.pending, r.writeTries = nil, "", nil, 0
	r.phase = contracts.GamePhaseLobby
	r.reload(ctx)
	r.lobby.Status = contracts.RoomStatusOpen
	r.log.Info("rematch", "members", len(r.lobby.Members))
	// A fresh snapshot resets every client to the lobby, scores at $0.
	r.seq++
	for c := range r.clients {
		r.sendTo(c, r.snapshotFor(c))
	}
}

func (r *Room) setPhase(p contracts.GamePhase) {
	r.phase = p
	r.broadcast(contracts.PhaseChanged{Type: "phase_changed", RoomId: contracts.Uuid(r.id), Phase: p})
}
