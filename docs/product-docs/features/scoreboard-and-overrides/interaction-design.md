# Scoreboard, Rematch, and Host Overrides: Interaction Design

> Status: built (`web/src/game/OverrideSheet.tsx`, `Scoreboard.tsx`; `game/internal/play/override.go`). The server messages are in [realtime-game-server.md](../../../system-docs/architecture/realtime-game-server.md#overrides). Reference design: [results/scoreboard-and-history](../../../../devtools/src/designs/results/scoreboard-and-history.tsx).

## Host override

### States

```text
correct response (6 s) ──tap Override──▶ reviewing (clock paused) ──Keep──▶ correct response (time left)
                                               │
                                               └──Change──▶ verdict flipped, labeled ──▶ correct response (time left) ──▶ board
```

Final reveal: the same, from that finalist's reveal step, back to the step it paused on.

### Screens

**Correct response, before** (host device / TV):

```text
│              VOLCANOES · $400                        │
│                                                      │
│    ✗ Bob: crack a toe a   −$400   [ Override ]       │
│                                                      │
│               CORRECT RESPONSE                       │
│                   KRAKATOA                           │
│ ──────────────────────────────── (6 s)               │
```

**Override** is small and outlined, next to the verdict line. When the clue had more than one answer, each verdict line has its own.

**Review** (a centered sheet on the host device, so the room sees it too):

```text
┌──────────────────────────────────────────┐
│ HOST OVERRIDE · THE CLOCK IS PAUSED      │
│ Bob said            “crack a toe a”      │
│ Correct response    Krakatoa             │
│ Marking it correct gives Bob +$400       │
│ instead of −$400 ($400 → $1,200)         │
│ and gives Bob control.                   │
│                                          │
│   [ Keep ✗ ]          [ Mark correct ✓ ] │
└──────────────────────────────────────────┘
```

- The sheet states the score change and any control change before the host commits.
- **Keep** or a tap outside closes it. **Mark correct** / **Mark incorrect** applies it. Only the first press counts.

**After:**

```text
│  [HOST OVERRIDE] ✓ Bob: crack a toe a   +$400        │
```

- The chip is gold. Bob's tile floats "+$800" and takes the PICKING ring if he now has control.
- Bob's phone: "HOST OVERRIDE", a big green ✓, "+$400", "Wyatt changed your answer to correct." While the host is reviewing, it says "Wyatt is reviewing your answer…".
- Other phones: unchanged ("Look at the TV.").

### Final reveal

On a finalist's reveal, once the ✓ / ✗ line shows, the host device shows **Override** next to it. The review sheet shows the typed response, the wager and the new score. On **Change**, the wager and score lines that follow use the new verdict, and the score line says HOST OVERRIDE.

## End-of-game scoreboard

**TV (host device):**

```text
┌───────────────────────────────────────────────────┬───────────────────┐
│ FINAL SCORES               Nov 9 · 8:14 PM · 41 min│  Alice   $2,900   │
│ ┏━━━━━━━━━━━━━━━━┓  1st  Alice          $2,900    │  Bob       $800   │
│ ┃       🏆       ┃  2nd  Bob              $800    │  Dana     −$400   │
│ ┃     WINNER     ┃  3rd  Wyatt           −$200    │  Wyatt    −$200   │
│ ┃     Alice      ┃  4th  Dana            −$400    │                   │
│ ┃     $2,900     ┃                                │ ┌───────────────┐ │
│ ┗━━━━━━━━━━━━━━━━┛                                │ │ (red buzzer)  │ │
│ Saved to everyone's game history      [ Rematch ] │ └───────────────┘ │
└───────────────────────────────────────────────────┴───────────────────┘
```

- The winner card pops in; the ranked rows slide in one after another, about 140 ms apart.
- Placement colors: gold 1st, silver 2nd, bronze 3rd, then plain.
- A tie for 1st: "TIED FOR 1ST", both names ("Alice & Bob"), the shared score.
- Six players fit at 667 × 320 (rows tighten).

**Phone:**

```text
ROOM K7RXM                         $800
          YOU FINISHED
              2nd
              $800
 ┌──────────────────────────────────┐
 │ 1st  Alice                $2,900 │
 │ 2nd  Bob  (highlighted)     $800 │
 │ 3rd  Wyatt                 −$200 │
 │ 4th  Dana                  −$400 │
 └──────────────────────────────────┘
 Waiting for Wyatt: stay for a rematch, or leave.
             [ Leave ]
 ┌──────────────────────────────────┐
 │           (red buzzer)           │
 └──────────────────────────────────┘
```

## Rematch

1. The host presses **Rematch** (gold; shows a spinner; a second press does nothing).
2. The TV goes to the lobby: same code, "Rematch · Hosted by Wyatt", "Fresh board: none of tonight's clues come back.", the players still in the room at $0, **Start**.
3. Phones still in the room show the lobby's "You're in" screen with a **REMATCH** label.
4. From here it's the normal [lobby](../lobby/interaction-design.md): new players join by code, **Start** builds a fresh board.

## Edge cases

| Situation | Behavior |
|---|---|
| Host taps Override on a clue where nobody buzzed | Not possible: there's no verdict line, so no Override |
| A buzz that disconnected before answering | Never judged, so not listed and not overridable |
| "No answer heard" (silence for 9 s) | Overridable, like any judged answer. The sheet says "No answer heard" |
| Host overrides their own answer | Allowed; labeled HOST OVERRIDE like any other |
| Override to correct on a clue someone else then answered correctly | Both are correct and both score; control goes to the later correct answer |
| Override a correct answer to incorrect | −value in place of +value; control goes to the latest remaining correct answer on the clue, or back to who had it when the clue was picked |
| Daily Double override | ± the wager; control doesn't move |
| Host device disconnects while the review is open | The game pauses as usual. On return the sheet is closed and the correct-response timer resumes with its time left |
| The overridden player is disconnected | The score changes anyway; their phone shows the new score when it reconnects |
| Rematch pressed twice | Only the first counts |
| A player presses Leave, then the host presses Rematch | That player isn't in the new lobby; they can rejoin with the code before Start |
| Final override after the reveal moved to the next finalist | Not possible in v1 |
| Top score tied after an override | Both are winners: TIED FOR 1ST |
