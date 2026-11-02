---
jira-type: enhancement
jira-title: "Remove trademark references: rename rounds to Double/Final Schmegettes"
---
# Task spec: remove-trademark-references

Product brief: [product-brief.md](./product-brief.md). Durable product docs are already updated (PR #33).

Goal: after this task, `git grep -n -i jeopardy` on the daily branch returns only `worker/.env.example`. The round interstitial reads **"Double Schmegettes!"** on the TV and on phones. Copy and comments change. Behavior, timing and contracts don't.

## Subtasks

Ordered narrow → wide. There's no `shared/` work.

### 1. `supabase/`: migration comment

- `supabase/migrations/20261026000000_init.sql:55`
  `-- Clue catalog, imported by the worker from the jeopardy_clue_dataset TSVs.` → `-- Clue catalog, imported by the worker from the clue dataset TSVs.`
- Comment-only. The Supabase CLI tracks applied migrations by version, not by checksum, so editing an applied file's comment doesn't re-run it or block `db push`. Don't make any other change to this file. No new migration.

### 2. `game/`: comments only

- `game/internal/play/game.go:250`: `// lowestScore picks Double Schmegettes' first controller: lowest score, join order on ties.`
- `game/internal/play/game_test.go:314`: `… The next deadline starts Double Schmegettes.`
- `game/internal/room/game_test.go:109`: `// "Double Schmegettes!" interstitial`

### 3. `worker/`: docstring only

- `worker/src/schmegettes_worker/clue_import.py:1`: `"""Parsing for the clue dataset season TSVs (base URL in CLUE_DATASET_BASE_URL).` Keep the rest of the docstring.
- `worker/.env.example:8`: **leave as-is.** It's the dataset's real URL and changes only when the GitHub repo is renamed (out of scope).

### 4. `web/`: player-facing copy

- `web/src/game/HostGame.tsx:90`: `<Title order={1}>Double Schmegettes!</Title>`
- `web/src/game/PlayerControls.tsx:89` and `:94`: `Double Schmegettes!`. Optional: pull the string into one local constant (`const ROUND_INTRO = "Double Schmegettes!"`) in `PlayerControls.tsx` so both branches share it. Keep the diff small; don't add a cross-file constants module.
- `web/src/game/PlayerControls.test.tsx:153`: `expect(screen.getByText("Double Schmegettes!"))…`
- `web/src/lib/room.ts:53`: comment `("Double Schmegettes!")`
- Layout check: the compact phone `Status` is now 19 characters long instead of 16. Check it doesn't wrap or truncate badly at 320 px width. If it does, that's a product question; flag it in the PR rather than changing the copy.

### 5. Repo docs and agent instructions

- `README.md:3`: `A multiplayer quiz-show party game: share a room code, buzz from your phone, answer by typing or speaking.` Drop the "(Schmegettes is not affiliated with …)" sentence.
- `.claude/CLAUDE.md:3`: `A multiplayer quiz-show party game. Packages: …` (rest unchanged).
- `docs/system-docs/engineering/stack.md:9`: `Schmegettes is a multiplayer quiz-show party game.` Drop "modeled on the Weekend Games version (weekend.com/games/jeopardy)". Keep the prototype sentence that follows.
- `docs/system-docs/engineering/stack.md:44`: `… import clue datasets (the prototype's clue dataset TSVs), …`
- `.claude/commands/marketing.md:27`: replace with:
  `**Trademark rule:** Never name or imitate the TV quiz show Schmegettes resembles: not its name, logo, music, or show-specific phrases, whether as branding, in ads, app-store titles, or domains. Describe the format generically ("game-show trivia", "answer-and-question trivia"). Flag any request that would cross this line.`
- `.claude/commands/revenue.md:27`: `Never name or imitate the TV quiz show Schmegettes resembles in pricing pages, plan names, or offers (see the trademark rule in /marketing).` Keep the existing backticks around `/marketing`.

### 6. In-flight gameplay-polish docs (this task owns them)

`tasks/gameplay-polish*/product-brief.md` and `task-brief.md` live on `enhancement/gameplay-polish` and aren't on the daily branch yet.

- Before opening the implementation PR, merge `origin/daily/2026-11-02` into the task branch, then re-run `git grep -n -i jeopardy`.
- If the gameplay-polish folder (or any code it brought in) is there, replace "Double Jeopardy" → "Double Schmegettes" and "Final Jeopardy" → "Final Schmegettes" in it in this PR.
- If gameplay-polish hasn't landed, note that in the PR description. After it merges, re-run the grep and fix any leftovers in a follow-up branch cut from the daily branch.

## Key files

`supabase/migrations/20261026000000_init.sql`, `game/internal/play/game.go`, `game/internal/play/game_test.go`, `game/internal/room/game_test.go`, `worker/src/schmegettes_worker/clue_import.py`, `web/src/game/HostGame.tsx`, `web/src/game/PlayerControls.tsx`, `web/src/game/PlayerControls.test.tsx`, `web/src/lib/room.ts`, `README.md`, `.claude/CLAUDE.md`, `.claude/commands/marketing.md`, `.claude/commands/revenue.md`, `docs/system-docs/engineering/stack.md`.

## Contracts preserved

No change to `shared/`, WebSocket messages, REST endpoints, phase names, or the database schema. The `roundIntro` state and its 3 s timing are unchanged. Only the rendered string changes. No `mise run gen`.

## Success criteria

- `git grep -n -i jeopardy` returns only `worker/.env.example:8` (plus gameplay-polish files only if that branch hasn't merged yet, noted in the PR).
- TV and phone show "Double Schmegettes!" during the round interstitial.
- `/marketing` and `/revenue` still forbid using the show's name, logo, music, and catchphrases, without naming it.
- Targeted tests below pass; no behavior change.

## Test plan

- web (copy changed, test updated):
  `mise run test:web -- src/game/PlayerControls.test.tsx`
  `mise run test:web -- src/game/HostGame.test.tsx`
  Optional: add one assertion in `HostGame.test.tsx` that the round-intro state renders "Double Schmegettes!", if a round-intro fixture already exists there. Don't build a new fixture just for this.
- game (comments only; confirms the files still compile):
  `mise run test:game -- ./internal/play/... ./internal/room/...`
- worker (docstring only):
  `mise run test:worker -- tests/test_clue_import.py`
- supabase: comment-only, so no `db:test` needed.
- Final check: `git grep -n -i jeopardy`.

## Database migration plan

None. Only a comment in an existing migration changes (see subtask 1).

## Logging requirements

None. No log events or failure paths change.

## Docs to update

All covered in subtask 5. Product docs were already done in PR #33.

## Branch
`enhancement/remove-trademark-references-impl`, from and into `daily/2026-11-02`. No Jira ticket: Jira is not configured (`.github/jira.json` IDs are `REPLACE_ME`, no secrets).
