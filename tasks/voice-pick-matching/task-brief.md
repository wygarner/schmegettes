---
task-type: bug-fix
task-title: "Spoken picks: match how players actually say a category"
---
# Task spec: voice-pick-matching

Product brief: [product-brief.md](./product-brief.md). Read it first: its tables are the acceptance cases.

**Decision (Wyatt Garner, 2026-11-22): log spoken picks.** Logging failed picks moves from out of scope into scope, so the pick failure rate can be measured. Faro (frontend observability, GH-241) isn't built yet, so the phone reports each spoken pick's outcome to the game server, and the game server logs it. Those logs reach Grafana when GH-241 ships server logs; until then they're in `fly logs`. When Faro lands, nothing here needs to move: the server log is the record.

## Approach

1. Rewrite the matcher in `web/src/lib/pickByVoice.ts` around a **relative** category score (best vs runner-up) instead of the fixed 0.6 bar, add number/word equivalences, and repair common amount transcriptions.
2. Try every hearing the recognizer returns (top first) in `web/src/game/VoicePick.tsx`.
3. Add a `via` field to `select_clue` and a new `voice_pick_missed` client message, so the server can log every spoken pick as `picked` or `missed`.

## Subtasks

### 1. `shared/`: contracts

- `shared/schemas/protocol/client-message.schema.json`
  - `SelectClue`: optional `via`, enum `"tap" | "voice"`. Optional, so an old phone without the field still works. The server treats a missing value as `tap`.
  - New `VoicePickMissed`: `{ type: "voice_pick_missed", problem, heard, alternatives? }`.
    - `problem`: enum `"no-category" | "ambiguous" | "no-value" | "taken" | "nothing-heard"`. `ambiguous` is a tie between categories. The phone shows the same message as `no-category`, but the log can tell them apart.
    - `heard`: string, `maxLength` 200 (the top hearing).
    - `alternatives`: array of strings, `maxItems` 4, each `maxLength` 200.
    - `additionalProperties: false`, like every other message.
  - Add it to the client message union.
- Run `mise run gen` and commit `shared/generated/` and `game/internal/contracts/contracts_gen.go`.

Why this contract changes: the server is the only place that logs today. The board's category names don't travel in the message, because the server already has the board.

### 2. `game/`: log spoken picks

`game/internal/room/game.go`, `handleGame`:

