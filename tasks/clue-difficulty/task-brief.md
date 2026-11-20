---
jira-type: enhancement
jira-title: "Easy, Medium and Hard clue difficulty, with Any as default"
---
# Task spec: clue-difficulty

Product brief: [product-brief.md](./product-brief.md). Product rules (the source of truth for behaviour):
- `docs/product-docs/features/clue-catalog/feature-brief.md` ("Difficulty", "Rating (admin)") and `interaction-design.md` ("Rating the catalog")
- `docs/product-docs/features/game-history/feature-brief.md` ("Building a fresh board")
- `docs/product-docs/features/lobby/feature-brief.md` ("Game options") and `interaction-design.md`

## Approach

Each category that can reach a board gets a numeric **score (1–100)** from Claude. The first complete rating run sets fixed **cut points**: the scores that split board categories into thirds, and Finals into thirds. Labels (`easy | medium | hard`) come from those cut points and never change. Later runs score only new categories and label them with the same cut points. Scoring and labelling are separate steps, so the scale always comes from the whole catalog, never from a partial run.

The host's choice lives on the room and is copied onto the game at Start, like `quick_picks`. `null` means **Any**. Board building happens entirely in SQL (`start_game` → `build_board_round`): with Any, the ranking is identical to today's. **`game/` doesn't change**: it calls `start_game` with the same signature, and resume and rematch need nothing new.

**Model and API (worker).** Use `claude-opus-5-5` through the **Message Batches API** (50% price, asynchronous). Use structured output (`output_config.format`, a JSON schema `{score: integer 1–100}`), `output_config.effort: "low"`, `max_tokens` 2048. Omit `thinking`: it's always on for this model and can't be disabled. Batch requests can't carry `fallbacks`, so a `refusal` counts as **failed** and the category stays unrated. The model comes from an env var `DIFFICULTY_MODEL` (default `claude-opus-5-5`), so a cheaper model can be tried without a code change.
- **Estimated cost:** about 550 input and 300 output tokens per category. At batch rates ($2 / $10 per million tokens) the full catalog (about 90k categories) comes to roughly **$250–500**.
- **The pilot comes first:** 500 categories, at about $2–3. Its measured cost is reported to Wyatt and approved before the full run (Subtask 6).

## Subtasks

### 1. `shared/`: contracts (narrow)

- **`shared/schemas/domain.schema.json`:** add `Difficulty`: `{"type": "string", "enum": ["easy", "medium", "hard"]}`, described as mirroring `public.difficulty`.
- **`shared/openapi.yaml`:**
  - `PATCH /v1/rooms/{roomId}` body: add `difficulty: { oneOf: [{ $ref: Difficulty }, { type: "null" }] }`, written the way `seasons` handles null. An absent key leaves it unchanged; `null` sets Any.
  - `Room`: add the same field, and add it to `required`.
- Run `mise run gen` and commit the generated output (TS, Go and Python contracts).
- **Contract change:** additive. Old web clients don't send the field, and the api answers with it included.

### 2. `supabase/`: migration

`supabase migration new clue_difficulty` creates `supabase/migrations/{timestamp}_clue_difficulty.sql`.

- `create type public.difficulty as enum ('easy', 'medium', 'hard');`
- **New table `public.category_difficulty`**, one row per rated category:
  - `category_key text primary key`
  - `kind text not null check (kind in ('board', 'final'))`
  - `score smallint check (score between 1 and 100)`: null while a request is pending or after a failure
  - `difficulty public.difficulty`: null until labelled
  - `model text`, `rated_at timestamptz`, `batch_id text`, `failures smallint not null default 0`

  The worker writes it on the owner connection only.
- **New table `public.difficulty_scale`**, one row per kind:
  - `kind text primary key check (kind in ('board', 'final'))`
  - `easy_max smallint not null`, `medium_max smallint not null`
  - `set_at timestamptz not null default now()`, `categories integer not null`: how many categories the scale was cut from

  Rows are written once and never updated.
- **RLS:** enable it on both tables.
  - `create policy engine_read on public.category_difficulty for select to game_engine using (true);`
  - `grant select on public.category_difficulty to game_engine;`
  - `revoke all on` both tables `from anon, authenticated`.
  - `difficulty_scale` gets no policy and no grants: only the owner (worker) reads it.
