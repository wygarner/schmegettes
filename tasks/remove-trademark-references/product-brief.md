---
jira-type: enhancement
jira-title: "Remove trademark references: rename rounds to Double/Final Schmegettes"
---
**Task Type:** Enhancement (changes the round name players see in gameplay; no new capability)

**Problem:** The repo names the TV quiz show Schmegettes resembles in player-facing copy ("Double Jeopardy!" on the TV and phones), the README, agent instructions, docs, and code comments. That's a trademark risk, and it makes Schmegettes read like a copy rather than its own game.

**Outcomes:**
- No player ever sees the show's name. The rounds are Single, **Double Schmegettes**, and **Final Schmegettes**.
- No file in the repo mentions the show by name (`git grep -i jeopardy` returns only the external dataset URL, see below).
- The trademark guardrail for marketing and pricing copy stays, reworded without the name.

**Player flow:** Durable docs are already updated: [product overview](../../docs/product-docs/architecture/product-overview.md) (new "Our own names" principle), [gameplay feature brief](../../docs/product-docs/features/gameplay/feature-brief.md), [gameplay interaction design](../../docs/product-docs/features/gameplay/interaction-design.md), [game-history feature brief](../../docs/product-docs/features/game-history/feature-brief.md).

1. **Round interstitial.** When the Single board is done, the TV shows **"Double Schmegettes!"** for 3 s, then the Double board. Phones show the same text during that 3 s. Timing, layout, and behavior don't change; only the words do.
2. **Final round** (feature 2, not built yet) is named **Final Schmegettes** in every doc.
3. **Nothing else changes for players.** Phase names in `shared/` (`final_category`, `final_wager`, …) never used the show's name, so no contract change.

**Inventory on `daily/2026-11-02`** (replace as shown):

| File | Change |
|---|---|
| `web/src/game/HostGame.tsx:90`, `web/src/game/PlayerControls.tsx:89,94` | "Double Jeopardy!" → "Double Schmegettes!" |
| `web/src/game/PlayerControls.test.tsx:153` | Expect "Double Schmegettes!" |
| `web/src/lib/room.ts:53` | Comment: "Double Schmegettes!" |
| `game/internal/play/game.go:250`, `game/internal/play/game_test.go:314`, `game/internal/room/game_test.go:109` | Comments: "Double Schmegettes" |
| `README.md:3` | "A multiplayer quiz-show party game: …"; drop the "(not affiliated with …)" sentence |
| `.claude/CLAUDE.md:3`, `docs/system-docs/engineering/stack.md:9` | "A multiplayer quiz-show party game"; drop the weekend.com link |
| `docs/system-docs/engineering/stack.md:44` | "the prototype's clue dataset TSVs" |
| `.claude/commands/marketing.md:27` | Reword: "Never name or imitate the TV quiz show Schmegettes resembles (its name, logo, music, or catchphrases) as branding, in ads, …" (keep the rest of the rule) |
| `.claude/commands/revenue.md:27` | "Never name or imitate the TV quiz show Schmegettes resembles in pricing pages, plan names, or offers (see the trademark rule in `/marketing`)." |
| `worker/src/schmegettes_worker/clue_import.py:1` | Docstring: "Parsing for the clue dataset season TSVs (URL in `CLUE_DATASET_BASE_URL`)." |
| `supabase/migrations/20261026000000_init.sql:55` | Comment: "imported by the worker from the clue dataset TSVs." Comment-only edit of an applied migration; see Risks |
| `worker/.env.example:8` | **Keep.** It's the dataset's real URL; it changes only when the GitHub repo is renamed |

**In-flight work:** `tasks/gameplay-polish/product-brief.md` and `task-brief.md` (on `enhancement/gameplay-polish`, not yet on the daily branch) say "Double Jeopardy!". **This task owns that cleanup.** gameplay-polish stays as it is. Before opening the implementation PR, merge the daily branch in; if the gameplay-polish task folder (`tasks/gameplay-polish*/`) is there by then, change its mentions to "Double Schmegettes!" in this PR. Any other new mentions gameplay-polish brings in (code or docs) are also this task's to fix. If gameplay-polish lands after this PR, the grep check below is re-run once it merges and any leftovers are fixed in a follow-up commit to this task.

**Success Criteria:**
- `git grep -n -i jeopardy` on the daily branch after merge returns only `worker/.env.example`.
- The round interstitial reads "Double Schmegettes!" on the TV and on phones; `PlayerControls.test.tsx` passes.
- `/marketing` and `/revenue` still forbid using the show's name, logo, music, and catchphrases.

**Out of scope:**
- Renaming the GitHub repo `wygarner/jeopardy_clue_dataset` or the prototype repo
- Rewriting git history or old PR titles and descriptions
- Clue content itself (clue text from the dataset may mention the show; that's data, not our copy)
- Any change to `shared/` contracts or phase names
