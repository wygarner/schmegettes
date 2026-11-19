---
jira-type: enhancement
jira-title: "Lobby tidy-up from prod QA"
---
# Task spec: lobby-tidy

Product brief: `tasks/lobby-tidy/product-brief.md`. Product docs: `docs/product-docs/features/lobby/` (feature brief, interaction design), `features/gameplay/feature-brief.md` (narrator default, fixed 9 s windows, host buzzer from Start), `features/rejoin-games/interaction-design.md` (resume lobby).

## Approach

Almost all web. One small migration makes the Timers removal hold on the server. No contract change.

- **Timers.** Keep the `TimerPace` contract, `rooms.timers` / `games.timers` and `play.Windows` as they are. Dropping them would be a breaking change to `Room`, the PATCH body and the DB enum, for no player benefit. A resumed game also needs `games.timers` to keep the times it started with. Instead:
  - web stops showing, sending and summarizing timers;
  - a migration resets every room to `standard` and makes `set_room_options` always write `standard`. A stale browser tab that still sends `fast` gets no error and has no effect.
  
  `games.timers` on games already started is untouched, so an in-progress or resumed game keeps its pace.
- **Norman default.** `saveVoice` is only called from the picker (`NarratorVoicePicker.tsx`) on an explicit tap, so "nothing saved" already means "never picked". Changing `DEFAULT_PIPER_VOICE` to `"norman"` gives the product rule as written: never picked → Norman; picked Kristin/John → kept; old built-in voice → Norman. The existing "one voice kept" cleanup removes Kristin once Norman is ready.
- **Folding column** lives in `HostLayout` as an optional prop, used by the lobby (and resume lobby) only. Game screens are unchanged.

## Subtasks (narrow → wide)

1. **supabase**: `supabase migration new lobby_fixed_timers`
   - `update public.rooms set timers = 'standard' where timers <> 'standard';`
   - `create or replace function public.set_room_options(...)`: same signature, grants and checks as `20261118220000_game_options.sql`. The only difference is `timers = 'standard'`; `new_timers` is accepted and ignored, with a comment pointing to the lobby feature brief. Re-state `revoke`/`grant`.
   - Compatible with the code already running: the signature is unchanged, and the api keeps sending `timers`.
   - Test: extend `supabase/tests/game_options.test.sql`. As the host, `set_room_options(..., 'fast', ...)` leaves `rooms.timers = 'standard'`; seasons and double still change; the existing permission checks still pass. Update the plan count.
2. **web: options and timers**
   - `web/src/lib/gameOptions.ts`: remove `timers` from `GameOptions`, `DEFAULT_OPTIONS`, `isDefault`, `summary` and `savedOptions`. Saved JSON with `timers` is simply ignored. Remove `PACES` and `TimerPace` if nothing else uses them.
   - `fromRoom` ignores `room.timers`.
   - `web/src/pages/HostLobby.tsx` `useGameOptions`: stop sending `timers`.
   - `web/src/lib/rooms.ts` `RoomOptionsPatch`: drop `timers`.
   - `web/src/game/GameOptionsSheet.tsx`: remove the Timers control and its doc comment mention.
   - Buzz and answer windows in game still come from `buzzWindowMs` / `answerWindowMs` on the snapshot. Don't touch them.
3. **web: lobby screen** (`web/src/pages/HostLobby.tsx`, `web/src/game/HostLayout.tsx`, `web/src/game/NarratorVoicePicker.tsx`)
   - `HostLayout`: new optional `folded?: { folded: boolean; onToggle: () => void; tab: ReactNode }` (or similar).
     - Folded: grid columns become `minmax(0,1fr) 40px`, and the column renders `tab`, a full-height button "Players" + "3/6", vertical or stacked, with `aria-expanded=false` and `aria-label="Show players (3 of 6)"`.
     - Open: today's column, with a header button `›` (`aria-expanded=true`, "Hide players").
     - Game screens don't pass the prop.
   - `HostLobbyView`: `useState(true)` for folded. Not persisted, so every mount (new room, reload, rematch, resume) starts folded. Pass it for both `LobbyPlayers` and `ResumePlayers`.
   - **Join flash:** when `players.length` grows while folded, flash the tab's background gold for 600 ms; skip when `prefers-reduced-motion`. No flash on a leave or on a reconnect state change.
   - **No host buzzer in the lobby:** delete the `state.hostPlays && <PlayerControls … />` from the lobby column. The space-bar buzz in the lobby goes with it. `HostGame` already renders the host's controls after Start; confirm.
   - Labels: `"Join the game"`/`"Leave the game"` → `"Join"`/`"Leave"`.
   - Remove the `!enoughPlayers` "Need at least 1 player" text. Keep `ERRORS.not_enough_players` for the server error.
   - ⚙: a Mantine `ActionIcon` (≥ 44 × 44), content `⚙`, `aria-label="Game options"` and a `Tooltip` with the same text.
   - `NarratorVoicePicker` trigger: an `ActionIcon` with `🔊`, `aria-label={\`Narrator voice: ${label}\`}` (as today) plus a tooltip. While downloading, a Mantine `RingProgress` (or an SVG ring) around the icon shows the progress instead of " · 40%" text. Start's "Getting Norman ready… 40%" is unchanged.
