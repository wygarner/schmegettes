---
jira-type: bug-fix
jira-title: "Narrator reads every clue on supported hosts"
---
# Task spec: narrator-skips-clues

Product brief: `tasks/narrator-skips-clues/product-brief.md`.

## Approach

Fix the host's web-only Piper pipeline. The game server already keeps buzzing closed until either `reading_done` arrives or its length-based reading deadline expires; its state machine, timings, and contracts remain unchanged.

The failure has two parts on current `develop`:

1. `HostGame` suppresses the clue speech object for the entire 1.5 s pick reveal, so `narrate()` cannot begin synthesis until the clue is already visible. Its comment says the clue was prepared during the reveal, but nothing prepares it.
2. `narrator.ts` asks Piper to synthesize the complete first sentence before any audio can play. Many catalog clues are one long sentence, so a supported device can pass the short warm-up benchmark yet miss the 1.5 s first-audio timeout on a real clue.

Give narration an explicit prepare/play lifecycle. Clean the text once, divide it into bounded, natural chunks, and let `prepareNarration()` start the first chunk without playing it. When `narrate()` is called for the same voice and text, it consumes that in-flight or completed audio, starts playback only then, and synthesizes later chunks while earlier audio plays. A stale prepared line must never play for a later screen.

Use the otherwise silent lead-in already present for each long clue:

- ordinary clue: prepare during the 1.5 s pick reveal;
- Daily Double: prepare the wager-prefixed clue as soon as the locked wager makes the full line known, before the clue reading begins;
- Final: prepare the clue during the wager phase, before `final_answer` begins.

Short announcements and correct-response lines keep their existing sequence. When a sound effect precedes a response, preparation may begin before awaiting the effect, but playback still begins only after the effect ends.

Preserve the failure contract: if first audio is unavailable 1.5 s after playback is requested, the line returns `skipped`; `HostGame` sends no `reading_done`, and the server deadline advances the game. A synthesis error skips only that line. The next line tries the selected Schmegettes voice again. Do not introduce a built-in device voice, change narrator speed, extend the pick reveal, or report a partial line as complete.

## Subtasks (narrow → wide)

1. **Narration chunks (`web/src/lib/piper/sentences.ts` and tests).**
   - Extend the existing sentence splitter into a narration chunker, or add a sibling module if that keeps responsibilities clearer.
   - Prefer sentence boundaries, then clause punctuation, then word boundaries. Bound every non-empty chunk so one long or punctuation-light clue never requires Piper to synthesize the whole clue before playback can start.
   - Preserve every cleaned word exactly once and in order. Do not split initials and common titles incorrectly; retain the existing `U.S.`, `Dr.`, quotation, and empty-text behavior.
   - Keep the bound as an internal technical constant with tests at, below, and above it. Choose it against the existing `MAX_REALTIME_FACTOR` gate so the first chunk can be generated within the product's start allowance on a supported device.

2. **Prepare and play (`web/src/lib/narrator.ts`).**
   - Add a small explicit preparation API for a line. A prepared value/cache entry must include the selected Piper voice and cleaned text (or an equivalent unique identity), so a voice switch or different line cannot reuse the wrong audio.
   - Preparation starts synthesis only; it must not create or start an `AudioBufferSourceNode`, resume blocked audio, or emit sound.
   - `narrate()` reuses matching prepared first-chunk work, waits no more than `PIPER_START_TIMEOUT_MS` from the playback request, then schedules every chunk in order through `narratorOutput()` with no overlap, duplication, or dropped text.
   - Generate later chunks while the current chunk plays. Preserve `ended`, `failed`, `skipped`, and `stopped`: only a fully played line returns `ended`.
   - On a later-chunk synthesis error, let already scheduled/current audio finish, return `skipped`, and never send completion for the partial line. The next line remains usable.
   - `stopNarration()` stops all scheduled/current sources and prevents stale async work from starting audio. A new line, pause, phase change, or voice change cannot revive stopped/prepared audio.
   - Do not log clue text. No built-in speech-synthesis fallback.

3. **Host lifecycle (`web/src/game/HostGame.tsx` and tests).**
   - Refactor speech derivation just enough to expose a prepareable clue line before it becomes playable; do not show the clue or speak during the pick reveal.
   - Prepare ordinary clues during `state.reveal`, Daily Double clue lines once the wager prefix is known, and the Final clue before `final_answer`. If a snapshot/reload has no lead-in, fall back to chunked on-demand narration.
   - Begin correct-response preparation before its sound effect, while preserving effect → narration → 1 s server tail and the existing 6 s cap.
   - Keep the existing one-line-per-key behavior, pause/resume re-read, sound-unblock retry, and `reading_done` rule: send it only after `narrate()` returns `ended` for the still-current speech key.
   - Add component tests proving preparation occurs during the reveal but no audio starts until it ends, stale preparation is not played, and Daily Double/Final/correct-response sequencing remains intact.