- `alter table public.rooms add column difficulty public.difficulty;` and the same on `public.games`. Null means Any, which is what every existing room and game was.
- **`set_room_options`:** drop it and recreate it with two more defaulted params, `set_difficulty boolean default false` and `new_difficulty public.difficulty default null`. Copy the body from `20261119234826_quick_picks.sql` and add `difficulty = case when set_difficulty then new_difficulty else difficulty end`. Keep the revoke and grant pattern for the new signature.
- **`start_game`:** copy the body from `20261119234826_quick_picks.sql`. Copy `room.difficulty` onto `games`, and pass it to each `build_board_round` call.
- **`build_board_round`:** add `difficulty public.difficulty default null`, by dropping and recreating it. Mirror the grants in `20261026000000_init.sql`: revoke from `public, anon, authenticated`, and grant execute to `game_engine`. Body: as in `20261118210000_five_categories.sql`, plus:
  - `categories` left-joins `public.category_difficulty d using (category_key)`. A category's level is `coalesce(d.difficulty, 'medium')`: unrated plays as Medium.
  - Compute `tier`: 0 when `difficulty is null` or the levels match; 1 when they're adjacent (easy↔medium, medium↔hard); 2 otherwise.
  - Ranking: `order by case when coalesce(seen.seers, 0) = 0 then tier else 3 end, coalesce(seen.seers, 0), seen.last_seen nulls first, random()`. With `difficulty is null` every tier is 0, which gives today's order exactly. For Medium, Easy and Hard both sit in tier 1 and are mixed at random.
  - Everything else is unchanged: the "catalog too small" check and the Daily Double placement.
- **Compatibility with running code:** migrations run before deploys. The running api calls `set_room_options` with 7 args (the new params default), and `game/` calls `start_game(uuid)`, which is unchanged. The new columns are nullable, so nothing running breaks.

### 3. `worker/`: rating (the core of the task)

**New files:**
- `worker/src/schmegettes_worker/clue_rate.py`
- `worker/prompts/category_difficulty.md`: the system prompt. The stack doc puts prompts in `worker/prompts/`.

**Dependency:** add `anthropic` to `worker/pyproject.toml` and update `uv.lock`.

**CLI** (`__main__.py`): `rate-clues [--limit N] [--check-order N] [--handcheck-export PATH] [--handcheck-score PATH]`. It reads `DATABASE_OWNER_URL`, `ANTHROPIC_API_KEY` and `DIFFICULTY_MODEL`. Without the key it exits 2 with a clear message, like `import-clues` does. Add a mise task `clues:rate` next to `clues:import`.

**Which categories are rated:** those that can reach a board. That means `category_key`s with exactly 5 clues for single and double (`kind = 'board'`), or exactly 1 clue for final (`kind = 'final'`). It's the same `having count(*) = clues_per` rule as `build_board_round`.

**What is sent:** the category name, then for single and double the first 4 clues in board order (`order by value nulls last, id`, as `build_board_round` numbers them), each with its correct response. A Final sends its 1 clue. The 5th clue is never sent. `custom_id = category_key`: a 32-character hex string, within the 64-character limit.

**Prompt:** score 1–100 for how likely a typical adult group playing at home is to know these responses. Score the category as a whole, judging from the text alone, and don't consider the dollar values. Give anchor examples at about 10, 50 and 90. Don't use the show's name.

**A run, in order (safe to run again):**
1. **Collect pending batches.** For each distinct `batch_id` on rows with `score is null and batch_id is not null`, retrieve the batch. If it has ended, stream the results, keyed by `custom_id` because results arrive in any order:
   - `succeeded` with a valid score: set `score`, `model` and `rated_at`, and clear `batch_id`.
   - `errored`, `expired`, `canceled`, `refusal`, or invalid JSON: clear `batch_id` and increment `failures`.

   If the batch is still running, poll every 60 s until it ends (batches can take up to 24 h; `timeout-minutes` in the workflow covers it).
2. **Submit.** Every rateable category with no row, or with `score is null and batch_id is null`, goes into one batch, up to `--limit`. Batches are capped at 100,000 requests, so split into chunks if needed. Upsert the rows with `batch_id` **before** polling, so an interrupted run picks up the same batch and nothing is paid twice. Then collect, as in step 1.
3. **Set the scale, once per kind.** If a kind has no `difficulty_scale` row **and** no rateable category of that kind is unscored, compute the scale and insert it:
   - `easy_max` = the score at the 33.33rd percentile.
   - `medium_max` = the score at the 66.67th percentile.
   - `categories` = the number of categories it was cut from.

   If some categories of that kind are still unscored, don't set the scale yet. The report says "scale waits for N unrated".
4. **Label.** Wherever a scale exists, set `difficulty` on every row with a score and no label: `score <= easy_max` → easy, `<= medium_max` → medium, otherwise hard. A score equal to a cut point goes to the lower level. Labels are never updated.
5. **Report**, in the shape of the clue-catalog interaction design:

   ```text
   rated   easy   medium   hard   failed   still unrated
   ```

   Then one line per kind with its scale, a per-decade share of each level (seasons 1–10, 11–20, 21–30, 31–40) to check for era skew, and the run's token usage (summed from `usage` in the results) with an estimated cost.

