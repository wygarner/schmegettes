---
jira-type: new-feature
jira-title: "Sound effects: correct and time's-up stings, Daily Double, Double Schmegettes, buzzer press"
---
# Task spec: sound-effects

Product brief: `tasks/sound-effects/product-brief.md`. Rules: `docs/product-docs/features/sound-effects/feature-brief.md` and `interaction-design.md`.

**Depends on:** `schmegettes-voices-prod` (shared audio output and silent-switch handling) and `clue-pacing` (the response line now reports its end; the sting goes before it).

## Approach

**Sounds are synthesized with Web Audio, not shipped as files.** Each sound is a short recipe of oscillators, envelopes and noise in code (`web/src/lib/sfx.ts`). That makes them original by construction (no license, no third-party notice, no imitation risk), adds no download, can't fail to load, and is tunable in code. If a recipe sounds too synthetic after tuning, swapping one for a CC0 file later only changes that recipe; the brief allows either.

All sounds play through the same `AudioContext` and output as the narrator (`audioContext()` / `narratorOutput()` from `web/src/lib/piper/audio.ts`), so unlocking and the silent-switch handling apply. A gain node keeps effects about 3 dB below the narrator.

| Sound | Function | Recipe (starting point, tune by ear) | Length |
|---|---|---|---|
| Correct | `playCorrect()` | Two sine/triangle notes a fifth apart (E5 → B5), fast attack, short decay | ≤ 0.8 s |
| Time's up | `playTimesUp()` | Low triangle note with a slight downward pitch bend, soft attack | ≤ 0.8 s |
| Daily Double | `playDailyDouble()` | Rising arpeggio (4–5 notes) with a shimmer of filtered noise | ≤ 1.5 s |
| Double Schmegettes | `playDoubleRound()` | Short brass-like fanfare: detuned saw pair through a low-pass, 3 notes | ≤ 2.5 s |
| Buzzer press | `playBuzz()` | Low "thunk": sine at ~110 Hz with a fast pitch drop plus a click of noise | ≤ 0.2 s |

Each `play*()` returns a promise that resolves when the sound ends (or at once if audio isn't running: never rejects, never throws).

**Ordering against the narrator (host device).** The correct-response line waits for the sting: in `HostGame.tsx`, the `response:` speech runs `await playCorrect()/playTimesUp()` then `narrate(line)`, then reports `reading_done` (per `clue-pacing`). Daily Double: `playDailyDouble()` starts when the "DAILY DOUBLE" reveal shows, and "It's a Daily Double." starts after it ends. Double Schmegettes: `playDoubleRound()` when the interstitial appears; no narration there. None of this changes a server timer: the 6 s clue-end cap, the 2 s reveal and the 3 s interstitial already cover the sounds' lengths.

**Buzzer press.** In the shared `Buzzer` component (`web/src/game/Buzzer.tsx`), on pointer-down, play `playBuzz()` when the state is `dim`, `lit` or `pick`. Nothing for `idle`, `locked`, `answering`, `early`, `listening`. The first press on a phone is the gesture that unlocks its `AudioContext` (call `unlockAudio()` first in the same handler). On phones this is the only sound; phones still never load Piper.

## Subtasks

1. **web: sfx library** (`web/src/lib/sfx.ts`): the five recipes, the effects gain, the promise contract, and a guard that skips silently when the context isn't `running`.
2. **web: host device** (`web/src/game/HostGame.tsx`, `DailyDoubleStage.tsx`, the interstitial): sting → line ordering; Daily Double and round sounds; a pause (`state.paused`) stops a playing effect (expose `stopEffects()`).
3. **web: buzzer** (`web/src/game/Buzzer.tsx`): press sound by state, on every device that renders a buzzer (phones and the host's column).
4. **devtools**: a small `/designer` page listing the five sounds with a play button each, so they can be tuned by ear without a game.
5. **docs**.

## Key files

New `web/src/lib/sfx.ts` (+ test), `web/src/game/HostGame.tsx`, `Buzzer.tsx`, `DailyDoubleStage.tsx`; `devtools/src/designs/` (new sounds page).

## Contracts preserved

No change to `shared/`, REST, WebSocket, or the database. No server timing changes.

## Success criteria

- On an iPhone host (silent switch on and off) and desktop Chrome: each TV sound plays at its moment, and the narrator's line starts after the sting ends.
- A phone plays the thunk on every press in `dim`, `lit` and `pick`, including after the TV has narrated (QA's sequence: press to pick, clue read, buzz → thunk every time), and never in `idle`/`locked`/`answering`.
- With audio blocked, no sound plays, nothing throws, and every timing is unchanged.
- No new files in `web/public` and no new third-party notices.

## Test plan

- `web/src/lib/sfx.test.ts` (fake `AudioContext`): each `play*()` schedules nodes on the shared output and resolves after its length; resolves at once when the context isn't `running`; `stopEffects()` stops them.
- `web/src/game/Buzzer.test.tsx`: press plays the sound in `dim`, `lit`, `pick`, and not in the other states.
- `web/src/game/HostGame.test.tsx`: the response line starts only after the sting resolves; the Daily Double line after the flourish; pause stops effects.
- `mise run test:web -- src/lib/sfx.test.ts src/game/Buzzer.test.tsx src/game/HostGame.test.tsx`
- By hand: the success criteria on an iPhone against staging; tune levels so the narrator stays loudest.

## Database migration plan

None.

## Logging requirements

None (client only).

## Docs to update

- `docs/system-docs/engineering/stack.md`: `web/` row: sound effects are synthesized with Web Audio on the host device and phones (buzzer only).
- `docs/product-docs/features/sound-effects/feature-brief.md` says "made for Schmegettes or CC0"; synthesized counts as made for Schmegettes. Adjust the "load with the app / under 1 MB" line to "generated in the browser".

## Branch

`new-feature/sound-effects-impl`, from and into `develop`. Jira isn't set up yet (`.github/jira.json` issue types are `REPLACE_ME`), so there's no `SCH-{N}`: the folder keeps its name, and the PR title is `[New Feature] sound-effects: …`.