4. **Manual device verification.**
   - On a recent iPhone or iPad and a current desktop browser, run a representative board with Kristin, Norman, and John.
   - Include short, long single-sentence, multi-sentence, abbreviation, quotation, numeric, and punctuation-light clues. Confirm the first word starts within 1 s after the clue appears, the full clue is spoken in order, and buzzing opens only after the final word.
   - Force or simulate a first-chunk timeout and a later-chunk error. Confirm the line does not report completion, the server fallback advances the game, and the next line uses the selected voice.

## Key files

- `web/src/lib/piper/sentences.ts`
- `web/src/lib/piper/sentences.test.ts`
- `web/src/lib/narrator.ts`
- `web/src/lib/narrator.test.ts`
- `web/src/game/HostGame.tsx`
- `web/src/game/HostGame.test.tsx`
- `web/src/lib/piper/engine.ts` only if a narrow cancellation/serialization hook is required; do not change voice loading, model selection, or the device benchmark without evidence from the implementation.

## Contracts preserved

No changes to `shared/`, REST, WebSocket messages, domain schemas, phase names, or server timing constants. `reading_done` retains its current meaning: the host reports it only after the room heard the complete line. No generated code.

## Success criteria

- A long, single-sentence clue is divided into bounded chunks; its first chunk is synthesized during the reveal and playback begins only after the clue appears.
- The cleaned narration text is spoken exactly once, completely and in order, with no audible overlap or gap introduced by the client pipeline.
- Normal clues start within 1 s after the reveal on supported QA devices, and the client cannot send `reading_done` until the final audio chunk ends.
- Daily Double and Final answer windows cannot begin from client completion before their complete clue narration ends.
- Correct-response sound effects still finish before the response is spoken; completion still produces the existing 1 s board-return tail and remains subject to the server's 6 s cap.
- A first-chunk timeout, missing engine, blocked audio session, stopped line, or later-chunk error cannot emit a false `reading_done`, play stale audio, freeze the UI, or disable the next line.
- Kristin, Norman, and John pass the product brief's manual QA matrix on supported host devices. No built-in device voice is used.
- Narration work remains off the main thread and the playing host's buzzer stays responsive.

## Test plan

Add or update focused Vitest coverage for:

- chunk boundaries and lossless reconstruction of long, punctuation-light, quoted, numeric, and abbreviation-heavy lines;
- prepared first-chunk reuse, silent preparation, ordered scheduling, timeout accounting from playback request, later-chunk failure, stop/stale-result handling, and recovery on the next line;
- host reveal preparation without early speech, full-line-only `reading_done`, Daily Double and Final preparation, correct-response sound ordering, pause/resume, and blocked-audio retry.

Run only the touched web tests:

```bash
mise run test:web -- src/lib/piper/sentences.test.ts src/lib/narrator.test.ts src/game/HostGame.test.tsx
```

Run Biome only on the touched files (include a new chunk module if one is added):

```bash
bunx biome check web/src/lib/piper/sentences.ts web/src/lib/piper/sentences.test.ts web/src/lib/narrator.ts web/src/lib/narrator.test.ts web/src/game/HostGame.tsx web/src/game/HostGame.test.tsx
```

Do not run the repository-wide suite locally.

## Database migration plan

None. No database access or persistence changes.

## Logging requirements

No new production log is required. If a caught web failure needs a diagnostic, use `console.error` only where handled, never include clue text, correct responses, full room state, tokens, credentials, emails, or full payloads. A normal timeout that cleanly uses the server fallback is degraded gameplay, not a repeated per-clue production error log.

## Docs to update

No durable product or system doc behavior changes: the existing gameplay, stack, and realtime-server docs already describe the intended result. Update inaccurate code comments in the touched files, especially the claim that the clue is already prepared during the reveal. If implementation requires changing any documented timing or failure behavior, stop and return to Product rather than silently editing the contract.

## Branch

`bug-fix/narrator-skips-clues-impl`, from and into `develop`. No Jira key: Jira is not configured yet (`.github/jira.json` has no `bug-fix` issue-type ID and the Jira secrets are unset), so the create-ticket workflow failed on this PR as expected.
