---
jira-type: enhancement
jira-title: "Gameplay polish: always-on buzzer, controller-only picks, iPhone-landscape host screen, 6 players, 4-row board"
---
# Task spec: gameplay-polish

Product brief: [product-brief.md](./product-brief.md). Product docs (already merged, the source of truth for behavior): [gameplay feature brief](../../docs/product-docs/features/gameplay/feature-brief.md), [gameplay interaction design](../../docs/product-docs/features/gameplay/interaction-design.md), [lobby interaction design](../../docs/product-docs/features/lobby/interaction-design.md), [game-history feature brief](../../docs/product-docs/features/game-history/feature-brief.md), [design system](../../docs/product-docs/architecture/design-system.md).

## Approach

Thirteen product changes, grouped by package. The server changes are small and pure: `internal/play` gets new timings, controller-only picks, a 10 s control handoff, and an announcement-aware reading estimate. The database caps rooms at 6 and builds 4-row boards. The bulk is in `web/`: one `Buzzer` everywhere, the buzzer always on the phone, pick confirmation, the pick announcement, and a two-column host layout for an iPhone in landscape.

No WebSocket contract changes. `phase_changed` already carries `controllingUserId`, so a control handoff is just a phase broadcast. `not_in_control` already exists.

## Subtasks

Ordered narrow → wide. One implementation PR.

### 1. `shared/`: cap `maxPlayers` at 6

- `shared/openapi.yaml`: `PATCH /rooms/{roomId}` request body `maxPlayers: { type: integer, minimum: 2, maximum: 6 }` (was 8). Response `maxPlayers` stays a plain integer.
- Run `mise run gen` and commit the output (`api/internal/contracts/*`, `shared/generated/ts/openapi.ts`, and anything else it rewrites).

**Key files:** `shared/openapi.yaml`, generated files.

### 2. `supabase/`: 6-player cap and 4-row boards

New migration: `supabase migration new gameplay_polish`.

1. **Player cap.**
   - `update public.rooms set max_players = 6 where max_players > 6;` (runs before the constraint change).
   - Drop the `rooms.max_players` check (`between 2 and 8`, from `20261026000000_init.sql`) and add `check (max_players between 2 and 6)`. Look up the generated constraint name (`rooms_max_players_check`) rather than guessing; drop it with `if exists`, name the new one explicitly.
   - `join_room` and `set_host_plays` already compare against `max_players`; no change.
2. **4-row boards.** `create or replace function public.build_board_round(...)`, same signature, same `security invoker` / `search_path = ''`:
   - Category eligibility is **unchanged**: a category still needs exactly 5 clues (`having count(*) = 5` for Single/Double) and is ranked by the same `seen` rules.
   - Insert only the **first 4** clues per chosen category, ordered as today (`c.value nulls last, c.id`): wrap the row numbering in a subquery and keep `rn <= 4`. `row_index = rn - 1`, `value = step * rn`. Single: 200/400/600/800. Double: 400/800/1,200/1,600. Final unchanged (1 clue).
   - The "catalog too small" check becomes `picked < wanted * rows_per` with `rows_per` 4 (1 for Final).
   - **Daily Doubles:** today `row_pick = 1 + floor(random() * 4)` picks rows 1–4. Row 4 no longer exists, so the update would silently place no Daily Double. Change to `1 + floor(random() * 3)` (rows 1–3, still never the top row).
3. **Grants and RLS:** no new tables, so no new policies. `create or replace` keeps the existing `execute` grants; confirm by re-reading the grants in `20261027174627_lobby.sql` and re-issue them in the migration if `create or replace` doesn't preserve them in this setup.

**Compatible with running code:** the game server reads whatever `board_clues` exist and ends a round when all its clues are done (`roundDone` checks states, not a count), so a 24-clue board works with both old and new `game/`. Games already started keep their 30-clue boards. The tighter `max_players` check only affects writes.

**Key files:** `supabase/migrations/{timestamp}_gameplay_polish.sql`, `supabase/tests/game_history.test.sql`, `supabase/tests/lobby.test.sql`.

### 3. `game/`: rules (`internal/play`)

**Timings** (`game.go` consts):

| Const | Old | New |
|---|---|---|
| `AnswerWindow` | 7 s | **14 s** |
| `ClueEndPause` | 3 s | **6 s** |
| `MaxReading` | 12 s | **14 s** |
| `ControlGrace` (new) | — | **10 s** |

