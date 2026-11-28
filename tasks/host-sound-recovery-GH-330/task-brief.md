---
task-type: bug-fix
task-title: "The host device gets its sound back after an app switch or interruption, and the game waits for it"
---
# Task spec: host sound recovery

Product brief: [product-brief.md](product-brief.md). Rules: `docs/product-docs/features/sound-effects/feature-brief.md` (Sound unlocking), `features/gameplay/feature-brief.md` (Fairness and disconnects: "The host device can't play sound").

## How it works today

- One `AudioContext` (`web/src/lib/piper/audio.ts`, `audioContext()`) serves the narrator and the sound effects. Nothing watches its state. `narrate()` (`web/src/lib/narrator.ts`) and `sfx.ts` call `ctx.resume()` only when they next play.
- When `narrate()` returns `"failed"`, `HostGame` shows a **Tap to turn on sound** button above the stage (`soundBlocked`). The game keeps running: buzzing opens on the server's fallback timer, and the room hears nothing.
- The server pauses a game only when the host device's last socket closes (`play.Game.Disconnect` → `pause`, `Connect` → `resume`). `game_paused` carries `paused: true|false`. Phones show "Waiting for the TV…", and the TV stage shows "Paused · Waiting for the TV to reconnect…".
- `room.Room` abandons a game after `HostAbsence` (30 min) with no host socket (`hostGoneAt`).

## Subtasks

### 1. `shared/`: the host reports its sound, and a pause says why

- **Client message `host_sound`** (`shared/schemas/protocol/client-message.schema.json`): `{ "type": "host_sound", "on": boolean }`. Description: "Host only. The host device's sound stopped (`on: false`: the page was hidden, or audio couldn't resume without a tap) or came back (`on: true`)."
- **`game_paused`** (server message) gains an optional `reason`: `"host_away"` (no host socket) or `"host_sound"` (the host device has no sound). Present when `paused` is true. **`room_snapshot`** gains the same optional `pauseReason`, so a reconnecting phone or TV shows the right copy.
- Run `mise run gen` and commit the output (TS, Go and Python).
- Additive only. An old client ignores `reason`. An old server would reject `host_sound` with `bad_message`, but web and game deploy together.

### 2. `game/`: pause while the host device has no sound

- `play.Game` keeps two pause causes: host away (today's `online[host] == 0`) and `soundOff bool`. The game is paused while **either** holds, and resumes only when **neither** does. `pause` and `resume` keep their current timer behaviour: time left is kept, the clue is re-read without the reveal, a cut-off answer may be tried again, and wager timers resume.
- New `func (g *Game) HostSound(now time.Time, on bool) Effects`. `on: false` sets `soundOff` and pauses (reason `host_sound`). `on: true` clears it and resumes if the host is connected. A repeat of the current state does nothing.
- `game_paused.reason` is `host_away` when the host has no socket (it wins when both hold), otherwise `host_sound`. When one cause clears and the other remains, send a fresh `game_paused` with the remaining reason.
- `room.Room` routes `host_sound` from the host's sockets only (anyone else: `error: not_a_host`, as for other host-only messages). It's valid in any game phase, and ignored in the lobby and after the game is over.
- **A dropped socket doesn't clear `soundOff`.** When the host reconnects, the new page reports its sound state right away (subtask 3). Until it does, the game stays paused.
- **Abandonment:** the 30-minute `HostAbsence` rule also counts time paused for sound. Track `pausedSince` for either cause, so a game paused with no sound for 30 minutes is abandoned like one with no host. Log `INFO "game paused"` and `"game resumed"` with `room_id`, `game_id` and `reason`.

### 3. `web/`: keep sound running on the host, and report when it can't

New `web/src/lib/hostSound.ts`, used only by the host device's game screen:

- **Watch:** `visibilitychange`, `pageshow`, and the `AudioContext`'s `statechange` (`suspended`, and Safari's `interrupted`).
- **Page hidden:** send `host_sound {on: false}` at once. The TV is out of sight, so the game waits.
- **Page visible again, or the context left `running` while visible:** call `ctx.resume()` and wait up to 500 ms.
  - Running: send `host_sound {on: true}`. Nothing shows.
  - Not running: send `host_sound {on: false}` (if not already sent) and show the full-stage **Tap to turn on sound** overlay.
- **On connect** (every `room_snapshot` for a game in progress): report the current state. Send `on: true` if the context is `running` and the page is visible, otherwise `on: false` and show the overlay.
- **`narrate()` returns `"failed"`,** or a line is skipped with `no_audio_context` mid-game: send `host_sound {on: false}` and show the overlay. This replaces today's small `soundBlocked` button, which kept the game running silently.
- **The overlay:** covers the stage, above the existing paused overlay. "Tap to turn on sound" in large type, with "The game is paused until sound is back on." under it. Tapping anywhere on it, inside the tap handler, calls `ctx.resume()` and plays the existing short unlock sound. On `running` it sends `host_sound {on: true}` and hides; otherwise it stays. Keyboard: Enter and Space also work.
- **Paused copy:** with `reason: host_sound`, the TV's paused overlay says "Paused · Turn on sound on this device." (under the tap overlay). Phones say "Waiting for the TV's sound…" with "The game picks up where it left off." With `host_away` or no reason, keep today's copy.
- Phones don't send `host_sound` and never pause for their own sound.
- **Lobby:** no change. Pressing **Start** is a tap, and it already unlocks sound.

