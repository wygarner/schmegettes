---
jira-type: new-feature
jira-title: "Design pass 1/3: new look, red buzzer, self-hosted fonts, host inputs on the stage"
---
**Task Type:** New Feature. Part 1 of the design pass, split into three tickets at the human's request (2: [scoreboard, Rematch, overrides](../design-pass-endgame/product-brief.md); 3: [My games](../design-pass-history/product-brief.md)). This part restyles screens that already work and changes how the host enters Final answers.

**Problem:** The game plays end to end, but it looks like default Mantine components, not a quiz show: the theme's fonts are never loaded (headings fall back to Impact), the buzzer is a flat button labeled BUZZ, and the board, tiles and stages have no depth. On the host's mirrored iPhone, the Daily Double number pad crowds the player column, and the host's Final answer leaks to the room through the mirrored iOS keyboard.

**Outcomes:**

- Every existing screen (Home, host lobby, join, the clue loop, Daily Double, Final) uses the [design system](../../docs/product-docs/architecture/design-system.md): Oswald and Inter **self-hosted** (bundled with the app, no request to Google Fonts), the night and stage colors, bevelled board and tiles, gold main actions, sheets, and the motion it defines.
- The buzzer is an oblong red dome the full width of its container, in a dark rim, with **no lettering**, in every view. State shows in its color and light; screen readers get the words.
- There is no "Say it" button: on the board, the controller's buzzer is how they say a pick.
- The host's Daily Double and Final wager pads sit on the stage. The host's Final answer is typed on a blind keypad, so the TV shows only its length.

**Player flow:** rules in [design system](../../docs/product-docs/architecture/design-system.md), [gameplay](../../docs/product-docs/features/gameplay/interaction-design.md), [wagers](../../docs/product-docs/features/wagers/interaction-design.md) and [lobby](../../docs/product-docs/features/lobby/interaction-design.md). Visual reference: `devtools/src/designs/` system/components, lobby/host-and-join, board/clue-loop, final/final-schmegettes (`mise run dev:devtools`).

- *Buzzer:* the six states and tap rules of today (`idle`, `dim`, `lit`, `early`, `answering`, `locked`), plus two for the player in control on the board: `pick` (bright red, breathing slowly) and `listening` (green). Unlit red, a faint red ring while the clue is read, bright red pulsing when open, dark and shaking for the 250 ms early lockout, green after a won buzz, grey when locked. 120 px tall on phones, 64 px in the host column. The phone text around it carries the meaning ("Buzz when it lights up", "Say your answer", "You've answered this one", "Tap a clue, or press and say it").
- *Spoken picks through the buzzer:* the "🎤 Say it" button is gone. The player in control presses their buzzer (the host: their buzzer or the space bar) and says "Science for 400"; pressing it again while it listens cancels. A spoken pick still needs no confirmation; a tapped one still does.
- *Host inputs on the stage:* Daily Double wager pad (public); Final wager pad masked, keys that never highlight; Final answer on a blind A–Z keypad under the clue (the clue shrinks), masked field, **Submit**. The iOS keyboard is never opened on the host device during Final.
- *Phone pick confirmation:* a bottom sheet; the host device's is a centered sheet.

**Success Criteria:**

- Oswald and Inter are bundled and loaded; no screen falls back to Impact; no request goes to a font CDN.
- Every host screen, with 6 contestants and the host playing, fits without scrolling at 667 × 320, 844 × 390 and 956 × 440, including the stage wager pads and the blind keypad.
- The buzzer has no visible text in any state, keeps the existing buzzing rules, and exposes its state to screen readers.
- No "Say it" button anywhere; a spoken pick starts from the controller's buzzer (or the host's space bar), and pressing it again cancels.
- During the host's Final answer no on-screen keyboard opens on the host device, and nothing on the host screen reveals a typed character.

**Out of scope:** the end-of-game scoreboard, Rematch, overrides (ticket 2); My games (ticket 3); sound; any change to timing, scoring, judging, or the contracts.