`AnswerGrace` (1.5 s), `BuzzWindow`, `Lockout`, `Interstitial` unchanged.

**Pick announcement in the reading estimate:**
- Add `func Announcement(category string, value int) string` returning `Here's {category} for {value}.` (value as a plain integer, no `$`, no thousands separator). The web speaks the same string (subtask 5); keep the two in sync and say so in a comment on both.
- `startReading` uses `ReadingTime(Announcement(c.Category, c.Value) + " " + c.Text)`.

**Controller-only picks:**
- `Pick`: replace `if user != g.control && user != g.s.HostID` with `if user != g.control` → `not_in_control`. A playing host who has control picks as `g.control` like anyone else.
- Update the doc comment ("The controller or the host may pick").

**Control handoff (controller disconnected on the board):**
- New field, e.g. `handoffAt time.Time`, armed only when **all** of: phase `board`, `step == stepNone`, not paused, not over, and `g.online[g.control] == 0`.
- Arm (to `now + ControlGrace`) from one helper, e.g. `g.checkControl(now)`, called:
  - in `Disconnect` when the controller's last socket drops;
  - whenever the game enters the board: `nextAfterClue` (board branch), `Timeout` for `stepInterstitial`, `resume` when resuming onto the board;
  - in `Connect` for any contestant while the controller is offline and nothing is armed (covers "nobody else was connected, then someone came back").
- Disarm: `Connect` of the controller; a successful `Pick`; `pause`; leaving the board.
- `Deadline()` returns `handoffAt` when it's set and the step is `stepNone` (the board has no other deadline). `Timeout` handles it before the `switch g.step`.
- On timeout: pick the next contestant **after** the controller in `s.Players` join order, wrapping, skipping the controller, with `g.online[u] > 0`. If found: `g.control = u`, `emitPhase(&e)`. If none: keep control, don't re-arm (the `Connect` hook re-arms later).
- A handed-off controller who reconnects does **not** get control back.
- `g.online` counts the host's sockets under the host's user id, so a playing host counts as connected exactly when the host device is. The host device dropping pauses the game, which disarms the handoff.

**Known limitation (document in a code comment, not fixed here):** after a server restart, recovery derives control from the last correct answer (`Setup.LastCorrect`), so a handoff made before the restart is lost. Acceptable: a restart already costs a reconnect.

**Key files:** `game/internal/play/game.go`, `game/internal/play/game_test.go`, `game/internal/room/game.go` (log line), `game/internal/room/*_test.go` (fixtures that assumed 5 rows or a host pick).

### 4. `web/`: one `Buzzer`, always on the phone

