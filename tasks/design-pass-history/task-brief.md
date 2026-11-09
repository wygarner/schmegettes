---
jira-type: new-feature
jira-title: "Design pass 3/3: My games"
---
# Task spec: design-pass-history

Product brief: [product-brief.md](./product-brief.md). Rules: [game history](../../docs/product-docs/features/game-history/feature-brief.md) and its [interaction design](../../docs/product-docs/features/game-history/interaction-design.md). Visual reference: `devtools/src/designs/results/scoreboard-and-history.tsx`.

**Depends on `design-pass-restyle`** (shared UI pieces in `web/src/ui/`). Independent of `design-pass-endgame`.

## What already exists

- `GET /v1/games` (cursor page of `GameSummary`) and `GET /v1/games/{gameId}` (`GameDetail`) are in `shared/openapi.yaml` and generated into `api/internal/contracts`, but `api/cmd/api/routes.go` answers both with 501.
- RLS already limits `games`, `game_players`, `answers` and the `game_results` view to people who played or watched (`is_game_member`). `game_results` gives score, placement (contestants only, ties share), and "Former player".
- **Missing:** who hosted. A playing host is recorded in `game_players` as a `contestant`, so the host can't be told apart once the room is deleted. This needs a column.

## Subtasks

### 1. Contracts (`shared/openapi.yaml`), additive only

