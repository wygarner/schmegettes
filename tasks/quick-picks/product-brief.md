---
jira-type: enhancement
jira-title: "Quick picks: say just the category to pick its lowest clue"
---
**Task Type:** Enhancement. A new game option that changes the existing spoken pick.

**Product docs:** `docs/product-docs/features/lobby/feature-brief.md` ("Game options") and `interaction-design.md` (options sheet, edge cases); `features/gameplay/feature-brief.md` ("The board and control") and `interaction-design.md` (phone listening text, edge cases).

**Problem:** Prod QA (2026-11-19): players often say just the category ("Opera"). Unless one clue is left, the game answers "Didn't catch the amount." and the player has to press and speak again. Some groups want the category alone to be enough.

**Outcomes:** A host can turn on **Quick picks**. Then a category alone picks its lowest clue left, with no retry. Off, nothing changes.

**Player flow:**
- **Lobby:** the options sheet gets a third setting, **Quick picks**, a switch, **off by default**. The line beside it: "Say the category and amount" (off) / "Just the category picks its lowest clue" (on). On, the summary under the code adds "Quick picks". Same rules as the other options: host device only, lobby only, locks at Start, remembered on the device, kept by Rematch, kept by a resumed game.
- **In the game, Quick picks on:** the controller presses their buzzer and says "Opera". Opera 200 is done; 400, 600 and 800 are left → **Opera 400** is picked at once (spoken picks have no confirmation), and the normal pick reveal shows "OPERA / $400". In Double, the lowest left of 400–1,600.
- The lowest clue left may be the Daily Double; it's picked like any other.
- **An amount that was heard always wins.** "Opera for 600" with 600 done → "That one's already been played."; an amount that isn't on the board → "Didn't catch the amount." Neither falls back to the lowest.
- A pick is decided when the player stops speaking, as today. A category heard with no amount by then counts as category-only.
- The phone's listening panel says "Listening… Say a category, like “Opera”, or a category and value". The host's spoken pick works the same.
- **Quick picks off:** today's behavior ("Didn't catch the amount." unless one clue is left).
- Taps are unchanged in both modes (confirmation sheet).

**Success Criteria:**
- Off (default): "Opera" with several clues left → "Didn't catch the amount.", nothing picked.
- On: "Opera" → the lowest remaining Opera clue is picked, in Single and Double, including when the lowest left is the Daily Double.
- On: "Opera for 600" picks 600; with 600 done it's refused, not replaced.
- The option persists across a new room on the same device, a rematch and a resume; it can't change after Start (the server rejects it).
- The summary line shows "Quick picks" only when on.

**Out of scope:** picking the highest clue, or a random one; a confirmation for spoken picks; a category-only rule for tapping; changing how categories are matched.
