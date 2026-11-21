---
task-type: enhancement
task-title: "Host lobby: QR code, join URL up top, host renames players, simpler options"
---
**Task Type:** Enhancement. Changes to the existing host lobby and its game options sheet, from QA on 2026-11-21.

**Product docs:** [lobby/feature-brief.md](../../docs/product-docs/features/lobby/feature-brief.md) and [lobby/interaction-design.md](../../docs/product-docs/features/lobby/interaction-design.md) (PR #267), plus the "Quick picks" wording in [gameplay](../../docs/product-docs/features/gameplay/feature-brief.md). Remove each "Not yet implemented (task `lobby-qa-polish`)" note when it ships.

**Problem:** In QA the host lobby carried things the room doesn't need and lacked what it does. "Hosted by Wyatt" took the top line while the join URL sat in the middle. The options line under the code read like a rule list. Joining meant typing a code off the TV. And when someone joined as "Poopface", the host couldn't fix it. In the options sheet, the difficulty descriptions added noise, and "Quick picks" didn't say what it does.

**Outcomes:**
- A guest joins by pointing their camera at the TV: the QR code opens this room's join flow with no typing.
- The top line tells the room where to go: "Join at schmegettes.app/join" replaces "Hosted by …".
- The lobby shows nothing about the options; the room sees the code, the QR, and the players.
- The host can rename any player from the player menu until Start, and the player's phone follows.
- The options sheet: Difficulty has no description line; **Quick picks** becomes **Default spoken clue value: ( Ask | Lowest left )**, with the same behavior.

**Player flow:**
- **Host opens the lobby:** top line "SCHMEGETTES … Join at schmegettes.app/join". Center: QR code left of the code tiles. Nothing under the code. Players tab folded on the right, as today.
- **Guest scans the QR:** the phone opens `{site}/join/K7RXM` and goes straight to the microphone step, then the name. On staging, the QR opens staging.
- **Host renames a player:** opens the player menu, taps ✎ on "Poopface", types "Dan", **Save**. The TV list and Dan's phone ("You're in, Dan") update at once. Dan can edit it again; the latest save wins. Dan's device still suggests "Poopface" next time: a rename lasts for this room only.
- **Host renames themself:** the player menu's footer "Hosted by Wyatt ✎", or their own row's ✎ when they've joined. One name, both places.
- **Options sheet:** Seasons, Difficulty (no line under it), Double Schmegettes, Default spoken clue value (Ask | Lowest left, "When a player says just the category"). A device that saved Quick picks on opens as Lowest left.
- **Edge cases** (full list in the interaction design): Start while the rename sheet is open closes it without saving; renaming to a name already used gets "Name 2"; renaming a disconnected player shows on their phone when they reconnect; a QR scanned after Start or for a closed room shows the same errors as a typed code; the resume lobby gets the QR and top line but no ✎ (a resumed game keeps its names); a device that can't run the narrator shows its notice under the code.

**Success Criteria:**
- At 844 × 390 and 667 × 320, the lobby shows the top-line URL, the QR and the code with no scrolling, folded and open. The QR is at least 96 px.
- An iPhone camera scanning the QR off a mirrored TV at 3 m opens the room's microphone step (checked once by hand on staging).
- The host renames a connected player and a disconnected one; both phones show the new name (the disconnected one on reconnect), and Start locks names.
- A non-host can't rename anyone else: the server refuses it.
- No options appear anywhere in the lobby; the sheet has no difficulty descriptions and the renamed clue-value control.
- `quickPicks` stays the saved and contract name; only the label and control change.

**Out of scope:** Renaming after Start or in a resume lobby; kicking a player; a QR code on phones; changing what the clue-value setting does; an options summary anywhere else.
