---
jira-type: enhancement
jira-title: "Quick picks: say just the category to pick its lowest clue"
---
# Task spec: quick-picks

Product brief: `tasks/quick-picks/product-brief.md`. Product docs: `docs/product-docs/features/lobby/feature-brief.md` ("Game options") and `interaction-design.md`; `features/gameplay/feature-brief.md` ("The board and control") and `interaction-design.md`, merged in #196.

## Approach

A third game option that follows exactly the path `doubleRound` takes:
- `rooms.quick_picks` is set in the lobby through `set_room_options`;
- it's copied to `games.quick_picks` at `start_game`, so the game's rules never change under it and a resume keeps it;
- the game server loads it and sends it to clients on `room_snapshot`.

Spoken picks are already matched on the client (`web/src/lib/pickByVoice.ts` `matchPick`), and the phone sends the same `select_clue` a tap would. So the new rule is applied in `matchPick`. The server needs no pick logic: any unplayed clue is already a valid `select_clue` from the player in control, and taps can pick the lowest clue anyway. The server only carries the flag.

**Dependency:** build after **lobby-tidy** merges. That task's migration redefines `set_room_options` (timers always `standard`); this one must start from that body.

## Subtasks (narrow → wide)

1. **shared** (contract change: a new optional/defaulted field, additive):
   - `shared/openapi.yaml`:
     - `Room.quickPicks: boolean` ("Quick picks: a spoken pick of just a category picks its lowest clue left"), added to `required`;
     - PATCH `/v1/rooms/{roomId}` body `quickPicks: boolean`.
   - `shared/schemas/protocol/server-message.schema.json` `room_snapshot`: `quickPicks: boolean` ("This game's Quick picks option. Absent before a game starts.").
   - Run `mise run gen` and commit the generated output.
   - Additive and backward compatible: old clients ignore the field, and the api accepts PATCH bodies without it.
2. **supabase**: `supabase migration new quick_picks`
   - `alter table public.rooms add column quick_picks boolean not null default false;`
   - `alter table public.games add column quick_picks boolean not null default false;` Games before this had no Quick picks, which is what the default says.
   - `drop function public.set_room_options(uuid, boolean, integer[], public.timer_pace, boolean, integer);` then recreate it with a 7th parameter `new_quick boolean default null`.
     - The body is lobby-tidy's version plus `quick_picks = coalesce(new_quick, quick_picks)`.
     - Re-state `revoke all … from public, anon; grant execute … to authenticated` for the new signature.
     - The default keeps the 6-argument call that the running api makes working between the migration and the api deploy (migrations run first).
   - `create or replace function public.start_game`: the body of `20261118220000_game_options.sql`, plus `quick_picks` in the `insert into public.games (…)` and its `values (…, room.quick_picks)`. Check no later migration redefined `start_game` (none at the time of writing).
   - Grants/RLS: no new table. `rooms` and `games` use table-level select grants and existing policies, so the new columns are covered. Confirm, and don't add column grants.
   - pgTAP, in `supabase/tests/game_options.test.sql`:
     - defaults are `false`;
     - the host sets `quick_picks` true via `set_room_options` (7 args) and a 6-arg call still works and leaves it unchanged;
     - a non-host can't set it;
     - it can't be set after start;
     - `start_game` copies it to `games.quick_picks`.
3. **api** (`api/internal/rooms/handler.go`, `store.go`)
   - Read `r.quick_picks` into the room struct; map it to `Room.QuickPicks`.
   - PATCH: `QuickPicks *bool` in the body → `o.QuickPicks`, passed as the 7th argument. Include it in the "nothing to change" check.
   - Tests in `api/internal/rooms/*_test.go`, following the existing `DoubleRound` cases.
4. **game** (`game/internal/room/pgstore.go`, `game/internal/room/game.go`, `game/internal/play/game.go`)
   - `LoadGame` selects `quick_picks` into `GameData.QuickPicks`, passes it into the play setup (next to `Pace`/`NoDouble`), and adds it to the existing "game loaded" log fields.
   - `SnapshotFields` sets `m.QuickPicks = &g.s.QuickPicks` (or similar) once a game exists.
   - The server doesn't change `select_clue` validation.
   - Tests: the snapshot carries `quickPicks` for a game loaded with it on, and it's absent in the lobby.
