package socket

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"

	"schmegettes/game/internal/contracts"
	"schmegettes/game/internal/play"
	"schmegettes/game/internal/room"
	"schmegettes/golib/auth"
)

const (
	roomID = "6f0d2a5e-8a0b-4c39-9a4e-2d1f0b7a9c11"
	hostID = "11111111-1111-4111-8111-111111111111"
)

type verifier struct{}

func (verifier) Verify(token string) (auth.Claims, error) {
	switch token {
	case "host":
		return auth.Claims{UserID: hostID}, nil
	case "stranger":
		return auth.Claims{UserID: "99999999-9999-4999-8999-999999999999"}, nil
	}
	return auth.Claims{}, auth.ErrInvalidToken
}

type members struct{}

func (members) IsMember(_ context.Context, c auth.Claims, _ string) (bool, error) {
	return c.UserID == hostID, nil
}

type store struct{}

func (store) Load(context.Context, string) (room.Lobby, error) {
	return room.Lobby{
		Status: contracts.RoomStatusOpen, HostID: hostID, MaxPlayers: 6,
		Members: []room.Member{{UserID: hostID, Name: "Wyatt", Role: contracts.PlayerRoleHost}},
	}, nil
}
func (store) SetName(context.Context, string, string, string) error { return nil }
func (store) SetHostPlays(context.Context, string, bool) error      { return nil }
func (store) Leave(context.Context, string, string) error           { return nil }
func (store) StartGame(context.Context, string) (string, error)     { return "", nil }
func (store) Close(context.Context, string) error                   { return nil }
func (store) LoadGame(context.Context, string) (room.GameData, error) {
	return room.GameData{}, room.ErrNotFound
}
func (store) RevealClue(context.Context, string) error                      { return nil }
func (store) RecordAnswer(context.Context, play.Record) error               { return nil }
func (store) RecordWager(context.Context, play.Record) error                { return nil }
func (store) SubmitFinalAnswer(context.Context, play.Record) error          { return nil }
func (store) UpdateVerdict(context.Context, play.Record) error              { return nil }
func (store) FinishClue(context.Context, string, contracts.ClueState) error { return nil }
func (store) EndGame(context.Context, string, contracts.GameStatus) error   { return nil }

func server(t *testing.T) *httptest.Server {
	t.Helper()
	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	mux := http.NewServeMux()
	mux.Handle("GET /rooms/{roomID}/ws", Handler{
		Verifier: verifier{}, Members: members{},
		Hub:     room.NewHub(ctx, store{}, room.DefaultConfig()),
		Origins: []string{"http://localhost:5173"},
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	return srv
}

func dial(srv *httptest.Server, path string, protocols ...string) (*websocket.Conn, *http.Response, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	url := "ws" + strings.TrimPrefix(srv.URL, "http") + path
	return websocket.Dial(ctx, url, &websocket.DialOptions{Subprotocols: protocols})
}

func TestRejectsBeforeUpgrade(t *testing.T) {
	srv := server(t)
	path := "/rooms/" + roomID + "/ws"
	for name, tc := range map[string]struct {
		path      string
		protocols []string
		status    int
	}{
		"no token":     {path, []string{Protocol}, 401},
		"no version":   {path, []string{"bearer.host"}, 401},
		"bad token":    {path, []string{Protocol, "bearer.forged"}, 401},
		"not a member": {path, []string{Protocol, "bearer.stranger"}, 403},
		"bad room id":  {"/rooms/nope/ws", []string{Protocol, "bearer.host"}, 404},
	} {
		_, res, err := dial(srv, tc.path, tc.protocols...)
		if err == nil || res == nil || res.StatusCode != tc.status {
			code := 0
			if res != nil {
				code = res.StatusCode
			}
			t.Errorf("%s: err %v status %d, want %d", name, err, code, tc.status)
		}
	}
}

func TestAcceptsMemberWithoutEchoingTheToken(t *testing.T) {
	srv := server(t)
	conn, res, err := dial(srv, "/rooms/"+roomID+"/ws", Protocol, "bearer.host")
	if err != nil {
		t.Fatal(err)
	}
	defer conn.CloseNow()
	if got := res.Header.Get("Sec-WebSocket-Protocol"); got != Protocol {
		t.Errorf("negotiated %q", got)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	_, data, err := conn.Read(ctx)
	if err != nil {
		t.Fatal(err)
	}
	var m struct {
		Type string `json:"type"`
	}
	_ = json.Unmarshal(data, &m)
	if m.Type != "room_snapshot" {
		t.Errorf("first message %q", m.Type)
	}
}

func TestRejectsForeignOrigin(t *testing.T) {
	srv := server(t)
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	url := "ws" + strings.TrimPrefix(srv.URL, "http") + "/rooms/" + roomID + "/ws"
	_, res, err := websocket.Dial(ctx, url, &websocket.DialOptions{
		Subprotocols: []string{Protocol, "bearer.host"},
		HTTPHeader:   http.Header{"Origin": {"https://evil.test"}},
	})
	if err == nil || res == nil || res.StatusCode != http.StatusForbidden {
		t.Errorf("foreign origin accepted: %v", err)
	}
}
