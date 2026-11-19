---
jira-type: enhancement
jira-title: "Lobby tidy-up from prod QA"
---
**Task Type:** Enhancement. Changes to the existing host lobby, game options and narrator default; no new capability.

**Product docs:** `docs/product-docs/features/lobby/feature-brief.md` and `interaction-design.md`; `features/gameplay/feature-brief.md` (narrator default, fixed 9 s windows, host buzzer from Start) and `interaction-design.md`; `features/rejoin-games/interaction-design.md` (resume lobby).

**Problem:** Prod QA (2026-11-19) found the TV lobby crowded on an iPhone in landscape. The player column takes a quarter of the width before anyone has joined. The bottom row has long labels ("Join the game", "🔊 Kristin", "⚙ Options") and a hint that's wrong ("Need at least 1 player" next to a disabled Start). The Timers option adds a choice nobody needs. QA also prefers Norman as the narrator out of the box.

**Outcomes:**
- The lobby's stage uses the full width; the code and join line are bigger and easier to read from the couch.
- The bottom row is short: **Join**/**Leave**, two icon buttons, **Start**.
- Every game plays with 9 s to buzz in and 9 s to answer.
- A new host device narrates in Norman.

**Player flow:**
- **Player list folded by default.** The lobby opens with the player list folded into a ~40 px tab on the right edge: "Players" and "3/6". A tap opens the column (as today, ~28% width); **›** or a tap on its header folds it. It opens folded every time (new room, reload, rematch, resume lobby); the choice isn't remembered. While folded, a join updates the count and flashes the tab gold once (0.6 s; just the count with reduced motion). A reconnecting player changes nothing on the tab.
- **No host buzzer in the lobby.** After **Join**, the host is added to the list but no buzzer renders on the host device until Start, when the player column returns with the buzzer at its bottom. Phones keep their dim lobby buzzer.
- **Labels.** "Join the game" → **Join**, "Leave the game" → **Leave** (also in the resume lobby). "Room is full" under a disabled Join is unchanged.
- **Start hint removed.** With nobody joined, Start is disabled with no text. The minimum stays 1 contestant (#146). The "Couldn't download the voice" + **Try again** message stays.
- **Icon-only buttons.** 🔊 opens the voice picker; ⚙ opens game options. No visible text. Accessible names and hover tooltips: "Narrator voice: Norman" and "Game options". Tap targets at least 44 × 44 px. While a voice downloads, a progress ring fills around 🔊; **Start** keeps "Getting Norman ready… 40%".
- **Timers removed.** The options sheet has Seasons and Double Schmegettes only. Every new game, rematch and room uses 9 s / 9 s. A device or room that saved Relaxed or Fast plays with 9 s / 9 s, with no message; the summary line under the code never mentions timers. A game already in progress, or resumed later, keeps the times it started with.
- **Norman by default.** The voice list puts Norman first. A host device where the host never picked a voice (including one using Kristin only because she was the old default) gets Norman, downloading ~63 MB once, with Start waiting as for any voice change. A device where the host picked Kristin or John keeps it. If the device can't tell a pick from the old default, treat it as not picked.

**Success Criteria:**
- At 844 × 390 and 667 × 320, the lobby opens folded with the code centered on the full-width stage; no scrolling.
- Tapping the tab opens the list; tapping the header folds it; reload opens folded.
- With the list folded, a phone joining updates the tab's count and flashes it; a phone leaving updates the count.
- After Join, the host is in the list, and no buzzer is on the host device until Start; at Start the host's buzzer is in the player column and works.
- The bottom row shows **Join**/**Leave**, 🔊, ⚙ and **Start**, with no "Need at least…" text in any state. VoiceOver reads "Narrator voice: Norman" and "Game options".
- The options sheet has no Timers control; a device with saved Fast timers starts a game with 9 s buzz and 9 s answer windows.
- A fresh host device (cleared storage) downloads and uses Norman. A device where Kristin was explicitly picked keeps Kristin.

**Out of scope:** remembering whether the list is open; folding the column during the game; a timer setting anywhere else; changing the 1-contestant minimum; the voices themselves.