4. **web: Norman default**: `web/src/lib/piper/voices.ts`: `DEFAULT_PIPER_VOICE = "norman"`, and order the list Norman, Kristin, John so the picker shows Norman first. Update the comment in `narratorVoice.ts` if it names Kristin.
5. **docs**
   - `docs/system-docs/architecture/realtime-game-server.md` (line on `games.timers`): new games are always standard; `relaxed`/`fast` remain only on games started before this.
   - `shared/` descriptions are unchanged (no regen).

## Key files

`supabase/migrations/<new>_lobby_fixed_timers.sql`, `supabase/tests/game_options.test.sql`, `web/src/lib/gameOptions.ts` (+ test), `web/src/lib/rooms.ts`, `web/src/game/GameOptionsSheet.tsx`, `web/src/pages/HostLobby.tsx` (+ test), `web/src/game/HostLayout.tsx`, `web/src/game/NarratorVoicePicker.tsx` (+ test if present), `web/src/lib/piper/voices.ts`, `web/src/lib/narratorVoice.test.ts`, `docs/system-docs/architecture/realtime-game-server.md`.

## Contracts preserved

No change to `shared/` (REST, WebSocket, schemas): `Room.timers` and the PATCH body's `timers` stay, and are always `standard` for new games. The DB enum and columns are unchanged; only the body of `set_room_options` changes.

## Success criteria

The product brief's criteria, plus:
- `rooms.timers` is `standard` for every room after the migration, and `set_room_options` can't change it.
- A game resumed from before the change keeps its `games.timers`.
- `HostGame` screens are pixel-identical (the column is never folded there).

## Test plan

- `supabase/tests/game_options.test.sql`: `mise run db:test`
- web:
  - `mise run test:web -- src/lib/gameOptions.test.ts`: no timers in options, summary or saved-options parsing; old saved JSON with `"timers":"fast"` parses to defaults for the rest.
  - `mise run test:web -- src/pages/HostLobby.test.tsx`:
    - opens folded, with tab text "Players" and the count;
    - the tab toggles and `›` folds;
    - a new player while folded updates the count;
    - no buzzer (`Buzz` role) in the lobby when `hostPlays`;
    - "Join"/"Leave" labels;
    - no "Need at least" text;
    - options button by label "Game options";
    - the options sheet has no Timers control.
    - Update the existing timer-summary tests.
  - `mise run test:web -- src/lib/narratorVoice.test.ts`: nothing saved → norman; `piper:kristin` → kristin; a legacy built-in value → norman.
  - The `NarratorVoicePicker` test, if present: icon button, accessible name, progress ring while downloading.
- No game, api or worker tests: their code doesn't change.

## Database migration plan

- File: `supabase migration new lobby_fixed_timers`.
- Tables: `public.rooms` (data update only).
- Function: `public.set_room_options`, same signature, `security definer`, `search_path = ''`, same revoke/grant.
- No new table, so no new RLS.
- pgTAP: `game_options.test.sql` as above.
- Compatible with running code: the api calls the same signature; the game server reads `games.timers`, which is untouched.

## Logging requirements

No change. The api's existing "room options changed" log keeps its `timers` field; it will just always read `standard`.

## Docs to update

`docs/system-docs/architecture/realtime-game-server.md` as above. Product docs are already merged (#192).

## Branch
`enhancement/lobby-tidy-impl`, from and into `develop`. No Jira key: Jira is not configured yet (`.github/jira.json` issue types are `REPLACE_ME`), so `create-ticket` fails on this PR as expected.
