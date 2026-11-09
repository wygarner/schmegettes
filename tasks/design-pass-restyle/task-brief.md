---
jira-type: new-feature
jira-title: "Design pass 1/3: new look, red buzzer, self-hosted fonts, host inputs on the stage"
---
# Task spec: design-pass-restyle

Product brief: [product-brief.md](./product-brief.md). Visual reference: the prototypes in `devtools/src/designs/` (the kit in `system/components.tsx` is the source for every value: colors, gradients, sizes, keyframes). Web only: **no contract, database, or server change.** Tickets 2 (`design-pass-endgame`) and 3 (`design-pass-history`) build on the shared UI pieces this ticket adds, so it ships first.

## Subtasks

### 1. Fonts, self-hosted (web)

- Add `@fontsource/oswald` and `@fontsource/inter` to `web/package.json` (exact versions, no ranges; `bun install`, commit `bun.lock`). Import only the weights used: Oswald 500, 600, 700; Inter 400, 500, 600, 700, 800 (latin subset).
- Import them once in `web/src/main.tsx`. Font files are bundled by Vite and served from the app's origin. Nothing loads from `fonts.googleapis.com` or any CDN.
- Use `font-display: swap` (the Fontsource default).

Key files: `web/package.json`, `bun.lock`, `web/src/main.tsx`.

### 2. Design tokens and shared UI pieces (web)

Create `web/src/ui/` for pieces used across screens (tickets 2 and 3 reuse them):