**`web/src/game/Buzzer.tsx`:**
- States: `idle | dim | lit | early | answering | locked` (add `idle` and `answering`). Labels and looks per the [buzzer table](../../docs/product-docs/features/gameplay/interaction-design.md#the-buzzer-one-component-everywhere): `idle`/`dim` "BUZZ" gray light; `lit` "BUZZ" yellow filled; `early` "Too early" red filled; `answering` "Answer now" green filled; `locked` "You've answered this one" disabled.
- **Remove the `compact` prop.** Full width of its container, `min-height: 64px`; the container decides any extra height (phone: grows to fill; host column: 64 px).
- `idle` taps play a short press animation (CSS `:active` scale is enough) and call nothing. `dim` taps still call `onBuzz` (the server applies the early lockout).

**Buzzer state mapping**, extracted into a pure function so it's testable, e.g. `buzzerState(state, userId, early): BuzzerState` in `PlayerControls.tsx` or a new `buzzerState.ts`:
- `answering` when `phase === "answering" && answeringUserId === userId`
- `locked` when the player is in `attemptedUserIds` for the active clue
- `early` while the 250 ms flash is on
- `lit` when `buzzing_open` and buzzable; `dim` when `clue_reading` and buzzable
- otherwise `idle` (lobby, board, clue end, round intro, paused, game over, someone else answering)

**`web/src/game/PlayerControls.tsx`:** restructure into "status area above, buzzer pinned below" for every phase, per the phone table in the interaction design:
- The buzzer renders in **every** branch, including paused, results, verdict, round intro and clue end (currently they return early without it).
- `board`, I have control: remove the "Your pick" heading and the score. Show the mini board and `VoicePick`.
- `board`, someone else: "{name} is picking…" plus my score (unchanged).
- Answering (mine): mic level/transcript above, buzzer `answering`.
- Countdown totals come from constants (subtask 6), not the literals `5000` / `8500`.
- `compact` stays as a layout prop for the host column (text sizes, no mini board), but it no longer changes the buzzer.

**`web/src/pages/JoinRoom.tsx` (lobby):** remove `Look at the TV. {host} will start the game.`. Render the `Buzzer` in state `idle` pinned to the bottom under "You're in, {name}.", the mic prompt, and Edit name / Leave. `onBuzz` is a no-op.

**`web/src/game/PlayerGame.tsx`:** full-height column (`100dvh`) so the buzzer sits at the bottom of the phone; status area scrolls if ever needed, the buzzer doesn't.

### 5. `web/`: picking, confirmation, announcement

**Pick confirmation:** a new `web/src/game/PickConfirm.tsx` (Mantine `Modal`, centered): title "{Category} for ${value}?", buttons **Cancel** (default variant) and **Pick** (primary). Pick sends `select_clue`; Cancel or a tap outside closes it.
- Used for **taps only**: the phone mini board and the host board when the host has control. `VoicePick`'s `onPick` keeps sending `select_clue` directly.
- Closes itself when `phase !== "board"` or `controllingUserId !== userId` (an effect on those two values).

**Who can tap the host board (`HostGame.tsx`):** pass `onPick` to `Board` only when `state.hostPlays && state.controllingUserId === hostUserId`. Otherwise the board renders without `onPick` (cells disabled, no pointer cursor). `Board` already handles a missing `onPick`.

**Remove** `PICK_HINT_MS`, the `hint` state and its effect, and the `Waiting for … to pick… / The host can tap a clue to pick.` text.

**Announcement:** in `HostGame.tsx`'s read effect, speak `announcement(category, value) + " " + clueText` as **one** utterance (one `speak` call, so `reading_done` still fires once, at the real end). Add `export function announcement(category: string, value: number): string` to `web/src/lib/speech.ts`, mirroring `play.Announcement`. Keep the category as the board shows it; don't reformat.

### 6. `web/`: timings

New `web/src/game/timing.ts`, mirroring the server consts with a comment pointing at `game/internal/play/game.go`:

```ts
export const BUZZ_WINDOW_MS = 5000;
export const ANSWER_MS = 14000;        // phone stops listening
export const ANSWER_GRACE_MS = 1500;   // server waits this long after
export const ANSWER_TOTAL_MS = ANSWER_MS + ANSWER_GRACE_MS; // countdown total
```

Use them in `useAnswerCapture.ts` (replace its `ANSWER_MS = 7000`), `PlayerControls.tsx` and `HostGame.tsx` countdowns. The 6 s clue-end pause is server-driven only; nothing in the web hard-codes 3 s.

### 7. `web/`: host screen for iPhone landscape

Layout spec: [gameplay interaction design, "Host device"](../../docs/product-docs/features/gameplay/interaction-design.md#host-device-iphone-in-landscape-mirrored-to-the-tv) and the [lobby TV view](../../docs/product-docs/features/lobby/interaction-design.md#lobby-tv-view).

- **`web/index.html`:** viewport meta gets `viewport-fit=cover` so `env(safe-area-inset-*)` works in landscape.
- **New `web/src/game/HostLayout.tsx`:** a full-viewport (`100dvh`, `100dvw`) two-column grid: stage `minmax(0, 1fr)` and column `clamp(180px, 28vw, 280px)`, with `padding: env(safe-area-inset-*)` plus a small gutter. No page scroll at 667 × 320 and up. Used by `HostGame` (every phase, results included) and `HostLobby`.
- **New `web/src/game/PlayerColumn.tsx`** (replaces `ScoreBar.tsx`; delete it and move `money` to `web/src/lib/money.ts` or keep it exported from the new file, updating imports):
  - One tile per contestant in join order: name (ellipsis) and score.
  - ≤ 4 contestants: two-line tiles. 5–6: one-line tiles, `min-height: 40px`.
  - Controller's tile: 3 px `yellow.4` border and a small "PICKING" label. `aria-current="true"` on that tile so tests can find it.
  - Disconnected: dimmed, "(reconnecting)".
  - When `hostPlays`, the host's `PlayerControls` (compact) and its `Buzzer` sit at the bottom of the column, `spaceToBuzz` as today. The old bottom "player bar" `Paper` is removed.
- **`Board.tsx`:** the TV size must fit 6 × (header + 4 rows) in the stage height at 320 px: size cells from the container (CSS grid with `grid-template-rows: auto repeat(4, 1fr)` and `height: 100%`), category headers clamp to 3 lines and shrink (`font-size: clamp(...)`), no fixed `minHeight: 72` / `padding: 16`. The phone size keeps working in portrait.
- **`ClueView` (in `HostGame.tsx`):**
  - When `state.clueEnd` is set, **don't render `clue.clueText`**. Show category · value, the verdict line if present, and "Correct response: **{response}**" large.
  - Clue text scales to fit the stage (`clamp()` font size); no scroll.
- **Portrait overlay:** when `(orientation: portrait) and (max-width: 600px)`, `HostLayout` shows a full-screen "Turn your phone sideways" overlay above the view. The game keeps running underneath (no state change, speech continues).
- **`HostLobby.tsx`:** re-lay the lobby into `HostLayout`: stage holds the title, "Hosted by", join URL, code, Join/Leave, Start; the column holds "Players n / 6", the list, and, after **Join the game**, the host's `Buzzer` (`idle`, no-op). Fits at 667 × 320.

## Contracts

- **Changed:** `shared/openapi.yaml`, `PATCH /rooms/{roomId}` request `maxPlayers.maximum` 8 → 6. It narrows an input range and doesn't remove or rename a field. Nothing calls this endpoint today (the API has no handler for it yet), so no `/v2`. Regenerate and commit.
- **Database:** `rooms.max_players` check 2–8 → 2–6; `build_board_round` writes 4 rows. Both are compatible with the running `game/` and `api/` (see subtask 2).
- **Preserved:** every WebSocket message (`shared/schemas/protocol/*`), the domain schema, the jobs schema. `select_clue` from a non-controller now gets the existing `not_in_control` error (previously only a non-host non-controller did).

## Success criteria

1. A phone shows the `Buzzer` on every screen from "You're in" to game over. "Look at the TV. … will start the game." no longer appears.
2. Phone and host device render the same `Buzzer`; it has no `compact` prop.
3. `Pick` from the host device without control returns `not_in_control`; the host board has no `onPick` unless the host plays and has control.
4. With the controller offline on the board for 10 s, control moves to the next connected contestant in join order (wrapping), a `phase_changed` goes out with the new `controllingUserId`, and their tile is highlighted. Reconnecting within 10 s keeps control. No handoff while paused or outside the board.
5. A tapped pick sends `select_clue` only after **Pick** in the modal; a voice pick sends at once.
6. The host device speaks "Here's {category} for {value}. {clue}" as one utterance; the server's fallback reading time counts the announcement, capped at 14 s.
7. Every host screen (lobby and game) shows every contestant's name and score, with the controller's tile highlighted. No "Waiting for … to pick" text and no host-pick hint.
8. The phone pick screen has no "Your pick" heading and no score.
9. The answer window is 14 s (server and phone), the correct-response pause is 6 s, and the countdowns use the shared web constants.
10. The correct-response screen doesn't render the clue text.
11. At 844 × 390 and 667 × 320, the host lobby and every game phase fit without page scroll, with 2 and with 6 contestants, host playing and not. A phone-width portrait viewport shows "Turn your phone sideways".
12. `max_players` above 6 is refused by the database; existing rooms above 6 are lowered to 6. The OpenAPI maximum is 6.
13. New boards have 24 + 24 + 1 clues: Single 200–800, Double 400–1,600, each category's first 4 clues in aired order; Daily Doubles (1 Single, 2 Double) land in rows 1–3.

## Test plan

Targeted runs only.

**`supabase/`** (`mise run db:test`):
- `game_history.test.sql`: board counts `array[24, 24, 1]`; Single values `{200,400,600,800}` and Double `{400,800,1200,1600}`; every chosen category's 4 board clues are that category's first 4 by `(value, id)`; Daily Double counts still 1 / 2, all with `row_index between 1 and 3`; reveal counts 30 → 24 (and the `seen_clues` expectations that follow from them).
- `lobby.test.sql`: `update rooms set max_players = 7` throws (check violation); `max_players = 6` and `2` are allowed; joining stops at 6.

**`game/`** (`mise run test:game -- ./internal/play/... ./internal/room/...`), table tests in `game_test.go`:
- Host pick without control → `not_in_control`; host with control → picks; controller → picks.
- Handoff: controller disconnects on the board → `Deadline()` is `now + 10s` → `Timeout` gives control to the next connected contestant, wrapping past the end of join order, skipping offline players, and emits `phase_changed` with the new controller.
- Controller reconnects before 10 s → no handoff; `Deadline()` is zero again.
- Only the controller connected among contestants, then they drop → after 10 s control is unchanged; another contestant connects → armed; 10 s later control moves.
- No handoff while paused; resume onto the board with the controller offline re-arms.
- Clue ends onto the board with the controller offline → armed. Double Jeopardy start with the lowest scorer offline → armed after the interstitial.
- `ReadingTime(Announcement("VOLCANOES", 400) + " " + text)` counts the announcement words; a long clue caps at 14 s.
- Answering deadline is `AnswerWindow + AnswerGrace` (15.5 s); clue-end deadline 6 s.
- Fix any `internal/room` fixtures that relied on 5-row boards or host picks.

**`web/`** (`mise run test:web -- <file>` for each):
- `src/game/Buzzer.test.tsx` (new): label and enabled state per state; `idle` click doesn't call `onBuzz`; `dim` and `lit` do.
- `src/game/PlayerControls.test.tsx`: the buzzer is present in every phase (lobby excluded here; board mine/other, reading, open, answering mine/other, verdict, clue end, round intro, paused, results); `buzzerState` mapping; the board-mine view has no "Your pick" and no score; tapping a cell opens the modal and sends nothing; **Pick** sends `select_clue`; **Cancel** sends nothing; the modal closes when control moves; `VoicePick` sends without a modal; answering countdown uses `ANSWER_TOTAL_MS`.
- `src/game/HostGame.test.tsx`: board not tappable when the host doesn't play, or plays without control; tappable + confirm when the host has control; no "Waiting for" / "host can tap" text; `PlayerColumn` lists every contestant with scores on board, clue, clue end and results; the controller's tile has `aria-current`; clue text absent when `clueEnd` is set; `speak` called once with `"Here's VOLCANOES for 400. " + clueText`.
- `src/game/PlayerColumn.test.tsx` (new): two-line vs one-line tiles at 4 vs 5 contestants; disconnected tile dimmed.
- `src/pages/JoinRoom.test.tsx`: lobby shows the buzzer; "Look at the TV" text gone; tapping it sends nothing.
- `src/pages/HostLobby.test.tsx`: host buzzer appears after Join the game and goes on Leave; `Players n / 6`.
- `src/game/Board.test.tsx`: 4 rows render; no `onPick` → cells disabled.
- `src/lib/speech` `announcement()` unit test (in an existing or new `speech.test.ts`).

**Manual check (note results in the PR):** in Safari responsive mode or a real iPhone, landscape at 844 × 390 and 667 × 320, lobby and each game phase with 2 and 6 contestants, host playing and not: no scroll, every tile visible, board's 4 rows visible, notch insets respected; portrait shows the rotate overlay.

## Database migration plan

- File: `supabase migration new gameplay_polish` → `supabase/migrations/{timestamp}_gameplay_polish.sql`.
- Statements, in order: lower `rooms.max_players` > 6 to 6; drop the old check; add `rooms_max_players_check check (max_players between 2 and 6)`; `create or replace function public.build_board_round(...)` with 4 rows and Daily Doubles in rows 1–3; re-grant `execute` only if it isn't preserved.
- Tables: none new. RLS: unchanged. pgTAP: the `game_history` and `lobby` additions above.
- Compatible with the code already running: yes (subtask 2).

## Logging requirements

- `game/internal/room`: when a `Timeout` hands off control, one `info` line, static message `control passed`, fields `room_id`, `game_id`, `from_user_id`, `to_user_id`. It's a state transition (§3), not an error. Detect it by comparing the controller before and after `Timeout` in the room, so `play` stays I/O-free.
- No other new logs. Nothing from §5: no tokens, no answers or transcripts above `debug`, no emails, no whole messages.

## Docs to update

- `docs/system-docs/architecture/realtime-game-server.md`: under "Recovery", note that control comes from the last correct answer, so a disconnect handoff isn't restored after a restart. Mention the control-handoff input in the `internal/play` paragraph.
- Product docs are already updated; change them only if implementation finds a mismatch, and say so in the PR.

## Branch

`enhancement/gameplay-polish-impl`, from and into `daily/2026-10-29`. No Jira key: Jira isn't configured yet (`.github/jira.json` issue-type IDs are `REPLACE_ME`, and the repo has no Jira secrets), as with the lobby and gameplay tasks. PR title: `[Enhancement] gameplay-polish: …`. The final commit deletes `tasks/gameplay-polish/`.