- `select_clue` with `via: "voice"`: after `r.game.Pick` succeeds, log at `info`: `voice pick`, with `outcome=picked`, `game_id`, `user_id`, `board_clue_id`. Tap picks keep today's `debug` line. A voice pick the server rejects (not in control, wrong phase) is logged as today, not as a voice pick.
- New case `voice_pick_missed`. Decode it; an invalid message gets `invalid_message`, as for other types. Accept it only when the game is on the board and the sender has control. Anything else is dropped silently, with no error sent: the miss is already shown on the phone. Then log at `info`: `voice pick`, `outcome=missed`, `game_id`, `user_id`, `problem`, `heard`, `alternatives`, `categories`.
  - `categories`: the names of the board categories that still have an unplayed clue (the server's own board, not client data).
  - Text fields are cut with the existing `clip()`.
- **Flood guard:** at most 1 `voice_pick_missed` per sender per second, and 20 per sender per game; drop the excess silently. Keep it in memory on the room, like the `answer_progress` limit. A player can't produce more than one miss per buzzer press, so normal play never hits this.
- The message never changes game state and never broadcasts.

### 3. `web/`: matcher (`web/src/lib/pickByVoice.ts`)

Keep `matchPick(text, board, opts)` and add `matchPickAny(hearings: string[], board, opts)`: it returns the first hearing's pick, or the top hearing's problem.

**Categories**
- Candidates: categories with at least one unplayed clue.
- Normalize both the speech and the category before comparing:
  - number words ↔ digits for 1–20 and tens to 90 ("ten" = "10")
  - ordinals ("20th" = "twentieth", "1st" = "first")
  - decades ("'80s" / "80s" / "eighties" / "1980s"; strip the apostrophe)
  - Roman numerals II–XX as standalone tokens in the category = "2"… ("WORLD WAR II" → "world war 2")
  - "&" = "and"; "st." → both "saint" and "street" (try both)
  - drop quote marks and periods inside abbreviations ("U.S.A." → "usa")
- Score per category: the share of the speech's content words (after FILLER) that match a word in the category, exactly or with today's fuzzy rule. Keep today's whole-phrase comparison as a second score and take the max. Weight a match on a category word by how rare it is on the board, so a word in only one category counts more than "music" when three categories have "music".
- Decision rule (tune the constants against the test table, then write them down in code comments):
  - Take the best category if it has at least one distinctive matched word (a word that appears in no other candidate category, or appears there with a lower match) **and** its score beats the runner-up by a clear margin (start at 0.15).
  - Otherwise return `ambiguous` when two or more categories match, or `no-category` when none does.
- A phrase that matches a category exactly (today's `phrase === 1`) still wins outright.

**Amounts** (`spokenValue` becomes board-aware: `spokenValue(text, values: number[])`)
- Collect every amount mentioned and use the **last** one.
- Accept, in this order:
  - an exact board value (digits or words)
  - "4" + a board value run together ("4400" → 400, "41000" → 1000) when the whole number isn't a board value
  - a time "H:MM" → H×100 when MM is "00" ("4:00" → 400, "10:00" → 1000)
  - digits + hundred/thousand ("4 hundred", "2 thousand")
  - teens + hundred ("fourteen hundred")
  - "hundreds" = "hundred"
- Extend `NUMBER_WORDS` with eleven, thirteen, fourteen, seventeen, nineteen.
- A heard amount that isn't on the board is `no-value`. Quick picks only applies when no amount was heard (today's rule).

### 4. `web/`: wiring (`web/src/game/VoicePick.tsx`, `web/src/game/PlayerControls.tsx`, the host's voice pick in `web/src/game/HostGame.tsx` / `HostLayout.tsx`)

- `rec.onFinal(text, alternatives)`: call `matchPickAny([text, ...alternatives], …)`. The UI still shows `text` (the top hearing).
- On a pick: `send({ type: "select_clue", clueId, via: "voice" })`. Tapped picks (`PickConfirm`) send `via: "tap"`.
- On a miss, including an empty hearing (`nothing-heard`): show today's message (`ambiguous` uses "Didn't catch the category."), then send `voice_pick_missed` with `problem`, `heard` and `alternatives`. A press the player cancels sends nothing.
- `useVoicePick` gets a `report` callback (or the `send` function) so the hook stays testable. The host's spoken pick goes through the same hook, so it's covered.

### 5. Docs

See "Docs to update".

## Key files

| Subtask | Files |
|---|---|
| 1 | `shared/schemas/protocol/client-message.schema.json`, generated output |
| 2 | `game/internal/room/game.go`, its rate-limit state in `game/internal/room/` |
| 3 | `web/src/lib/pickByVoice.ts`, `web/src/lib/pickByVoice.test.ts` |
| 4 | `web/src/game/VoicePick.tsx`, `PlayerControls.tsx`, `PickConfirm.tsx`, host pick wiring |

## Contracts

- **Changed:** `SelectClue` gains an optional `via`, and there is a new `VoicePickMissed` client message. Both are additive: an old phone keeps working against a new server. A new phone talking to an old server would get `invalid_message` (`additionalProperties: false`), so the **game server deploys before or with web**, as in every release (staging deploys migrations, then api, game and web, in that order).
- **Preserved:** every server message, `select_clue` semantics (the server still validates control and phase), Quick picks behavior.

## Success criteria

- Every row of the product brief's table resolves as "Should be", and every "already works" phrase still resolves.
- A tie returns `ambiguous` and picks nothing.
- A 2nd-hearing-only match picks; the UI shows the top hearing.
- `voice pick` log lines appear with `outcome=picked` and `outcome=missed`, carrying the fields above, so the miss rate is `missed / (picked + missed)` per game.
- `voice_pick_missed` from a player without control, or past the flood limits, logs nothing and changes nothing.

## Test plan

- `web/src/lib/pickByVoice.test.ts`: one fixed board built from the product brief's real category names (SCIENCE, U.S. PRESIDENTS, '80S MUSIC, 4-LETTER WORDS, BEFORE & AFTER, THE BIBLE, WORLD CAPITALS, POTENT POTABLES, & THE BEST SUPPORTING ACTOR OSCAR GOES TO..., SOUNDS LIKE TENNIS, THE 20TH CENTURY, WORLD WAR II, ST. LOUIS BLUES, "P" IN THE U.S.A.).
  - A table test with every product-brief row, both "should be" and "already works".
  - Ties ("history" with AMERICAN HISTORY and HISTORY OF ART), and a cleared category dropping out.
  - The last amount wins; Quick picks unchanged; `matchPickAny` order.
- `web/src/game/VoicePick` / `PlayerControls` tests:
  - an alternative-only match sends `select_clue` with `via: "voice"`
  - a miss sends one `voice_pick_missed`; a cancel sends none
  - a tap sends `via: "tap"`
- `game/internal/room`:
  - `voice_pick_missed` is accepted from the controller on the board and dropped otherwise
  - the flood guard (1/s, 20/game)
  - `categories` comes from the server board
  - `select_clue` without `via` still works
- Commands:
  ```bash
  mise run gen
  mise run test:web -- src/lib/pickByVoice.test.ts src/game/PlayerControls.test.tsx
  mise run test:game -- ./internal/room/...
  ```

## Logging requirements

| Level | Message | Fields |
|---|---|---|
| `info` | `voice pick` | `outcome` (`picked` / `missed`), `game_id`, `user_id`; picked: `board_clue_id`; missed: `problem`, `heard`, `alternatives`, `categories` |

- `room_id`, `service` and `env` come from the room logger, as on other room lines.
- **Spoken pick text is logged at `info`** (decision above). This is an explicit exception to "player speech only at `debug`": a pick is a category name and an amount, not an answer, and the miss text is the whole point.
- Never logged: answers (unchanged), tokens, emails, the whole message.
- `heard` and `alternatives` are capped at 200 characters each by the schema and `clip()`.

## Docs to update

- `docs/product-docs/features/gameplay/feature-brief.md` ("The board and control"): a pick matches any part of a category name that fits only one open category, ties fail, other hearings are tried, and the amount spellings accepted.
- `docs/system-docs/architecture/realtime-game-server.md`: the Quick picks paragraph mentions `via` and `voice_pick_missed` (logged only, no state).
- `docs/system-docs/operations/logging-conventions.md`: §5 notes the spoken-pick exception, and the `voice pick` event goes in a short events list.
- `docs/system-docs/operations/data-retention.md`: the "Server logs" row says they hold spoken pick text (failed picks) as well as user IDs.

## Branch
`bug-fix/voice-pick-matching-impl`, from and into `develop` (no GH key: Actions is down, so no issue is created)
