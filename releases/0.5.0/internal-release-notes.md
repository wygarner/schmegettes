# 0.5.0 internal notes

## Before merging
- **GitHub Actions jobs were not starting** (failed payment or spending limit) when this release was cut. On Wyatt's instruction it merged anyway, without these steps:
  - **CI on the combined `develop`:** #259 and #257 merged 11 seconds apart (2026-11-21 02:22 UTC). Each PR's CI was green on its own branch (runs 44851044389 and 44848675954), but CI never ran on the two together, and it didn't run on this release PR either.
  - **Staging rehearsal:** both Deploy Staging runs on `develop` (44855528343, 44855545710) failed at "Migrate (staging)" without starting. The stats migration has not been applied to a hosted database.
  - **End-to-end and smoke test on staging:** not done. `e2e.yml` (new in this release) also needs the one-time E2E host set-up first (testing-strategy.md §6).
- **Deploy:** `deploy-prod.yml` won't start either, so merging this PR does not put it live. How it gets deployed is recorded under "After deploy".

## Migrations
One, additive: `20261121011645_stats_and_leaderboard`.
- `profiles.show_on_leaderboard boolean not null default true`; `authenticated` can update that column.
- `profiles_update` dropped and recreated with the same `user_id = auth.uid()` rule, so the migration owns the new column's access boundary.
- `private.counted_games`, `private.ranked_players` (internal; execute revoked from every role) and `private.my_stats`, `private.leaderboard` (security definer, executable by `authenticated` only). Stats are computed on read, so verdict overrides, renames, visibility changes and account deletion show at once.
- pgTAP: `supabase/tests/stats_and_leaderboard.test.sql` (28 assertions).
- Compatible with the api already running: it doesn't use the new column or functions.

## Contracts
Additive: the stats and leaderboard routes in `shared/openapi.yaml`, and the visibility field on the account. No WebSocket message changes.

## Config changes
- `deploy.yml` sets `VITE_ENV`; the E2E mode (`?e2e=1`) is enabled only in dev or when `VITE_ENV=staging`. CI checks that `__e2e` isn't in the production bundle.
- New secrets for `e2e.yml`: `E2E_HOST_EMAIL`, `E2E_HOST_PASSWORD` (staging only; set-up in testing-strategy.md §6).
- Exact pins: node 24.22.3, go 1.25.14, python 3.13.18 (`mise.toml`); `golang:1.25.14-bookworm` in the api and game Dockerfiles.

## After deploy
- **Deployed by hand on 2026-11-21**, because `deploy-prod.yml` (run 44869925985) didn't start, with the same steps and flags as `deploy.yml`:
  - **Migration:** `supabase db push --linked --include-all` applied `20261121011645_stats_and_leaderboard` to staging first, then production. It was the only pending migration on each, and applied cleanly. Staging code wasn't redeployed, so staging has the new schema under the old code.
  - **api, game:** `flyctl deploy` (remote builder) at `ab02057`, image label `ab02057`, `APP_ENV=production`, game with `--ha=false`.
  - **web:** built with the production variables and `VITE_ENV=production` (no `__e2e` in the bundle), then `web/scripts/vercel-deploy.mjs`; Vercel deployment `dpl_6zhy31btyfZUQYDv5gb7hZFa844z`.
- **Verified:** every address in `PROD_VERSION_URLS` reports `ab02057`; `/healthz` returns 200 on api and game; `/v1/me/stats` and `/v1/leaderboard` return 401 without sign-in (they reach the migrated schema); no error lines in the api logs after the deploy.
- **Production health confirmed by Wyatt** (critical paths and the Stats page) before this sign-off merged.
- The Vercel token was a temporary personal token, not the `VERCEL_TOKEN` secret; it is to be revoked.

## Known issues
- `show_on_leaderboard` defaults to true: existing signed-in players appear on the leaderboard until they opt out.
- GH-239 and GH-243 may still be open: their "transition" checks failed to start for the same billing reason.
- The Vercel Git-integration preview check still fails on every PR; it isn't the deploy path.
