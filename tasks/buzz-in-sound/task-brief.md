---
jira-type: enhancement
jira-title: "Buzz-in sound on the TV when a player wins the buzz"
---
# Task spec: buzz-in-sound

Product brief: `tasks/buzz-in-sound/product-brief.md`. Product docs: `docs/product-docs/features/sound-effects/feature-brief.md` and `interaction-design.md`, merged in #198.

## Approach

Web only, on the host device. A new generated sound in `web/src/lib/sfx.ts`, next to the others, is triggered from `HostGame` when the room's phase goes **from `buzzing_open` to `answering`**. That transition is the server confirming a winning buzz, and it only happens live:
- a `room_snapshot` after a reconnect or reload sets the phase without a "previous `buzzing_open`" seen by this mount, so nothing replays;
- a Daily Double answer never passes through `buzzing_open`;
- Final has no `answering` phase from buzzing.

Each reopen after a wrong answer goes back to `buzzing_open`, so the next winner triggers it again.

No server, contract or timing change. The answer window starts on the server as today, and the sound is fire-and-forget (`void playBuzzIn()`).

## Subtasks (narrow → wide)

1. **web: the sound**: `web/src/lib/sfx.ts`: `export function playBuzzIn(): Promise<void>`.
   - A bright electronic buzz, ≤ 0.4 s, clearly unlike `playBuzz` (the 140→55 Hz thunk).
   - For example, two detuned square/sawtooth tones around 440–660 Hz through a lowpass, a fast attack and a ~0.3 s body with a short release.
   - Peak at or below the existing effects (≤ 0.45) so it sits under the narrator.
   - Original; don't imitate any TV show's cue (sound-effects feature brief).
   - It goes through the same `play()` helper, so `stopEffects()` (pause) stops it and the silent-switch/unlock behavior is shared.
2. **web: the trigger**: `web/src/game/HostGame.tsx`.
   - Keep the previous phase in a ref.
   - In an effect on `[state.phase, state.answeringUserId]`: when `prev === "buzzing_open" && state.phase === "answering" && state.answeringUserId && !state.paused`, call `void playBuzzIn()`. Then update the ref.
   - Initialize the ref from the first render's phase, so a mount straight into `answering` (reload) plays nothing.
   - Don't gate it on narration: buzzing is open only after the reading ends, so it can't overlap a line.
   - If the host plays and wins, the Buzzer's own `playBuzz` (press) already played; both play, as specified.
3. **docs**: none beyond the merged product docs. `docs/system-docs` doesn't list individual sounds; check `grep -rn playBuzz docs/` and update any list found.

## Key files

`web/src/lib/sfx.ts`, `web/src/lib/sfx.test.ts`, `web/src/game/HostGame.tsx`, `web/src/game/HostGame.test.tsx`.

## Contracts preserved

No change to `shared/`, the database, the game server or the api.

## Success criteria

The product brief's criteria. In particular:
- exactly one buzz-in per winning buzz, including after a reopen;
- none on early buzzes, a Daily Double, Final, or a reconnect into `answering`;
- the answer window is unchanged;
- phones play only their own thunk.

## Test plan

- `mise run test:web -- src/lib/sfx.test.ts src/game/HostGame.test.tsx`
  - sfx: `playBuzzIn` schedules tones and resolves within ~0.4 s (follow the existing tests' fake AudioContext).
  - HostGame, with `playBuzzIn` mocked:
    - `buzzing_open` → `answering` calls it once;
    - wrong answer → `buzzing_open` → `answering` again calls it a second time;
    - a snapshot that starts in `answering` doesn't call it;
    - a Daily Double (`daily_double_wager` → `clue_reading` → `answering`) doesn't;
    - a paused state doesn't.
- Manual (staging, iPhone host with the TV loud, ring/silent switch on): three phones.
  - Check the buzz-in is heard on every win and starts within ~100 ms of the answering screen.
  - Check the winner's transcripts aren't polluted when they stand near the TV. Note any stray words in the PR. Fixing them, for example by delaying the winner's recognizer start, would be a separate task.

## Database migration plan

None.

## Logging requirements

No change (client-side sound; the web app logs nothing for sounds today).

## Docs to update

None beyond the merged product docs (see subtask 3).

## Branch
`enhancement/buzz-in-sound-impl`, from and into `develop`. No Jira key: Jira is not configured yet (`.github/jira.json` issue types are `REPLACE_ME`), so `create-ticket` fails on this PR as expected.
