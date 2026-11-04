---
jira-type: new-feature
jira-title: "Wagers: Daily Doubles and Final Schmegettes"
---
# Task spec: Wagers (Daily Doubles and Final Schmegettes)

Product brief: [product-brief.md](./product-brief.md). Rules, timings and screens: [feature brief](../../docs/product-docs/features/wagers/feature-brief.md) and [interaction design](../../docs/product-docs/features/wagers/interaction-design.md). Those docs are the source of truth for behavior. This spec says where it goes and how it's checked.

**Product decision taken:** the host's Final answer is typed on the mirrored host device into a masked field; iOS key pop-ups may still be visible on the TV. Accepted for v1. No mitigation in this task.

## Approach

- **All rules go in `game/internal/play`** (the pure state machine), as new steps alongside the existing ones. `internal/room` only wires intents, timers, per-user delivery and writes. The board builder already places Daily Doubles (1 Single, 2 Double, never row 0) and the Final clue. Nothing changes in `start_game` / `build_board_round`.
- **Secrets travel per user.** Today a `Broadcast` has an `All` copy and a `Host` copy. Add a third: `Private map[userID]any`, the same message with the same `seq`, with that user's own secret fields filled in. Every socket still gets every `seq`. The host user never gets a private copy of the host's own Final wager or answer, because the host device is on the TV. The host's sockets get the `Host` copy, which never contains Final amounts or answers.
- **Final wagers and submitted Final answers are persisted** in a new engine-only `wagers` table, so a restart mid-Final doesn't lose them. Drafts stay in memory only.
- **Final answers are recorded as `answers` rows only at the reveal**, one per finalist in reveal order. Players can read `answers` and `game_results` for their game, so nothing about Final may land there earlier.
- **Fix a pre-existing leak that wagers make matter:** `authenticated` can read `board_clues.is_daily_double`, and the Final row, for an in-progress game. Tighten the policy (Migration plan).

## Contracts (additive, `schmegettes.v1` unchanged)

Every change is a new optional field, a new message type, or a new enum value. Nothing is removed, renamed or made required. Run `mise run gen` and commit the output.

| File | Change | Why |
|---|---|---|
| `client-message.schema.json` | `SubmitAnswer.source` enum: add `"typed"`. Update the description: typed is accepted only in `final_answer`. | Final answers are typed |
| `client-message.schema.json` | `AnswerProgress` description: in `final_answer` it carries the sender's private draft and is never relayed. Drafts are rate-limited like transcripts (4/s); the client debounces about 300 ms and always sends the last draft. | Draft survives a phone disconnect |
| `client-message.schema.json` | `SubmitWager`: no change (`amount` ≥ 0). The server checks ranges. | |
| `server-message.schema.json` | `BoardClue.dailyDouble` (boolean, optional): set only on the active clue once picked, never on the board | Phones and TV know it's a DD without leaking placement |
| `server-message.schema.json` | `PhaseChanged` and `RoomSnapshot`: optional `wagerMin`, `wagerMax` (DD range, public), `wager` (DD amount once locked, public), `finalistUserIds`, `lockedUserIds` (Final: wager locked in `final_wager`, answer submitted in `final_answer`), `revealOrder` (userIds, in `final_reveal`) | TV tiles, phone states, recovery |
| `server-message.schema.json` | `RoomSnapshot`: optional `myWager`, `myFinalAnswer`, `myFinalSubmitted`, filled only in the private copy for that user (never for the host user) | Reconnect restores the player's own state |
| `server-message.schema.json` | New message `wager_locked` {`roomId`, `seq`, `userId`, `amount?`}. DD: `amount` on every copy. Final: `amount` only in the owner's private copy. | Live "✓ locked" and the public DD amount |
| `server-message.schema.json` | New message `final_submitted` {`roomId`, `seq`, `userId`, `answer?`}. `answer` only in the owner's private copy. | Live "✓ submitted" |
| `server-message.schema.json` | `AnswerJudged.wager` (integer, optional): set for DD verdicts and each Final reveal step | TV reveal shows the wager |
| `server-message.schema.json` | `GameOver.finalSkipped` (boolean, optional) | "Nobody's in the black" screen |
| `server-message.schema.json` | `Error.code`: add `invalid_wager`, `not_a_finalist` | Server-side validation |
| `domain.schema.json` | Add `AnswerSource` enum `["voice", "typed"]` (mirrors the DB enum, per migration rules) | Enum values must match the DB |