- `GameSummary`: add optional `callerDisplayName: string | null` (the caller's name in that game, so the list can say "You"), and `watched: boolean` (the caller was a non-playing host or a spectator).
- `GameDetail`: add optional `hostDisplayName: string | null` (null for a deleted host) and `watched: boolean`. The game's length is computed on the client from `startedAt` and `finishedAt`.
- `GameResult`: add optional `isCaller: boolean`.
- `GET /v1/games`: document the page size (20) and that the cursor is opaque. 404 for `GET /v1/games/{gameId}` when the caller isn't a member (RLS returns no row).

Run `mise run gen`; commit the generated TS, Go, and `openapi30.gen.yaml`.

### 2. Migration (`supabase/`)

`supabase migration new games_host`:

```sql
alter table public.games
  add column host_user_id uuid references public.profiles (user_id) on delete set null;
```

- `start_game()` (latest definition in `20261027174627_lobby.sql`, redefine with `create or replace` in the new file): set `host_user_id = room.host_user_id` on the new game.
- Backfill: `update public.games g set host_user_id = r.host_user_id from public.rooms r where g.room_id = r.id and g.host_user_id is null;`
- No new table, no new grant: `games` already has `select` for `authenticated` and the `games_select` policy. The account-deletion trigger needs nothing: `on delete set null` covers it.
- Compatible with running code: a nullable column; the old `start_game` signature is unchanged.

### 3. API (`api/`)

New package `api/internal/games` (`handler.go`, `store.go`, tests), wired in `api/cmd/api/routes.go` in place of the two 501 stubs. Every query runs in `db.AsUser(ctx, claims, fn)`.

- **List** (`GET /v1/games`): the caller's `game_players` rows joined to `games` with `status in ('finished','abandoned')`, ordered by `finished_at desc, games.id desc`, 20 per page. Keyset cursor: base64 of `{finishedAt, gameId}`; a bad cursor → 400 problem. For each game: `status`, `startedAt`, `finishedAt`, the caller's `score` and `placement` from `game_results`, `players` (contestants' display names in placement order, "Former player" for deleted accounts), `playerCount`, `callerDisplayName`, `watched` (caller's role is `host` or `spectator`).
- **Detail** (`GET /v1/games/{gameId}`): 404 if no row (not a member, or no such game). `results` = contestants from `game_results` ordered by placement then name, each with `isCaller`; `hostDisplayName` = the `game_players.display_name` of `games.host_user_id` in that game (null if the host account is gone); `watched`.
- Errors as RFC 9457 problems via `server.Problem`.

### 4. Web

- `web/src/lib/games.ts`: `openapi-fetch` calls for the two endpoints.
- Routes in `web/src/main.tsx`: `/games` (`MyGames`) and `/games/:gameId` (`GameScoreboard`), new pages in `web/src/pages/`.
- **My games:** title, Home link, rows as in the interaction design (placement badge board-blue with gold/silver/bronze text, WATCHED badge, "Today, 8:14 PM" / "Oct 26, 8:14 PM", Unfinished badge, players with "You", my score in Oswald, `red.4` when negative), **Show more** loads the next cursor, the empty state with **Join a game** (→ `/join`), the anonymous nudge when the Supabase session user is anonymous (`supabase.auth.getUser()`; no API call).
- **Game scoreboard:** "‹ My games", date · start time · length, "Hosted by {name}" (omitted when null), the Unfinished / watched notes, result rows with placement colors, "(you)", 🏆 on 1st for finished games, "Former player" in italics. 404 → "This game isn't in your history." with a link back.
- **Home:** a **My games** link (phone and host layouts).
- Loading and error states: a loader; "Couldn't load your games. Try again." with a retry.

### 5. Docs (see "Docs to update")

## Contracts preserved / changed

`shared/openapi.yaml` changes additively (new optional fields, documented page size). No path or required field changes, so no `/v2`. No WebSocket change.

## Success criteria

- `GET /v1/games` returns the caller's played and watched ended games, newest first, 20 per page, with a working cursor; in-progress games are excluded.
- `GET /v1/games/{id}` returns 404 for a game the caller didn't play or watch.
- Ties share a placement; "Former player" appears for a deleted account; names are the in-game snapshots.
- `hostDisplayName` is right for a playing host and a non-playing host, and null after the host's account is deleted.
- Responses validate against the OpenAPI spec in the handler tests.

## Test plan

- `supabase/tests/game_history.test.sql` (extend): `start_game` sets `host_user_id`; the backfill; deleting the host's account nulls it; a non-member sees no `games` row (already covered; keep).
- `api/internal/games`: `store_test.go` against the test database (list order, page size, cursor round-trip, watched games, abandoned games, non-member gets nothing); `handler_test.go` (responses validate against `openapi30.gen.yaml`; bad cursor → 400; unknown game → 404).
- `web`: `src/pages/MyGames.test.tsx` (rows, You, WATCHED, Unfinished, Show more, empty state, anonymous nudge), `src/pages/GameScoreboard.test.tsx` (ties, (you), Former player, no 🏆 on unfinished, 404).

```bash
mise run gen
mise run db:test
mise run test:api -- ./internal/games/...
mise run test:web -- src/pages/MyGames.test.tsx src/pages/GameScoreboard.test.tsx src/pages/Home.test.tsx
```

## Database migration plan

| Item | Value |
|---|---|
| File | `supabase migration new games_host` → `supabase/migrations/{timestamp}_games_host.sql` |
| Change | `games.host_user_id uuid null references profiles(user_id) on delete set null`; `start_game()` sets it; backfill from `rooms` |
| RLS / grants | Unchanged: existing `games_select` policy and `select` grant cover the column. No new table |
| pgTAP | Extend `supabase/tests/game_history.test.sql` (see Test plan) |
| Compatibility | Nullable column and an unchanged function signature, so the running `game/` and `api/` keep working before this code deploys |

## Logging requirements

Through the api's request logger (request id bound). `games list failed` / `game detail failed` at `error` with `err` on database errors only. A 404 or a bad cursor is not an error (`info` at most, via the existing request log). Never log display names, emails, or tokens.

## Docs to update

- `docs/system-docs/architecture/data-and-isolation.md`: `games.host_user_id`, and the deletion rule (nulls it).
- `docs/system-docs/architecture/api-contract.md`: nothing structural; if the REST table lists implemented endpoints, mark `/v1/games` built.
- `docs/product-docs/features/game-history/interaction-design.md`: remove "Not yet implemented" from My games.