### 4. Docs

- `docs/system-docs/architecture/realtime-game-server.md`: add `host_sound` to the client messages table, and `reason` and `pauseReason` to `game_paused` and `room_snapshot`. In the pause rules, add the two causes and the 30-minute rule for either.
- Remove **Not yet implemented** (`host-sound-recovery`) from `sound-effects/feature-brief.md` and from the gameplay Fairness row.

## Key files

| Subtask | Files |
|---|---|
| 1 | `shared/schemas/protocol/client-message.schema.json`, `server-message.schema.json`, generated `shared/generated/**`, `game/internal/contracts/contracts_gen.go`, `worker/.../contracts` (via `mise run gen`) |
| 2 | `game/internal/play/game.go`, `game/internal/play/game_test.go` (or a new `pause_test.go`), `game/internal/room/room.go`, `game/internal/room/room_test.go` |
| 3 | `web/src/lib/hostSound.ts` (new) and its test, `web/src/game/HostGame.tsx`, `web/src/game/PlayerControls.tsx`, `web/src/lib/room.ts` (`pauseReason`), `web/src/lib/room.test.ts` |
| 4 | `docs/system-docs/architecture/realtime-game-server.md`, `docs/product-docs/features/sound-effects/feature-brief.md`, `docs/product-docs/features/gameplay/feature-brief.md` |

## Contracts

Changed, additively (see `docs/system-docs/architecture/api-contract.md`):

- new client message `host_sound`
- optional `reason` on `game_paused`
- optional `pauseReason` on `room_snapshot`

No REST change, no database change.

## Success criteria

- The host's page hidden mid-game pauses the game within one round trip. Coming back with audio that resumes continues the game with no overlay.
- Coming back with audio that won't resume shows **Tap to turn on sound**, and the game stays paused until the tap.
- A clue being read when the pause began is read again from the start after resuming. Buzz, answer and wager timers resume with the time they had left.
- Host socket dropped and sound off at once: the game resumes only after both are back. The reason shown is "host away" until the socket returns, then "host sound" until the tap.
- A game paused for sound for 30 minutes is abandoned, as for a missing host.
- On a real iPhone host (Safari): switching to another app for 10 s mid-clue and back gives either the narrator continuing, or the paused overlay, which one tap clears. Never a game running with no sound. This is a human checklist item (agent-qa.md).
- `narrator_line_skipped` with `no_audio_context` mid-game drops to near zero on production (Grafana, a week after release).

## Test plan

- **game:** `mise run test:game -- ./internal/play/... ./internal/room/...`
  - `HostSound(false)` during `clue_reading`, `buzzing_open`, `answering`, the Daily Double wager and `final_wager` pauses with reason `host_sound`. `HostSound(true)` resumes with the time left, and the clue is re-read.
  - Both causes, cleared in either order: resume only after the second, and `reason` updates in between.
  - A repeated `HostSound` with the same value does nothing (no extra `game_paused`).
  - `host_sound` from a non-host gives `not_a_host`.
  - Abandon after `HostAbsence` while paused for sound only (fake clock).
- **web:** `mise run test:web -- src/lib/hostSound.test.ts src/lib/room.test.ts src/game/HostGame.test.tsx`
  - `hostSound` with a stubbed `AudioContext` and `document.visibilityState`: hidden sends off. Visible with resume succeeding sends on and no overlay. Resume rejecting or staying suspended sends off and shows the overlay. A tap that resumes sends on.
  - `statechange` to `interrupted` while visible does the same as above.
  - `HostGame`: `narrate` returning `"failed"` sends `host_sound {on:false}` and shows the overlay. The old inline button is gone.
  - `room.ts`: `game_paused` with `reason` and `room_snapshot` with `pauseReason` set `state.pauseReason`. `PlayerControls` shows the sound copy for `host_sound`.
- **shared:** `mise run gen`, and commit the output. CI's Shared Contracts job checks it's current.
- **Agent QA (local stack):** the host at 844 × 390 hides the tab (Playwright `page.evaluate` to dispatch `visibilitychange` with a stubbed `visibilityState`) mid-clue: phones show "Waiting for the TV's sound…". Return with resume blocked: the overlay shows; tap: the game resumes. Record it on the PR. The real-iPhone check is listed as not tested (human checklist).

## Database migration plan

None.

## Logging requirements

- game: `INFO "game paused"` and `"game resumed"`, with `room_id`, `game_id` and `reason` (`host_away` or `host_sound`). No user data. A `host_sound` from a non-host is `WARN "host-only message from a non-host"`, with `room_id` and `user_id` (an id, allowed), as for other host-only messages.
- web: the existing Faro `narrator_line_skipped` stays. Add a Faro event `host_sound_off` with `cause` (`hidden`, `resume_failed`, `interrupted`, `narrator_failed`), and `host_sound_on` with `via` (`auto`, `tap`). No text, no user.
- No tokens, emails or answers logged.

## Docs to update

- `docs/system-docs/architecture/realtime-game-server.md` (subtask 4)
- `docs/system-docs/operations/observability.md`: the two Faro events in "Web events"
- `docs/product-docs/features/sound-effects/feature-brief.md` and `features/gameplay/feature-brief.md`: remove **Not yet implemented**