**Quality-gate tooling** (the product brief's "Quality gate"):
- **`--check-order N`:** takes N random rated board categories and scores each of their 4 clues on its own (separate requests, synchronous or as a small batch). It prints the share of categories whose per-clue scores rise from row 1 to row 4 (mean slope > 0), and the mean score per row. Pass: the mean score rises from row 1 to row 4, and at least 70% of categories have a positive slope.
- **`--handcheck-export PATH`:** writes a CSV of 60 rated categories, 20 per level, in random order. Columns: `category_key`, category name, clues and responses, and an empty `my_label` column. Claude's label is **not** included.
- **`--handcheck-score PATH`:** reads Wyatt's filled-in CSV and prints how many of the 60 agree with Claude, with a 3×3 confusion table. Pass: at least 45.

**Rules:** the worker never logs or sends anything about players. Only catalog text goes to Anthropic.

### 4. `api/`: room options

- `api/internal/rooms/handler.go`: add `Difficulty json.RawMessage` to `optionsBody`. An absent key leaves it unchanged; `null` sets Any; a known value sets that level. Any other value returns `400 invalid-request` ("Unknown difficulty"). Include it in the "Nothing to change" check and in the update log line (`"difficulty"`).
- `api/internal/rooms/store.go`: read `r.difficulty::text` into `Room`, and pass `set_difficulty` and `new_difficulty` to `set_room_options`.
- Return `difficulty` in every `Room` response: null for Any.

### 5. `web/`: game options (wide)

- **`web/src/lib/gameOptions.ts`:**
  - Add `difficulty: Difficulty | null`, using the generated type. `DEFAULT_OPTIONS.difficulty = null`.
  - `fromRoom` reads it, and `isDefault` requires null.
  - `summary` puts the level right after seasons, capitalized ("Seasons 20–40 · Easy · No Double Schmegettes · Quick picks"), as in the lobby feature brief. Any isn't listed.
  - `savedOptions` accepts only `easy`, `medium` or `hard`. Anything else, or a missing value, gives null (Any). That covers options saved before this change.
- **`web/src/lib/rooms.ts`:** the PATCH body already sends the options object, so make sure `difficulty` goes with it, `null` included.
- **`web/src/game/GameOptionsSheet.tsx`:** add a **Difficulty** row between Seasons and Double Schmegettes. It's a Mantine `SegmentedControl` with the data `Any | Easy | Medium | Hard`, and the description line below it:

  | Choice | Description |
  |---|---|
  | Any | "Every category, easy to hard" |
  | Easy | "Clues most people know" |
  | Medium | "A mix most groups will enjoy" |
  | Hard | "For trivia regulars" |

  Accessible name: "Difficulty". The sheet must still fit **844 × 390 without scrolling**, and must not scroll at 667 × 320. If it doesn't fit, tighten the `Stack` gap and the slider's bottom margin; don't add scrolling.

### 6. Rollout (after merge; the implementation agent prepares, the human runs)

- Add **`.github/workflows/rate-clues.yml`**, modelled on `load-clues.yml`:
  - Inputs: environment `staging | production`, and `limit` (optional).
  - Production runs only from the production branch, and `concurrency: rate-clues-{env}`.
  - Secrets: `ANTHROPIC_API_KEY` plus the owner URL, read only from that environment's own secrets, as `load-clues.yml` does.
  - `timeout-minutes: 360`. If a batch is still running at the timeout, the next run collects it.
  - The summary goes to `$GITHUB_STEP_SUMMARY`.
- **Order:**
  1. Staging pilot (`limit: 500`): report the measured cost.
  2. Wyatt approves the full-run cost.
  3. Full staging run.
  4. `--check-order 100` and the hand check (Wyatt) on staging.
  5. Both pass, then production (once private access is live there, as with the catalog).
- **Until an environment has been rated**, Easy and Hard fall back to Medium-rated (that is, unrated) categories. Games always start, as designed.

## Key files

| Package | Files |
|---|---|
| shared | `shared/schemas/domain.schema.json`, `shared/openapi.yaml`, generated output |
| supabase | `supabase/migrations/{ts}_clue_difficulty.sql`, `supabase/tests/clue_difficulty.test.sql` (new), `supabase/seed.sql` (labels for the SAMPLE categories: a third each, so Easy and Hard can be tried locally without an API key) |
| worker | `__main__.py`, `clue_rate.py` (new), `prompts/category_difficulty.md` (new), `pyproject.toml`, `uv.lock`, `.env.example` (`DIFFICULTY_MODEL`), `tests/test_clue_rate.py`, `tests/test_clue_rate_db.py` (new) |
| api | `internal/rooms/handler.go`, `store.go`, their tests |
| web | `lib/gameOptions.ts`, `lib/rooms.ts`, `game/GameOptionsSheet.tsx`, the lobby summary line, their tests |
| ops | `.github/workflows/rate-clues.yml` (new), `mise.toml` (`clues:rate`) |

## Contracts

The only changes are additive: a `Difficulty` enum in the domain schema, and `difficulty` (nullable) on `Room` and on the room PATCH body. There's no change to the WebSocket protocol and no change to `game/`.

## Success criteria

All of the product brief's success criteria, plus:
1. With `difficulty = null`, `build_board_round` gives the same ordering as today. A pgTAP test pins it, using seeded data with no labels.
2. With a level set, every category on a board has that label while unseen ones remain. Then unseen adjacent-level categories are used, then least-recently-seen ones at any level. `catalog too small` still fires only when the catalog really is too small.
3. `authenticated` and `anon` can't read `category_difficulty` or `difficulty_scale`. `game_engine` can read `category_difficulty`.
4. A second `rate-clues` run right after a complete one submits 0 requests and changes no label or scale.
5. A run killed after submitting picks up the same batch next time, and no category is submitted twice.
6. Scale rows are never written while any category of that kind is unscored.
7. `PATCH` with `{"difficulty": null}` sets Any. Without the key, the difficulty is unchanged. `"extreme"` gets a 400.
8. The options sheet fits 844 × 390, and 667 × 320, with no scroll.

## Test plan (targeted only)

**Database (`mise run db:test`):** new `supabase/tests/clue_difficulty.test.sql`:
- RLS and grants on both new tables, per role.
- `set_room_options`: set a level, set null, leave unchanged, and called by a non-host.
- `start_game` copies `difficulty` onto `games`.
- `build_board_round` with Any (same ordering as before), and with a level: only labelled categories while fresh ones exist; adjacent fallback, with Hard → Medium and Medium → Easy or Hard; then repeats. Unrated counts as Medium.
- Update `game_options.test.sql` if it asserts the old signature.

**Worker:**
```bash
mise run test:worker -- tests/test_clue_rate.py tests/test_clue_rate_db.py
```
- Unit tests, with the Anthropic client faked (no network in tests):
  - Request building: 4 clues in board order, never the 5th, `custom_id` = category_key.
  - Result parsing: succeeded, errored, expired, refusal, invalid JSON.
  - Percentile cut points, including ties at a cut point.
  - Labelling, and the report format.
- DB tests: idempotent rerun, resuming a pending batch, the scale waiting for unrated categories, labels never changing.

**api:** `mise run test:api -- ./internal/rooms/...`. PATCH with the difficulty absent, null, a valid value and an invalid one; the Room response includes `difficulty`.

**web:**
```bash
mise run test:web -- src/lib/gameOptions.test.ts src/game/GameOptionsSheet.test.tsx
```
`savedOptions` with legacy, valid and invalid values; `summary` ordering; the segmented control changes the option and the description.

**Generated contracts:** `mise run gen`, then commit. CI fails if they're stale.

## Logging

Use worker `structlog` events at `info`, each with `env` and `run_id` (a uuid per run):
- `difficulty batch submitted` (`batch_id`, `requests`)
- `difficulty batch collected` (`batch_id`, `succeeded`, `failed`, `input_tokens`, `output_tokens`)
- `difficulty scale set` (`kind`, `easy_max`, `medium_max`, `categories`)
- `difficulty run finished` (counts per level, `failed`, `still_unrated`)

Per-category failures are logged at `debug` with `category_key` and the result type only.

**Never logged:** the API key, owner URLs, or request and response bodies. Clue text appears only at `debug`.

The api's existing "room options updated" line gains `"difficulty"`.

## Docs to update

- `docs/system-docs/engineering/stack.md`: the `worker/` component row (adds category rating with Claude, the `rate-clues` command and the `rate-clues.yml` workflow) and the AI features row (rating is built; prompts in `worker/prompts/` now exist).
- `docs/system-docs/operations/deployment.md`: a new "Rating the clue catalog" section after "Loading the clue catalog" (pilot, cost approval, quality gate, then production).
- `docs/system-docs/security/configuration-and-secrets.md`: `ANTHROPIC_API_KEY` is now read by the worker for `rate-clues`, in the GitHub Environments `staging` and `production`. Add `DIFFICULTY_MODEL`.
- `docs/system-docs/architecture/data-and-isolation.md`: `category_difficulty` and `difficulty_scale`, who reads and writes them.
- `docs/product-docs/`: already updated (#208, #210). Fix them only if the implementation differs.

## Branch

`enhancement/clue-difficulty-impl`, from and into `develop`. No Jira key: Jira is not configured yet (`.github/jira.json` has no `enhancement` issue-type ID and the Jira secrets are unset), so the create-ticket workflow failed on this PR as expected.
