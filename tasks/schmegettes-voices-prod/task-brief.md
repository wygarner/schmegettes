---
jira-type: bug-fix
jira-title: "Schmegettes voices are silent when the iPhone's silent switch is on"
---
# Task spec: schmegettes-voices-prod

Product brief: `tasks/schmegettes-voices-prod/product-brief.md`. Rule: `docs/product-docs/features/gameplay/feature-brief.md#the-narrators-voice` ("Plays through the silent switch").

## Approach

iOS Safari puts Web Audio in the "ambient" audio session category, which the ring/silent switch mutes. Speech synthesis and media elements use "playback", which ignores the switch. The fix is in one place, `web/src/lib/piper/audio.ts`, where the single `AudioContext` is made:

1. **Primary (iOS 16.4+):** before the context is created (and again whenever audio is unlocked), set `navigator.audioSession.type = "playback"` when `navigator.audioSession` exists. Feature-detect; never throw.
2. **Fallback (no `audioSession`, older iOS):** route the narrator's output through an `HTMLAudioElement`: `ctx.createMediaStreamDestination()` → `audio.srcObject = dest.stream` → `audio.play()` inside the unlocking tap. Use this path only on iOS without `audioSession` (detect iOS as `/iPad|iPhone|iPod/` or `Macintosh` + `maxTouchPoints > 1`). Elsewhere keep `ctx.destination`.
3. **Microphone:** when the host plays and answers, the browser switches the session to `play-and-record` for recognition. After recognition stops, set `audioSession.type = "playback"` again (a small exported `restorePlaybackSession()` called from the answer-capture teardown, `web/src/game/useAnswerCapture.ts`, and the spoken-pick teardown, `web/src/game/VoicePick.tsx`). Never set it while the recognizer is running.

Expose the output node through one function (`narratorOutput(ctx)`) so `narrator.ts` connects sources to it instead of `ctx.destination`. `sound-effects` will reuse the same output later.

## Subtasks

1. **web: audio session** (`web/src/lib/piper/audio.ts`)
   - `ensurePlaybackSession()`: sets `navigator.audioSession.type = "playback"` if supported. Called in `audioContext()` before `new AudioContext()` and in `unlockAudio()`.
   - `narratorOutput(ctx)`: returns `ctx.destination`, or the media-element bridge on iOS without `audioSession`. The bridge is created once and its `play()` is called from `unlockAudio()` (a tap).
   - `restorePlaybackSession()`: re-applies `"playback"`.
2. **web: narrator** (`web/src/lib/narrator.ts`): `source.connect(narratorOutput(ctx))` instead of `ctx.destination`.
3. **web: microphone teardown**: call `restorePlaybackSession()` after the recognizer ends in `useAnswerCapture.ts` and `VoicePick.tsx`.
4. **Typing**: `navigator.audioSession` isn't in TypeScript's DOM lib; add a minimal ambient declaration (`web/src/lib/piper/audio-session.d.ts`). Don't weaken other types.

## Key files

`web/src/lib/piper/audio.ts`, `web/src/lib/narrator.ts`, `web/src/game/useAnswerCapture.ts`, `web/src/game/VoicePick.tsx`, new `web/src/lib/piper/audio-session.d.ts`.

## Contracts preserved

No change to `shared/`, REST, WebSocket, or the database.

## Success criteria

- iPhone 11 and a recent iPhone, Safari, current iOS, **silent switch on**: the lobby sample and every narrated line of a game are heard in the Schmegettes voice.
- The same after the host (playing) answers with the microphone, and after locking and unlocking the phone mid-game.
- The volume buttons change the narrator's volume.
- Desktop Chrome/Safari and Android Chrome behave exactly as before (same output path: `ctx.destination`).

## Test plan

- `web/src/lib/piper/audio.test.ts` (new): with a fake `navigator.audioSession`, `audioContext()` sets `type = "playback"` before constructing the context; `unlockAudio()` re-applies it; no `audioSession` and not iOS → `narratorOutput` is `ctx.destination`; no `audioSession` on iOS → the media-element bridge, created once.
- `web/src/lib/narrator.test.ts`: sources connect to `narratorOutput(ctx)`.
- `mise run test:web -- src/lib/piper/audio.test.ts src/lib/narrator.test.ts`
- **By hand (required, record in the PR):** the success criteria on an iPhone 11 with the switch on, against staging.

## Database migration plan

None.

## Logging requirements

None (client only; no new logs).

## Docs to update

- `docs/system-docs/engineering/stack.md`, Narration row: one sentence that the narrator uses the `playback` audio session on iOS (silent switch ignored), with the media-element fallback.

## Branch

`bug-fix/schmegettes-voices-prod-impl`, from and into `develop`. Jira isn't set up yet (`.github/jira.json` issue types are `REPLACE_ME`), so there's no `SCH-{N}`: the folder keeps its name, and the PR title is `[Bug Fix] schmegettes-voices-prod: …`.
