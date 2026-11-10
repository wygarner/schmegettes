package room

import (
	"errors"
	"strings"
	"testing"
)

// Private access: a host whose access was removed can't Start or Rematch. Only the host's
// devices hear why (docs/product-docs/features/private-access/interaction-design.md).

// noErrorFor checks that a socket got no error message up to a ping it sends now.
func noErrorFor(t *testing.T, c *conn) {
	t.Helper()
	c.send(map[string]any{"type": "ping"})
	for _, raw := range c.readUntil("pong") {
		if strings.Contains(raw, `"type":"error"`) {
			t.Errorf("a phone got an error meant for the host: %s", raw)
		}
	}
}

func TestStartRefusedWithoutHostAccess(t *testing.T) {
	f := setup(t)
	f.store.add(alice, "Alice")
	f.store.add(bob, "Bob")
	f.store.notAHost = true
	host := f.connect(hostID)
	a := f.connect(alice)

	host.send(map[string]any{"type": "start_game"})
	if m := host.until("phase_changed"); m.Phase != "building_board" {
		t.Fatalf("phase %q", m.Phase)
	}
	if m := host.until("phase_changed"); m.Phase != "lobby" {
		t.Fatalf("phase %q, want back in the lobby", m.Phase)
	}
	raw := host.readUntil("error")
	if last := raw[len(raw)-1]; !strings.Contains(last, `"code":"not_a_host"`) ||
		!strings.Contains(last, "host access was removed") {
		t.Errorf("host got %s", last)
	}
	noErrorFor(t, a)
}

func TestRematchRefusedWithoutHostAccess(t *testing.T) {
	f, host, a, _ := finishedGame(t)
	f.store.notAHost = true

	host.send(map[string]any{"type": "rematch"})
	if m := host.until("error"); m.Code != "not_a_host" {
		t.Fatalf("code %q", m.Code)
	}
	host.send(map[string]any{"type": "ping"})
	for _, raw := range host.readUntil("pong") {
		if strings.Contains(raw, `"type":"room_snapshot"`) {
			t.Error("the room was reset to the lobby")
		}
	}
	noErrorFor(t, a)
}

func TestRematchHostCheckFailureIsInternal(t *testing.T) {
	f, host, a, _ := finishedGame(t)
	f.store.hostErr = errors.New("db down")

	host.send(map[string]any{"type": "rematch"})
	if m := host.until("error"); m.Code != "internal" {
		t.Fatalf("code %q", m.Code)
	}
	noErrorFor(t, a)
}
