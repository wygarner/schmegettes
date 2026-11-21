# 0.4.0 internal notes

## Before merging
- **CI:** `ci.yml` dispatched on `develop` at `15b5c46` passed in every package (run 44813835789). That covers `0ebc1c0`, which was pushed without a PR.
- **Staging rehearsal:** the migration applied on staging with #229 (Deploy Staging run 44749960999, Migrate succeeded). The latest staging deploy (run 44813475451) verified api, game and web at `15b5c46`.
- **Staging ratings:** Rate Clues has run on staging, then `recut` after #256. Board categories split 34.7% Easy / 35.8% Medium / 29.4% Hard.
- **Smoke test on staging:** sign in, create a room, join by code, buzz, judge, finish a game. Also: game options shows Difficulty (Any selected); pick Hard and start a game; the TV lobby reads "Join at staging.schmegettes.app/join"; the player tab has no label.
- There's no Playwright suite yet (GH-243 adds the release test layer), so the smoke test is by hand.

## Migrations
One, additive: `20261120004624_clue_difficulty`.
- New enum `difficulty` (`easy`, `medium`, `hard`).
- New tables `category_difficulty` (one row per category, written by the rating run) and `difficulty_scale` (the cut points per kind). Both have RLS on; `game_engine` can read `category_difficulty`; only the owner writes either.
- `difficulty` on `rooms` and `games` (nullable; null means Any).
- `set_room_options` dropped and recreated with `set_difficulty boolean default false` and `new_difficulty difficulty default null`, so the api already running keeps working until the new api is deployed.
- `build_board_round` takes `target_difficulty` (default null, today's ordering). `start_game` copies `difficulty` from the room.

## Config changes
- New repository secrets for the Rate Clues workflow: `STAGING_ANTHROPIC_API_KEY` (set), `PROD_ANTHROPIC_API_KEY` (**not yet set**), and `STAGING_`/`PROD_SUPABASE_DB_OWNER_URL`.
- `worker/.env.example`: `ANTHROPIC_API_KEY` and `DIFFICULTY_MODEL` (default `claude-haiku-5-5`) for running the rating locally.
- main-domain's operator steps (Vercel domains, `ALLOWED_ORIGINS`, version URLs, Supabase Auth URLs) were done by hand before this release; nothing in the code needs them, because the join address comes from the page's own host.

## Contracts
All additive: `Domain.Difficulty`; `Room.difficulty` (nullable); the `PATCH /v1/rooms/{roomId}` body's `difficulty` (absent leaves it unchanged, null sets Any, an unknown value is a 400); `room_snapshot.difficulty`.

## After deploy
- **Production has no difficulty labels yet.** Until Rate Clues runs on production, every category counts as Medium: Easy and Hard boards come out the same as Any. To rate: set `PROD_ANTHROPIC_API_KEY`, then dispatch Rate Clues with `environment: production`, `action: rate` (about $4 with Haiku through the Message Batches API; see `deployment.md`). The catalog is already loaded on production (Load Clues, 2026-11-18).

## Known issues
- **The labels missed the hand-check bar:** 26 of 60 agreed with Wyatt's labels (the bar was 45). Shipped anyway as a starting point; recorded in the clue-catalog feature brief (#255). Labels never change once set, so a better prompt later needs a new rating run.
- `scripts/release-scope.cjs` recognises neither `GH-` keys nor direct pushes to `develop`; this release's scope was listed by hand.
- Category names with a backslash (e.g. `FILE UNDER "E\"`) display the backslash. Not yet briefed.
- The Vercel Git-integration preview check still fails on every PR; it isn't the deploy path and doesn't gate anything.