5. **web**
   - `web/src/lib/gameOptions.ts`:
     - `quickPicks: boolean` in `GameOptions` (default `false`), `fromRoom`, `isDefault`, `savedOptions` (`o.quickPicks === true`);
     - `summary` adds "Quick picks" when on, after the Double part.
   - `web/src/lib/rooms.ts` `RoomOptionsPatch.quickPicks`; `HostLobby.tsx` `useGameOptions` sends it.
   - `web/src/game/GameOptionsSheet.tsx`: a "Quick picks" `Switch` under Double Schmegettes. Its description is "Say the category and amount" (off) / "Just the category picks its lowest clue" (on). It must still fit 844 × 390 without scrolling.
   - `web/src/lib/room.ts`: `quickPicks` in `RoomState` from `room_snapshot` (default `false`).
   - `web/src/lib/pickByVoice.ts` `matchPick(text, board, opts?: { quickPicks?: boolean })`: when `value === null`:
     - with `quickPicks`, pick the open clue with the smallest `value` in the matched category; if none is open → `taken`;
     - without it, today's rule (exactly one open → it, else `no-value`).
     - A heard value is handled as today and never falls back.
   - `web/src/game/VoicePick.tsx` `useVoicePick`: take the option and pass it through; `PlayerControls.tsx` gives it `state.quickPicks`. The host's spoken pick uses the same hook.
   - `PlayerControls.tsx:429`: the hint becomes "Say a category, like “Opera”, or a category and value" when `quickPicks` is on.
6. **docs**:
   - `docs/system-docs/architecture/realtime-game-server.md`: mention `games.quick_picks` / `quickPicks` on `room_snapshot` next to `games.timers`.
   - `docs/system-docs/architecture/api-contract.md`, if it lists `Room` fields.

## Key files

`shared/openapi.yaml`, `shared/schemas/protocol/server-message.schema.json` (+ generated), `supabase/migrations/<new>_quick_picks.sql`, `supabase/tests/game_options.test.sql`, `api/internal/rooms/{handler,store}.go` (+ tests), `game/internal/room/{pgstore,game}.go`, `game/internal/play/game.go` (+ tests), `web/src/lib/{gameOptions,rooms,room,pickByVoice}.ts`, `web/src/game/{GameOptionsSheet,VoicePick,PlayerControls}.tsx`, `web/src/pages/HostLobby.tsx` (+ tests).

## Contracts preserved

**Changes (additive):**
- `Room.quickPicks` (required in responses; the server always sends it);
- PATCH body `quickPicks` (optional);
- `room_snapshot.quickPicks` (optional).

No message type, phase or existing field changes. The api contract test and generated code are updated in the same PR.

## Success criteria

The product brief's criteria, plus:
- a 6-argument `set_room_options` call (the old api) still works after the migration;
- `quickPicks` survives a rematch (room) and a resume (game);
- with it off, `matchPick` behaves exactly as before (existing tests unchanged).

## Test plan

- `mise run db:test` (`game_options.test.sql`)
- `mise run test:api -- ./internal/rooms/...`
- `mise run test:game -- ./internal/room/... ./internal/play/...`
- `mise run test:web -- src/lib/pickByVoice.test.ts src/lib/gameOptions.test.ts src/lib/room.test.ts src/pages/HostLobby.test.tsx src/game/PlayerControls.test.tsx`
  - `pickByVoice`:
    - "Opera" with 200 done → 400;
    - Double board → its lowest open;
    - the lowest open is the Daily Double → that clue;
    - category with none open → `taken`;
    - "Opera for 600" with 600 done → `taken`;
    - "Opera for 1000" → `no-value`;
    - option off → unchanged.
- Manual (staging): with Quick picks on, say "Opera… for 600" with a deliberate pause. Record whether iOS Safari and Chrome finalize on "Opera" (the risk the product brief flags). Report what you see in the PR. Don't change recognizer settings in this task.

## Database migration plan

- File: `supabase migration new quick_picks`.
- Columns: `rooms.quick_picks`, `games.quick_picks` (boolean, not null, default false).
- Functions:
  - `set_room_options`: dropped and recreated with `new_quick boolean default null`; `security definer`, `search_path = ''`, same revoke/grant.
  - `start_game`: replaced, still `security invoker`.
- No new table, so no new RLS policies. Existing table grants cover the columns.
- pgTAP as above.
- Compatible with running code: the old api's 6-arg call resolves via the default; the old game server doesn't select the column; old web ignores it.

## Logging requirements

- api "room options changed" (`info`): add `quick_picks`.
- game "game loaded" (`info`): add `quick_picks`.
- No transcript text is logged (picks are matched on the client; nothing new is sent).

## Docs to update

As in subtask 6. Product docs are already merged.

## Branch
`enhancement/quick-picks-impl`, from and into `develop`, after lobby-tidy merges. No Jira key: Jira is not configured yet (`.github/jira.json` issue types are `REPLACE_ME`), so `create-ticket` fails on this PR as expected.
