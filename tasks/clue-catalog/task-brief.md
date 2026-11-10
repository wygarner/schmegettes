---
jira-type: new-feature
jira-title: "Load the real clue catalog from the clue dataset"
---
# Task spec: clue-catalog

Product brief: [product-brief.md](./product-brief.md). Rules: [clue catalog](../../docs/product-docs/features/clue-catalog/feature-brief.md) and its [interaction design](../../docs/product-docs/features/clue-catalog/interaction-design.md).

**Ordering:** independent of `private-access` for local and staging. **Production loads only after private access is live.** The loader enforces this (subtask 3).

## What already exists

- `public.clues` (`20261026000000_init.sql`):
  - `source_key text unique`, and a generated `category_key` (season | air date | round | category).
  - Indexes `(season, round)` and `(round, category_key)`.
  - Only `game_engine` can read it (`engine_all`). Writes are owner-only.
- `build_board_round` (latest in `20261102171133_gameplay_polish.sql`) picks categories with exactly 5 clues (1 for Final), keeps the first 4 by value, and assigns values by row. **No change needed.**
- `worker/src/schmegettes_worker/clue_import.py`:
  - `parse_season_tsv(season, text)` maps rounds `1/2/3`, strips backslash escapes, and skips rows without clue text or response.
  - It drops the `comments` column, which the rules need.
- `worker/__main__.py` idles; the queue loop isn't built. The `ImportClueSeason` job envelope exists in `shared/schemas/jobs/` but nothing produces it.
- `worker/.env.example` already has `DATABASE_OWNER_URL` and `CLUE_DATASET_BASE_URL`. `psycopg[binary]` is already a dependency.
- `supabase/seed.sql` (local only) inserts `seed-*` clues. Staging and production never run it.

## Approach

A **worker CLI command** loads seasons directly as the owner role:
- One transaction per season.
- Upsert on `source_key` with `on conflict do nothing`.

It is not a pgmq job: the product brief keeps the queue loop out of scope, and a load is a rare admin action.

The rules are applied **at load time**: only categories that can reach a board are stored. That keeps the catalog about 25% smaller, leaves `build_board_round` untouched, and makes "never on a board" true by construction. A re-run computes the same keys, so it inserts nothing.

## Subtasks

### 1. Parsing and rules (`worker/src/schmegettes_worker/clue_import.py`)

- Keep the note: add `has_note: bool` to `CatalogClue` (true when `comments` is non-empty after `_clean`). Parsing stays row-by-row.
- New `select_categories(clues) -> tuple[list[CatalogClue], SeasonReport]`. It groups by `(air_date, round, category)` and drops a whole category when:
  1. **incomplete**: Single/Double with a clue count other than 5 (Final: other than 1)
  2. **host_note**: any clue has `has_note`
  3. **show_name**: category, clue text, or response matches `re.compile(r"jeopardy|trebek|clue crew", re.I)`
  4. **sound_picture**: clue text matches `re.compile(r"\[|\b(?:seen|shown|heard) here\b|\bpictured\b|\bthis photo\b|\bon the monitor\b|\bhere is a map\b", re.I)`
- The first matching rule in that order is the one counted.
- `SeasonReport` has: `season`, `clues_read`, `categories_kept`, and `left_out: dict[rule, int]`. Single/Double and Final are counted together, and "categories kept" includes Finals, as in the interaction design's table.
- Keep the patterns as module constants with a one-line comment each. The show's name appears only here and in the tests (code, not product text).

### 2. Loader (`worker/src/schmegettes_worker/clue_load.py`, new)

- `load_seasons(seasons, *, fetch, store) -> list[SeasonResult]`. `fetch(season) -> str` downloads `{CLUE_DATASET_BASE_URL}/season{N}.tsv` (stdlib `urllib.request`, 60 s timeout, 2 retries). `store` writes one season.
- Per season the states are `downloading → checking → loaded | failed`. A failure is recorded and the run moves on to the next season.
- Postgres store (psycopg 3, `DATABASE_OWNER_URL`), per season in one transaction:
  1. `create temp table incoming (season integer, air_date date, round public.round, category text, value integer, clue_text text, correct_response text, source_key text) on commit drop`.
  2. `COPY` the kept rows into it.
  3. `insert into public.clues (season, air_date, round, category, value, clue_text, correct_response, source_key) select … from incoming on conflict (source_key) do nothing`.
  4. Return the inserted row count.
- `source_key` is unchanged (`_source_key`), so ids and `seen_clues` stay stable across runs.

### 3. CLI (`worker/src/schmegettes_worker/__main__.py`)

