package play

import (
	"errors"
	"testing"
	"time"

	"schmegettes/game/internal/contracts"
)

// lastPaused is the latest game_paused sent, or nil.
func (f *fixture) lastPaused() *contracts.GamePaused {
	for i := len(f.sent) - 1; i >= 0; i-- {
		if m, ok := f.sent[i].All.(contracts.GamePaused); ok {
			return &m
		}
	}
	return nil
}

func (f *fixture) pausedCount() int {
	n := 0
	for _, b := range f.sent {
		if _, ok := b.All.(contracts.GamePaused); ok {
			n++
		}
	}
	return n
}

func reasonOf(m *contracts.GamePaused) contracts.PauseReason {
	if m == nil || m.Reason == nil {
		return ""
	}
	return *m.Reason
}

func TestHostSoundOffPausesAndRereadsTheClue(t *testing.T) {
	f := setup(t, nil)
	f.openBuzzing("s1")
	f.must(f.g.Buzz(f.now, alice, "s1"))
	f.must(f.g.HostSound(f.now, host, false))
	if !f.g.Paused() || !f.g.Deadline().IsZero() {
		t.Fatal("not paused")
	}
	if m := f.lastPaused(); m == nil || !m.Paused || reasonOf(m) != contracts.PauseReasonHostSound {
		t.Fatalf("game_paused %+v", m)
	}
	if !f.g.PausedAt().Equal(f.now) {
		t.Errorf("pausedAt %v", f.g.PausedAt())
	}
	if err := f.do(f.g.Answer(f.now, alice, "s1", "nitrogen")); !errors.Is(err, ErrIgnored) {
		t.Errorf("answer while paused: %v", err)
	}
	f.now = f.now.Add(time.Minute)
	f.must(f.g.HostSound(f.now, host, true))
	if f.g.Paused() || f.g.Phase() != contracts.GamePhaseClueReading {
		t.Fatalf("paused %v phase %s", f.g.Paused(), f.g.Phase())
	}
	if m := f.lastPaused(); m.Paused || m.Reason != nil {
		t.Errorf("resume message %+v", m)
	}
	if !f.g.PausedAt().IsZero() {
		t.Error("pausedAt kept after resume")
	}
	if f.g.attempted[alice] {
		t.Error("a player cut off mid-answer should get to try again")
	}
}

func TestHostSoundRepeatsAreIgnored(t *testing.T) {
	f := setup(t, nil)
	if err := f.do(f.g.HostSound(f.now, host, true)); !errors.Is(err, ErrIgnored) {
		t.Errorf("sound on while on: %v", err)
	}
	f.must(f.g.HostSound(f.now, host, false))
	n := f.pausedCount()
	if err := f.do(f.g.HostSound(f.now, host, false)); !errors.Is(err, ErrIgnored) {
		t.Errorf("sound off while off: %v", err)
	}
	if f.pausedCount() != n {
		t.Error("a repeat sent another game_paused")
	}
}

func TestHostSoundFromANonHostIsRefused(t *testing.T) {
	f := setup(t, nil)
	var reject *Reject
	if err := f.do(f.g.HostSound(f.now, alice, false)); !errors.As(err, &reject) || reject.Code != contracts.ErrorCodeNotHost {
		t.Fatalf("got %v", err)
	}
	if f.g.Paused() {
		t.Error("a phone paused the game")
	}
}

func TestHostAwayAndSoundOffBothClearBeforeResuming(t *testing.T) {
	// Sound off first, then the socket drops; sound comes back only after the socket.
	f := setup(t, nil)
	f.openBuzzing("s1")
	f.must(f.g.HostSound(f.now, host, false))
	f.take(f.g.Disconnect(f.now, host))
	if reasonOf(f.lastPaused()) != contracts.PauseReasonHostAway {
		t.Fatalf("reason %q, want host_away", reasonOf(f.lastPaused()))
	}
	f.take(f.g.Connect(f.now, host))
	if !f.g.Paused() || reasonOf(f.lastPaused()) != contracts.PauseReasonHostSound {
		t.Fatalf("paused %v reason %q, want host_sound", f.g.Paused(), reasonOf(f.lastPaused()))
	}
	f.must(f.g.HostSound(f.now, host, true))
	if f.g.Paused() {
		t.Fatal("still paused")
	}

	// The socket drops first, then sound goes off; the socket comes back before the sound.
	g := setup(t, nil)
	g.openBuzzing("s1")
	g.take(g.g.Disconnect(g.now, host))
	g.must(g.g.HostSound(g.now, host, false))
	if reasonOf(g.lastPaused()) != contracts.PauseReasonHostAway {
		t.Errorf("reason %q, want host_away", reasonOf(g.lastPaused()))
	}
	g.must(g.g.HostSound(g.now, host, true))
	if !g.g.Paused() {
		t.Fatal("resumed with no host socket")
	}
	g.take(g.g.Connect(g.now, host))
	if g.g.Paused() {
		t.Fatal("still paused with socket and sound back")
	}
}

func TestHostSoundOffKeepsDailyDoubleWagerTime(t *testing.T) {
	f := setup(t, ddBoard)
	f.must(f.g.Pick(f.now, alice, "s1"))
	f.now = f.now.Add(10 * time.Second)
	f.must(f.g.HostSound(f.now, host, false))
	if !f.g.Deadline().IsZero() {
		t.Fatal("timers run while paused")
	}
	f.now = f.now.Add(time.Minute)
	f.must(f.g.HostSound(f.now, host, true))
	if want := f.now.Add(PickBlink + DDReveal + WagerWindow - 10*time.Second); !f.g.Deadline().Equal(want) {
		t.Errorf("deadline %v, want %v", f.g.Deadline(), want)
	}
	f.must(f.g.Wager(f.now, alice, 50))
}

func TestSnapshotSaysWhyTheGameIsPaused(t *testing.T) {
	f := setup(t, nil)
	var snap contracts.RoomSnapshot
	f.g.SnapshotFields(&snap, false)
	if snap.PauseReason != nil {
		t.Errorf("running game has a pause reason %q", *snap.PauseReason)
	}
	f.must(f.g.HostSound(f.now, host, false))
	snap = contracts.RoomSnapshot{}
	f.g.SnapshotFields(&snap, false)
	if snap.PauseReason == nil || *snap.PauseReason != contracts.PauseReasonHostSound {
		t.Errorf("pauseReason %v", snap.PauseReason)
	}
}
