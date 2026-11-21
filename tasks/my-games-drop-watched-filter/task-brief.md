---
task-type: enhancement
task-title: "My games: remove the Watched filter"
---
# Task spec: my-games-drop-watched-filter

Product brief: `tasks/my-games-drop-watched-filter/product-brief.md`. Product doc: `docs/product-docs/features/game-history/interaction-design.md` ("Look back at past games").

## Approach

Web only. In `web/src/pages/MyGames.tsx`:
- Remove the `SegmentedControl`, the `Filter` type and the `filter` state.
- `first()` and `showMore()` call `listGames(cursor)` with no `kind`.
- Simplify `noHistory` to `games.length === 0`.
- Delete the per-filter empty copy ("No watched games." and so on) if it exists only for the filter.

Watched rows (eye tile, **Watched** chip, no score) are unchanged. The filter is component state only, so there's nothing saved to migrate.

**Leave the API as it is:**
- `GET /v1/games?kind=` stays in `shared/openapi.yaml` and `api/internal/games`.
- `listGames(cursor, kind?)` in `web/src/lib/games.ts` keeps its optional parameter.
- Removing them would be a breaking contract change for no gain. Note in the openapi description that the web no longer sends it.

## Subtasks (narrow → wide)

1. **web:** `pages/MyGames.tsx` and `MyGames.test.tsx`.
2. **docs:** see "Docs to update".

## Key files

`web/src/pages/MyGames.tsx`, `web/src/pages/MyGames.test.tsx`; optionally a one-line description on `kind` in `shared/openapi.yaml`. Generated code doesn't change for a description; run `mise run gen` and commit any diff.

## Contracts preserved

All of them. `GET /v1/games` keeps `kind`.

## Success criteria

- The product brief's success criteria.
- No `radio` named All, Played or Watched on `/games`. Requests to `/v1/games` carry no `kind`.

## Test plan

`mise run test:web -- src/pages/MyGames.test.tsx`:
- no filter control
- watched and played rows listed together, with the watched row keeping its eye tile and **Watched** chip
- `listGames` called without `kind` on the first load and on **Show more**
- the empty state is unchanged

Update or remove the existing tests that click the filter (for example the one asserting `queryByRole("radio", { name: "Watched" })`).

## Database migration plan

None.

## Logging requirements

None.

## Docs to update

`docs/product-docs/features/game-history/interaction-design.md`: remove the "Not yet implemented (task `my-games-drop-watched-filter`)" sentence.