- Use `argparse` subcommands. With no subcommand, the current idle loop runs (deploys are unchanged).
- `import-clues [--seasons 1-40]`: accepts ranges and lists ("1-5,12"); the default is 1–40. It prints the summary table from the interaction design to stdout (the CLI's deliverable, so `print` is allowed) and exits non-zero if any season failed.
- **Production guard**: when `APP_ENV=production`, it refuses to run (exit 2, "private access is not live") unless `to_regclass('public.hosts')` is not null (the private-access migration). Local and staging are not guarded.
- `mise.toml`: add `[tasks."clues:import"]`, which loads `worker/.env` like `dev:*` and runs `uv run python -m schmegettes_worker import-clues`. Usage: `mise run clues:import -- --seasons 1-5`.

### 4. Remote load (`.github/workflows/load-clues.yml`, new)

- Trigger: `workflow_dispatch` with inputs `environment` (`staging` | `production`) and `seasons` (default `1-40`).
- The job uses the GitHub Environment of the same name and reads `secrets.STAGING_SUPABASE_DB_OWNER_URL` or `secrets.PROD_SUPABASE_DB_OWNER_URL` (the second already exists). It fails with a clear message when the secret is unset.
- Sets `APP_ENV` from the input, so the production guard applies.
- Runs `uv sync --frozen` and the CLI from `worker/`. Pinned action SHAs as in the other workflows; `permissions: contents: read`.
- The owner URL never reaches a laptop for remote environments.

### 5. Read "&" aloud as "and" (`web/src/lib/speech.ts`)

- In `speak()`, replace `&` (and `&amp;` defensively) with " and " before handing text to the synthesizer. Displayed text is unchanged.
- **PR #88** (`bug-fix/host-narration-ios`) is open and touches narration. Merge the daily branch in before opening the PR.

### 6. Docs (see "Docs to update")

## Contracts preserved / changed

No contract change. `shared/` is untouched. `ImportClueSeason` stays unused, and the CLI doesn't go through pgmq. No REST or socket change.

## Success criteria

- `mise run clues:import` loads seasons 1–40 into local Supabase. A second run prints "0 new clues" for every season and exits 0.
- Spot check the per-season summary against the product brief's sample: season 1 keeps about 1,205 Single/Double categories and 163 Finals; season 40 about 2,336 and 230. Small differences from the stricter `sound_picture` pattern are fine. Record the actual numbers in the PR.
- No row in `public.clues` with `source_key not like 'seed-%'` matches the show-name or sound/picture patterns, and none comes from a category with a note. Check with SQL in the PR description.
- With the full catalog loaded locally, `select public.start_game(…)` on a 6-contestant room takes **under 1 s**. Post the `explain analyze` timings of `build_board_round` in the PR. Over 1 s: stop and report. The fix (a per-category summary table) is a separate task.
- Database size after a full local load is reported in the PR (`select pg_size_pretty(pg_total_relation_size('public.clues'))`). The estimate is about 160 MB.
- `load-clues.yml` with `environment=production` exits 2 against a database without `public.hosts`.
- A spoken clue containing "&" says "and".

## Test plan

| Package | Tests | Command |
|---|---|---|
| worker | `tests/test_clue_import.py`: one fixture TSV per rule (incomplete, host note, show name, sound/picture), a passing category, a Final with a note (dropped), rule precedence, and the report counts | `mise run test:worker -- tests/test_clue_import.py` |
| worker | `tests/test_clue_load.py` with a fake `fetch` and fake `store`: a failing season among good ones (others still load, exit non-zero), season-list parsing (`1-5,12`), the production guard (fake store reports no `hosts`) | `mise run test:worker -- tests/test_clue_load.py` |
| worker | `tests/test_clue_load_db.py`: loads a fixture season twice into local Supabase. The second run inserts 0, and the `id`s are unchanged. Skipped when `DATABASE_OWNER_URL` is unset (CI's worker job has no database) | `mise run test:worker -- tests/test_clue_load_db.py` (with `mise run db:start`) |
| web | `src/lib/speech.test.ts`: the "&" replacement | `mise run test:web -- src/lib/speech.test.ts` |

Also run `uv run ruff check` and `uv run mypy` in `worker/`.

## Database migration plan

None. No schema change: rows are written to the existing `public.clues` as the owner role, under the existing grants and RLS.

## Logging requirements

Worker (`structlog`, `service=worker`):

| Event | Level | Fields |
|---|---|---|
| `clue import started` | info | `seasons` (count), `env` |
| `season imported` | info | `season`, `clues_read`, `inserted`, `categories_kept`, `left_out` (dict by rule), `duration_ms` |
| `season import failed` | error | `season`, `err`, `stage` (`download` \| `store`) |
| `clue import finished` | info | `seasons_loaded`, `seasons_failed`, `inserted`, `duration_ms` |

No per-clue logs above `debug`. Never log clue text, responses, or the owner URL. Log the database host only if needed, without credentials.

## Docs to update

- `docs/product-docs/features/clue-catalog/feature-brief.md` and `interaction-design.md`: remove the "Not yet implemented" banners, and name the command (`mise run clues:import`) and the workflow (`load-clues.yml`).
- `docs/system-docs/engineering/stack.md`: the worker row says catalog import is built as a CLI.
- `docs/system-docs/security/configuration-and-secrets.md`:
  - `DATABASE_OWNER_URL` is used by `import-clues`.
  - Add `STAGING_SUPABASE_DB_OWNER_URL` (GitHub Environment `staging`, not set yet).
  - `PROD_SUPABASE_DB_OWNER_URL` is also used by `load-clues.yml`.
- `docs/system-docs/security/security-model.md`: the worker row (the import is built; it runs from CI or a developer machine, not the queue).
- `docs/system-docs/engineering/developer-setup.md`: optional `mise run clues:import -- --seasons 1-3` for real clues locally.
- `docs/system-docs/operations/deployment.md`: loading the catalog into an environment, and the production guard.
- `worker/src/schmegettes_worker/__main__.py` docstring.

## Branch

`new-feature/clue-catalog-impl`, from and into `daily/2026-11-10`. Implementation PR title: `[New Feature] clue-catalog: …`. Merge the daily branch in before opening the PR; the final commit deletes `tasks/clue-catalog/`.