| File | What |
|---|---|
| `tokens.ts` | `NIGHT`, `STAGE`, `PHONE_BG`, `TILE`, `BEVEL`, `GOLD`, `INK`, `DISPLAY` font stack, and `money()` if not already shared (`web/src/lib/money.ts` exists: keep it, don't duplicate) |
| `kit.css` | Keyframes (`sg-pop`, `sg-in`, `sg-float`, `sg-shake`, `sg-shrink`, `sg-meter`, `sg-blink`, `sg-flip`, `sg-glow-red`, `sg-glow-green`) and `.sg-key:active`; wrap motion in `@media (prefers-reduced-motion: no-preference)` |
| `Stage.tsx` | The stage panel (`lit` prop for the buzzing-open border). Uses `container-type: size` so content can size in `cqh` / `cqw` |
| `GoldButton.tsx` | The main action: Mantine `Button color="yellow.4" autoContrast`, Oswald uppercase |
| `Sheet.tsx` | In-screen dialog: centered (host) or bottom (phone); a full-cover close button behind the panel; `role="dialog"`, Escape closes |
| `PhoneScreen.tsx` | Top bar (`ROOM {code}`, my score), content, buzzer slot pinned to the bottom |
| `Wordmark.tsx`, `Meter.tsx`, `CountdownBar.tsx` | As in the kit. `CountdownBar` animates with CSS from the server's `deadlineAt` (pausable) |

Set the phone background and night color as the `body` background for the game routes.

### 3. Buzzer (web)

Rewrite `web/src/game/Buzzer.tsx` to the oblong red dome (`Buzzer` in `system/components.tsx` is the reference implementation):

- Same props. `BuzzerState` gains `pick` (the player in control on the board: bright red, slow breathing glow) and `listening` (listening for a spoken pick: green, like `answering`). `dim`, `lit`, `pick` and `listening` call `onBuzz`; `locked` is disabled; the rest only animate.
- **No visible text.** The accessible name stays **"Buzz"** in every state, so existing queries (`getByRole("button", { name: "Buzz" })`) keep working. The state words ("Get ready", "Too early", "Answer now", "You've answered this one") go in a visually hidden element referenced by `aria-describedby`.
- Default height 120 on phones; the host column passes 64. Keep `data-state`.
- `web/src/game/buzzerState.ts`: `buzzerState()` returns `pick` when `phase === "board"`, the user has control and nothing is paused or between screens, and `listening` while that user's voice pick is listening (pass it in, like `early`). `canBuzz()` is unchanged: a press in `pick` / `listening` is not a buzz and sends nothing to the server.

### 3b. Spoken picks through the buzzer (web)

The "🎤 Say it" button goes away on phones and on the host device ([gameplay interaction design](../../docs/product-docs/features/gameplay/interaction-design.md)).

- Turn `web/src/game/VoicePick.tsx` into a hook, `useVoicePick(board, onPick)`, that returns `{ listening, error, toggle }`. It keeps the existing recognition and matching (`web/src/lib/pickByVoice.ts`, `web/src/lib/speech.ts`) and the error texts ("That one's already been played.", "Didn't catch the category."). A heard pick still sends `select_clue` with no confirmation.
- `PlayerControls.tsx` and the host column: when the player is in control on the board, the buzzer's `onBuzz` calls `toggle()` instead of sending `buzz`. A second press while listening cancels. Listening stops when the phase leaves `board` or control moves.
- The host's space bar does the same when the host has control on the board.
- Phone copy: under the buzzer, "Tap a clue, or press and say it" (or "Listening… press again to cancel"); while listening, the green "Listening… Say a category and value, like “Opera for 600”" panel above it; errors end with "Press the buzzer to try again, or tap a clue." The host column shows errors only.

### 4. Board, tiles, host layout (web)

- `web/src/game/Board.tsx`: bevelled `boardBlue.9` cells, Oswald 700 values in `yellow.4` with a drop shadow, press-shrink only when tappable, played cells empty. Keep the existing grid, aria labels and `columns()`.
- `web/src/game/PlayerColumn.tsx`: tile treatment from the design system (gold ring + glow + gold PICKING / WAGERING chip, outlined HOST chip, `red.4` negatives, Oswald scores, the floating score delta on `answer_judged`). Keep the existing labels logic and aria labels.
- `web/src/game/HostLayout.tsx`: night background, existing grid and safe areas. The "Turn your phone sideways" overlay gets the new styling.

### 5. Host stages (web)

- `web/src/game/HostGame.tsx`, `DailyDoubleStage.tsx`, `FinalStage.tsx`: wrap in `Stage`; clue header line (category · value, speaker meter while reading); clue text Oswald 500 uppercase, sized by length in `cqh`/`cqw` (see `ClueText` in `board/clue-loop.tsx`); verdict lines; correct-response screen; DAILY DOUBLE / "Double Schmegettes!" / FINAL SCHMEGETTES pop-ins; Final reveal lines appearing one by one; paused veil over the stage only.
- The stage gets the lit gold border while `buzzing_open`.

### 6. Host inputs on the stage (web)

- `web/src/game/WagerPad.tsx`: add `layout: "phone" | "stage"` and `masked`. Stage layout: amount, hint, Min/Max and confirm on the left; keys on the right. Masked: dots, no key highlight (`.sg-key` omitted), hint says only "Out of range". Keep its existing range logic and tests.
- When the host has the Daily Double, render the pad **on the stage** (`DailyDoubleStage`), not in the player column. Same for the host's Final wager (masked) under the category.
- New `web/src/game/BlindKeypad.tsx`: A–Z, space, backspace, a dots-only field, **Submit**. No `<input>`/`<textarea>` and nothing focusable that opens a native keyboard. Keys have no pressed or hover state. Each change sends the same `answer_progress` drafts the phone field sends today (reuse the debounce in `FinalAnswerField`), and Submit sends `submit_answer` with `source: typed`. Max 200 characters.
- On the host device during `final_answer` (host is a finalist, not submitted), the stage shows the clue (smaller) with `BlindKeypad` under it. `FinalAnswerField` stays for phones only.
- A hardware keyboard on the host device: not handled in this ticket (open question in the handoff).

### 7. Phones and pages (web)

- `web/src/game/PlayerControls.tsx`, `PlayerGame.tsx`: `PhoneScreen` layout; headlines and copy from the gameplay and wagers interaction designs ("Listen…" with "Buzz when it lights up. Too early locks you out for a moment.", "BUZZ IN!" with the bar, "Say your answer" with the meter and transcript, the ✓/✗ verdict pop, "Look at the TV."). The phone's Daily Double and Final wager pads use the phone layout.
- `web/src/game/PickConfirm.tsx`: replace the Mantine `Modal` with `Sheet` (bottom on phones, centered on the host). Keep `usePickConfirm` and its auto-close rules.
- `web/src/game/MicPrompt.tsx`: restyle (mic card states: ask, ready with meter, blocked, unsupported). `VoicePick.tsx`: see 3b.
- `web/src/pages/Home.tsx`, `HostLobby.tsx`, `JoinCode.tsx`, `JoinRoom.tsx`: Home (wordmark, gold **Host a game**, 5-box code entry with Mantine `PinInput`), host lobby (code as five board-blue tiles, gold **Start**, players list rows, "Waiting for players…"), join name and "You're in, {name}." Keep every existing route, behavior and error string.

### 8. Docs

See "Docs to update".

## Key files

`web/src/main.tsx`, `web/package.json`, `bun.lock`, `web/src/ui/*` (new), `web/src/game/{Buzzer,Board,PlayerColumn,HostLayout,HostGame,DailyDoubleStage,FinalStage,WagerPad,BlindKeypad (new),FinalAnswerField,PickConfirm,PlayerControls,PlayerGame,MicPrompt,VoicePick}.tsx`, `web/src/pages/*.tsx`.

## Contracts preserved

No change to `shared/`. Every client message the host sends during Final (`answer_progress`, `submit_answer`, `submit_wager`) is unchanged; only the UI that produces them moves.

## Success criteria

- No request to a font CDN (check the Network tab and `grep -r googleapis web/`); headings render in Oswald.
- Every host screen fits with 6 contestants and the host playing at 667 × 320, 844 × 390, 956 × 440: the board, a clue, buzzing open, answering, correct response, DD wager on the stage, Final wager (masked) on the stage, Final answer with the blind keypad, the reveal.
- The buzzer shows no text in any state; its name is "Buzz"; its description says the state.
- On the host device during Final, no element that opens a native keyboard is focused or present for the answer; typed characters never appear on screen.
- All existing web tests pass with only label-related updates.

## Test plan

Write or update Vitest tests:

- `web/src/game/Buzzer.test.tsx`: every state (eight now) has no visible text, name "Buzz", the right description; tap matrix: `dim`, `lit`, `pick`, `listening` call `onBuzz`, `locked` is disabled.
- `web/src/game/buzzerState.test.ts` (new): `pick` only for the controller on the board; `listening` when passed; never while paused or between screens.
- `web/src/game/PlayerControls.test.tsx`: no "Say it" button; the controller's buzzer starts listening (mock the speech API) and a second press cancels; a heard pick sends `select_clue` without a confirmation; a non-controller's press on the board sends nothing; listening stops when control moves.
- `web/src/game/HostGame.test.tsx`: the host's buzzer and the space bar start a voice pick when the host has control.
- `web/src/game/BlindKeypad.test.tsx` (new): typing letters, space and backspace builds the draft; the field shows only dots; no `input`/`textarea` in the DOM; Submit disabled when empty; sends `answer_progress` and `submit_answer` (`source: typed`); 200-character cap.
- `web/src/game/WagerPad.test.tsx`: stage layout renders; masked shows dots and "Out of range" without the limit; existing range tests unchanged.
- `web/src/game/HostGame.test.tsx` (also): the host's DD wager pad renders on the stage, not in the column; during the host's Final answer the stage has the blind keypad and no text input.
- `web/src/pages/*.test.tsx`: update for the sheet and copy changes only.

```bash
mise run test:web -- src/game/Buzzer.test.tsx src/game/buzzerState.test.ts src/game/BlindKeypad.test.tsx src/game/WagerPad.test.tsx src/game/HostGame.test.tsx src/game/PlayerControls.test.tsx src/game/PlayerColumn.test.tsx src/game/Board.test.tsx
mise run test:web -- src/pages
```

Also run `bunx biome check web` and `bun run --cwd web typecheck`, and check the three host sizes by hand in the browser (devtools' fit check is the reference).

## Database migration plan

None.

## Logging requirements

None: no server code changes. The web app logs nothing new.

## Docs to update

- `docs/product-docs/architecture/design-system.md`: remove "not yet implemented" for what shipped; the Fonts section says they're self-hosted with Fontsource; the buzzer table's screen-reader column: the name is always "Buzz", the state words are its description.
- `docs/product-docs/features/gameplay/interaction-design.md`: the buzzer table's "Screen-reader label" column, the same way.
- `docs/system-docs/architecture/realtime-game-server.md`: nothing (spoken picks stay client-side and send `select_clue`).
- `docs/system-docs/engineering/stack.md`: add Fontsource to the component library row (fonts self-hosted, no font CDN).

## Branch

`new-feature/design-pass-restyle-impl`, from and into `daily/2026-11-09`. Implementation PR title: `[New Feature] design-pass-restyle: …`.