Phases already exist (`daily_double_wager`, `final_category`, `final_wager`, `final_answer`, `final_reveal`). Steps inside a phase (DD reveal vs. wager vs. "wagers $X"; Final reveal per finalist) are server steps, not new phases. Clients derive them from `deadlineAt`, `wager` and `answer_judged`.

## Subtasks

### 1. `shared/` contracts

Everything in the table above. Then `mise run gen`, and commit the generated TS, Go and Python.

**Key files:** `shared/schemas/protocol/client-message.schema.json`, `shared/schemas/protocol/server-message.schema.json`, `shared/schemas/domain.schema.json`, `shared/generated/**`, `game/internal/contracts/contracts_gen.go`.

### 2. `supabase/` migration

See the Migration plan.

**Key files:** `supabase/migrations/{ts}_wagers.sql`, `supabase/tests/wagers.test.sql`.

### 3. `game/` rules (`internal/play`)

**Clue model:** add `DailyDouble bool` to `play.Clue`. Add the Final clue to `Setup` (`Final *Clue`) and Final recovery state (`FinalWagers map[user]int`, `FinalAnswers map[user]string` for submitted answers, `FinalRevealed map[user]bool` from `answers` rows on the Final clue).

**Daily Double** ([feature brief](../../docs/product-docs/features/wagers/feature-brief.md#daily-doubles)):
- `Pick` on a DD clue → phase `daily_double_wager`, `activeClue.dailyDouble = true`, `wagerMin = 5`, `wagerMax = max(score, 800 | 1600)`. Deadline: 2 s reveal + 30 s. A wager is accepted any time in the phase.
- `Wager(now, user, amount)`: only the picker. Out of range → `invalid_wager`. Not the picker → `not_your_turn`. A second wager → `ErrIgnored`. On a valid wager: `wager_locked` with the amount → 2 s "wagers" step → `startReading`, with announcement `"For {wager}, here's the clue."`.
- Timeout without a wager → wager $5 and continue the same way.
- `clue_reading` for a DD: `ReadingDone` (or the fallback timer) goes to `answering` with `answering = picker`. It never opens buzzing.
- Judge: ±wager, `AnswerJudged.wager` set. No reopen, so the clue ends. Control stays with the picker.
- **Disconnect while answering a DD does not clear the answerer.** That differs from regular clues. The 14 s answer deadline runs, and no answer means −wager. A reconnect within the window gets `answeringUserId` = self and answers.
- **Pause:** the reveal and wager steps keep their remaining time (see Pause below). DD reading or answering re-reads from the start on resume, as today. The picker answers again.

**Final Schmegettes** ([feature brief](../../docs/product-docs/features/wagers/feature-brief.md#final-schmegettes)):
- `nextAfterClue` when Double is done: finalists = contestants with score > 0, in join order.
  - None: `finish` with `GameOver.finalSkipped = true`. Don't reveal the Final clue (it stays unseen).
  - Otherwise: phase `final_category` with `activeClue` = Final (category, `value: 0`, no `clueText` yet) and `finalistUserIds`. Deadline: 3 s title + `ReadingTime` of the category announcement.
- `ReadingDone` in `final_category` (accepted only once 3 s have passed since phase start) or the timer → `final_wager`, 30 s.
- `Wager` in `final_wager`: finalists only (`not_a_finalist` otherwise). Range 0..score (`invalid_wager`). The first valid wager locks it. Emit `wager_locked`, with the amount only in the owner's private copy (none for the host user), and record `RecordWager`. Everyone locked → move on at once. Timeout → unlocked finalists are $0, recorded too.
- `final_answer`: record `RevealClue` for the Final clue, then emit the phase with `clueText` in the host copy. Reading → `ReadingDone`/fallback → 30 s deadline.
  - Drafts (`Progress` from a finalist, any time in the phase) are stored in memory, never broadcast.
  - `Answer` with `source: typed` from a finalist (rejected with `wrong_phase` outside `final_answer`, and `voice` is rejected in `final_answer`) locks their answer and records `SubmitFinalAnswer`. Emit `final_submitted`, with the answer only in the owner's private copy.
  - All finalists submitted → move on at once. Timeout → each unsubmitted finalist's last draft (or `""`) becomes their answer, recorded the same way.
- `final_reveal`: `revealOrder` = finalists by pre-Final score ascending, join order breaking ties. For each, about 8 s apart: `judge`, `RecordAnswer` (source `typed`, delta ±wager, $0 wager → delta 0, empty answer → incorrect), and `answer_judged` with `wager`. Scores update per step. Then `clue_ended` (correct response in the host copy) for 4 s, `FinishClue(final, answered)`, and `finish`.
- Ties for the top score: existing `Results()` placement already shares 1st. No change.

**Pause:** generalize `pause()`/`resume()` so the DD reveal and wager steps, `final_category`, `final_wager`, the Final answer window (after reading) and each reveal step keep their **remaining** time on resume (store `remaining = deadline − now` at pause). `final_answer` while still reading re-reads, as today. A Final reveal step restarts that finalist's step.

**Recovery (`New` from `Setup`):**
- Active clue is a DD: no wager row → `daily_double_wager` fresh. Wager row → `clue_reading` with that wager, re-read.
- Double done, Final clue `unplayed`: no final wager rows → `final_category`. Some rows → `final_wager` with those locked and a fresh 30 s.
- Final clue `active`, with no `answers` rows on it: `final_answer` with a fresh 30 s. Submitted answers come from `wagers.answer`. Drafts are lost (documented).
- Final clue `active` with some `answers` rows: `final_reveal`, continuing from the first finalist without a row.
- Final clue `answered`: `finished` (call `EndGame` again; it's idempotent).

**Records:** add `RecordWager` (clue, user, amount) and `SubmitFinalAnswer` (clue, user, answer). `RecordAnswer` gains `Source`.

**Key files:** `game/internal/play/game.go` (consider splitting into `wager.go` / `final.go` in the same package), `game/internal/play/game_test.go`.

### 4. `game/` wiring (`internal/room`)

- `handleGame`: route `submit_wager` → `Wager`, `submit_answer` with `source` → `Answer` (pass source), `answer_progress` → `Progress` (draft in Final).
- `sendGame`: deliver `Private[c.UserID]` when present, else `Host` for the host user, else `All`. Never send a `Private` copy to the host user.
- Snapshot: fill the `my*` fields per socket (not for the host user).
- `PGStore`: `LoadGame` loads `is_daily_double`, the Final clue (round `final`), final wager rows and submitted answers, and which finalists already have an `answers` row on the Final clue. Add `RecordWager` and `SubmitFinalAnswer`. `RecordAnswer` passes the source instead of the hard-coded `'voice'`.
- `write`: handle the new record kinds. The clip to 200 chars applies to Final answers.

**Key files:** `game/internal/room/game.go`, `game/internal/room/room.go`, `game/internal/room/pgstore.go`, `game/internal/room/game_test.go`, `game/internal/room/room_test.go`.

### 5. `web/`

- **State** (`web/src/lib/room.ts`): reduce `wager_locked`, `final_submitted`, the new phase fields, `my*` snapshot fields, `AnswerJudged.wager`, and `GameOver.finalSkipped`. Keep the Final reveal steps in state for the stage.
- **Timings** (`web/src/game/timing.ts`): DD reveal 2 s, DD wager 30 s, "wagers" 2 s, Final title 3 s, Final wager 30 s, Final answer 30 s, reveal step 8 s (line interval 2 s), final correct response 4 s, skipped 4 s. These mirror `play`.
- **Narration** (`web/src/lib/speech.ts` or wherever the announcement lives): "It's a Daily Double.", "For {wager}, here's the clue.", "The Final Schmegettes category is: {category}." The host device sends `reading_done` after the category and after the Final clue.
- **New components:**
  - `web/src/game/WagerPad.tsx`: digits, backspace, **Min**/**Max**, a confirm button disabled out of range with a hint, and a `masked` mode (dots; Min/Max don't reveal the amount).
  - `web/src/game/FinalAnswerField.tsx`: one line, autofocus, `autocorrect="off" autocapitalize="off" spellcheck={false}`, 200 max, Submit and return, debounced drafts (about 300 ms plus a trailing send), countdown above the field, `masked` mode for the host device (`type="password"`-style dots).
  - `web/src/game/DailyDoubleStage.tsx` (reveal, "is wagering…", "wagers $X") and `web/src/game/FinalStage.tsx` (title, category, wager and answer countdowns, reveal lines, skipped).
- **Phone** (`PlayerControls.tsx`, `PlayerGame.tsx`): the states in the interaction design's phone table. A DD auto-listens after reading (`useAnswerCapture.ts`, reused). Final shows the typed field, not the mic. Non-finalists see "You're not in Final. Watch the TV."
- **Host device** (`HostGame.tsx`, `PlayerColumn.tsx`): stage screens. Tile labels: "WAGERING", "wagering…", "✓ locked", "not in Final", "writing…", "✓ submitted". When the host plays: a public WagerPad for the DD; a masked WagerPad and masked FinalAnswerField for Final, all fitting 667 × 320 in the player column. The host device never renders the host's Final amount or answer.

### 6. Docs

See Docs to update.

## Success criteria

- [ ] A 2-player game played start to finish hits a DD and ends through Final, `games.status = finished`, and each `game_results.score` equals the live final score.
- [ ] DD wager range is enforced by the server: $5..max(score, 800/1600). Final: 0..score. Out of range → `invalid_wager`.
- [ ] No message delivered to a non-owner phone, or to the host device, contains a Final wager amount, Final answer, or Final draft before that finalist's reveal step. The correct response never reaches a phone. Tested on the serialized payloads in `internal/room`.
- [ ] `board.dailyDouble` is never present on board listings, only on the active clue after a pick.
- [ ] Each timer falls back: DD wager → $5, Final wager → $0, Final answer → last draft or `""`. All of them keep their remaining time across a host-device pause.
- [ ] A DD answerer who disconnects and stays away loses the wager. A finalist who disconnects with a draft has that draft judged.
- [ ] Restarting `game/` mid-Final (after wagers, after submits, mid-reveal) resumes per the Recovery rules with no lost wager or submitted answer.
- [ ] `authenticated` can't read `is_daily_double` or the Final row of an in-progress game they're in, or anything in `wagers` (pgTAP).
- [ ] Host-plays views fit 667 × 320 without scrolling.
- [ ] Generated contract code is committed and `mise run gen` is clean.

## Test plan

Targeted runs only. Never the full suite.

**`game/internal/play`** (`mise run test:game -- ./internal/play/...`), table-driven in `game_test.go` (or `wager_test.go` / `final_test.go`):
- DD: pick → wager phase with the range. Range edges (5, max, max+1, 4; a negative-score player gets 800/1600). A non-picker wager is rejected. Timeout → $5. Correct/incorrect ±wager. No buzz opens. Control stays. Disconnect while answering → −wager at the deadline. Reconnect in time → can answer. Pause keeps the remaining wager time.
- Final: no finalists → `finalSkipped`, no `RevealClue`. One finalist. Wager range 0..score. A non-finalist → `not_a_finalist`. All locked → early advance. Timeout → $0. A `voice` answer rejected in Final, `typed` rejected outside it. Drafts never appear in any `Broadcast.All`/`Host`. Timeout uses the last draft. Reveal order (ascending, join-order ties). $0 wager → delta 0. Empty answer → incorrect. Tie for first → shared placement.
- Recovery: each Recovery bullet as a `Setup` → expected phase and state.

**`game/internal/room`** (`mise run test:game -- ./internal/room/...`):
- `sendGame` private delivery: the owner gets the amount and answer, others and the host user don't. Same `seq` on every copy.
- The host plays and is a finalist: no host socket ever receives the host's amount or answer before the reveal.
- Snapshot `my*` fields per socket.
- `PGStore` against the test DB if the existing tests do (follow `game_test.go`'s pattern): `LoadGame` returns the DD flag, Final clue, wagers and submitted answers.

**`web/`**:
- `mise run test:web -- src/game/WagerPad.test.tsx` (limits, Min/Max, masked mode never renders digits)
- `mise run test:web -- src/game/FinalAnswerField.test.tsx` (debounce and trailing draft, submit locks, 200 cap, masked)
- `mise run test:web -- src/game/PlayerControls.test.tsx src/game/PlayerColumn.test.tsx src/game/HostGame.test.tsx`
- `mise run test:web -- src/lib/room.test.ts` (new messages and fields)

**`supabase/`**: `mise run db:test` (new `wagers.test.sql`; `rls.test.sql` and `gameplay.test.sql` if touched).

**`shared/`**: `mise run gen`, and commit.

## Database migration plan

`supabase migration new wagers` → `supabase/migrations/{ts}_wagers.sql`:

1. `alter type public.answer_source add value if not exists 'typed';`. Postgres can't use a new enum value in the same transaction it was added in, so nothing below may reference `'typed'` as a literal. `record_answer` already takes `answer_source` as a parameter.
2. Table `public.wagers`:
   - `id uuid primary key default gen_random_uuid()`
   - `game_id uuid not null references public.games (id) on delete cascade`
   - `board_clue_id uuid not null references public.board_clues (id) on delete cascade`
   - `game_player_id uuid not null references public.game_players (id) on delete cascade`
   - `amount integer not null check (amount >= 0)`
   - `answer text check (char_length(answer) <= 200)`, Final only, set on submit
   - `submitted_at timestamptz`
   - `created_at timestamptz not null default now()`
   - `unique (board_clue_id, game_player_id)`, plus an index on `game_id`
3. RLS: `alter table public.wagers enable row level security;`. Grants: `revoke all … from public, anon, authenticated`; `grant select, insert, update … to game_engine`; policy `engine_wagers for all to game_engine using (true) with check (true)`. **No `authenticated` policy or grant**: wagers stay secret. Wager outcomes reach players only as `answers` rows at the reveal.
4. Functions (`security invoker`, `set search_path = ''`, `revoke` from `public, anon, authenticated`, `grant execute` to `game_engine`), idempotent like `record_answer`:
   - `record_wager(target_board_clue uuid, target_user uuid, wager_amount integer)`: insert on conflict do nothing (the first wager wins). Raise if the user isn't a contestant in the clue's game.
   - `submit_final_answer(target_board_clue uuid, target_user uuid, answer_text text)`: update `answer`, `submitted_at` only where `submitted_at is null`.
5. **Leak fix:** replace `board_clues_select` with `using (public.is_game_member(game_id) and (revealed_at is not null or exists (select 1 from public.games g where g.id = game_id and g.status <> 'in_progress')))`. During a game, players see only revealed clues; afterwards, everything, for history. No app code reads `board_clues` through the API today (checked `web/src`, `api/internal`).

**pgTAP** `supabase/tests/wagers.test.sql`:
- RLS is enabled on `wagers`. `authenticated` (a player in the game) selects 0 rows and can't insert or update. `anon` gets nothing.
- `game_engine`: `record_wager` inserts, and a second call with a different amount leaves the first. `submit_final_answer` sets it once, and a second call doesn't change it.
- `amount < 0` fails, and an answer of more than 200 characters fails.
- `record_answer(…, 'typed', …)` succeeds.
- A player in an in-progress game can't see unrevealed `board_clues` rows (including the Final and DD rows), sees revealed ones, and sees all of them after `end_game`.

**Compatibility with running code:** additive (an enum value, a new table and functions, and a narrower read policy nothing in the app uses). The deployed `game/` keeps working: it never writes `typed` or calls the new functions.

## Logging

Use the service logger with `room_id` and `game_id` bound (`logging-conventions.md`).

| Event | Level | Fields |
|---|---|---|
| `daily double` (picked) | `info` | `clue_id`, `user_id` |
| `final started` | `info` | `finalists` (count) |
| `final skipped` | `info` | — |
| `wager locked` | `debug` | `user_id`, `kind` (`dd` / `final`), `amount` |
| `wager defaulted` (timeout) | `debug` | `user_id`, `kind`, `amount` |
| `final answer submitted` | `debug` | `user_id`, `timed_out` (bool). Answer text only at `debug`, per §5 |
| Write failures for the new records | existing `flush` path (`error` after max tries) | `record_kind` |

Rejected wagers (`invalid_wager`, `not_a_finalist`) are normal gameplay: `debug` or nothing. No tokens, no emails, no whole messages. **Final wager amounts and answers never above `debug`.**

## Docs to update

- `docs/system-docs/architecture/realtime-game-server.md`: a Wagers section (DD flow, Final flow, private copies), the Recording table (`record_wager`, `submit_final_answer`, `record_answer` source), Recovery for DD and Final, and drafts not surviving a restart.
- `docs/system-docs/architecture/data-and-isolation.md`: the `wagers` row in Policies ("**nothing**") and the narrowed `board_clues` read during a game.
- `docs/system-docs/architecture/api-contract.md`: only if it lists message types.
- `docs/product-docs/`: no change expected. If behavior has to differ, stop and ask `/product`.

## Risks

- **Private delivery is new.** A bug leaks Final wagers or answers. The `internal/room` payload tests are the guard.
- **Recovery mid-Final** is the most complex state. Drafts are lost on a `game/` restart, by design.
- **Mobile keyboards** on 667 × 320 and small phones may cover the countdown. Check by hand on an iPhone SE-sized viewport.
- **The host's mirrored keyboard** may reveal the host's Final answer through iOS key pop-ups. Product accepted this for v1.
