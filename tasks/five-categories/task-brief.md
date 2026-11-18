---
jira-type: enhancement
jira-title: "Five categories per board, with wider columns"
---
# Task spec: five-categories

Product brief: `tasks/five-categories/product-brief.md`. Rules: `docs/product-docs/features/gameplay/feature-brief.md` (The board and control), `features/game-history/feature-brief.md` (Building a fresh board).

## Approach

The board size lives in one SQL function, `public.build_board_round` (last defined in `supabase/migrations/20261102171133_gameplay_polish.sql`): `wanted := 6` categories and Daily Doubles placed over `generate_series(0, 5)`. A new migration redefines it with 5 and `generate_series(0, 4)`. Nothing else in the server assumes a column count. `web/src/game/Board.tsx` already sizes its grid from the data (`repeat(cols.length, …)`), so the web change is checking the layout, not rewriting it.

Games already running keep their 6-column boards: the function only runs at Start.

## Subtasks

1. **supabase: migration** `supabase migration new five_categories`: `create or replace function public.build_board_round(...)` with the same signature, `security invoker`, `search_path = ''` and body, except `wanted := 5` for Single/Double and Daily Double columns from `generate_series(0, wanted - 1)`. Grants are unchanged (same signature, so `create or replace` keeps them; confirm in the pgTAP test).
2. **supabase: tests** (`supabase/tests/game_history.test.sql`): boards now have 5 columns × 4 rows per round; the Daily Double placement tests still hold (1 Single, 2 Double, different columns, never row 0). The fixtures (`tests.categories(…, 6, …)`) still create enough categories; adjust any count assertions from 6 to 5.
3. **game: tests**: any fixture or assertion assuming 6 columns or 24 clues in `game/internal/play/*_test.go` and `game/internal/room/*_test.go` → 5 / 20 where it describes a fresh board. Recovery of an old 6-column game must still work (keep or add one test with 6 columns).
4. **web: board layout** (`web/src/game/Board.tsx`): check at 667 × 320, 844 × 390, 956 × 440 that 5 columns fill the stage and headers wrap less; retune the header font clamp only if the wider cells now look under-filled. The phone mini board shows 5 columns.
5. **devtools**: the board reference design, if it hard-codes 6 columns (`devtools/src/designs/`), shows 5.

## Key files

New `supabase/migrations/*_five_categories.sql`, `supabase/tests/game_history.test.sql`, `game/internal/play/game_test.go`, `game/internal/room/game_test.go`, `web/src/game/Board.tsx` (+ `Board.test.tsx`).

## Contracts preserved

No change to `shared/`. `BoardClue` already carries any number of columns.

## Success criteria

- Every new game's Single and Double boards have exactly 5 categories × 4 clues, with 1 / 2 Daily Doubles by the existing rules.
- A game started before the migration (6 columns) still plays and recovers after a game-server restart.
- Host board at the three viewports: 5 columns span the stage, no scrolling, all 4 rows visible with 6 contestants.

## Test plan

- `mise run db:test` (pgTAP: board shape, Daily Double placement, grants unchanged).
- `mise run test:game -- ./internal/play/... ./internal/room/...`
- `mise run test:web -- src/game/Board.test.tsx` (a 5-column board renders 5 columns × 4 rows).

## Database migration plan

- File: `supabase migration new five_categories`.
- Changes: `create or replace function public.build_board_round(uuid, public.round, uuid[], integer[])`. No tables, so no new RLS. Grants unchanged (`game_engine` execute).
- pgTAP: extend `supabase/tests/game_history.test.sql` as above, plus `function_privs_are` for `build_board_round` still `game_engine` only.
- Compatible with code already running: the signature is the same, and the running `game/` reads whatever board rows exist.

## Logging requirements

None.

## Docs to update

- `docs/system-docs/` anywhere the board is described as 6 categories (`grep -rn "6 categor\|six categor" docs/system-docs`).

## Branch

`enhancement/five-categories-impl`, from and into `develop`. Jira isn't set up yet (`.github/jira.json` issue types are `REPLACE_ME`), so there's no `SCH-{N}`: the folder keeps its name, and the PR title is `[Enhancement] five-categories: …`.
