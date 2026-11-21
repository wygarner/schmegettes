# 0.1.0 internal notes

First deploy to production. `deploy-prod.yml` has never run, so production goes through the one-time setup in [deployment.md](../../docs/system-docs/operations/deployment.md#setting-up-an-environment) around this release.

## Before merging
- **Production setup steps 1 to 4** (Supabase project and Auth settings, Fly apps and deploy tokens, Vercel project, GitHub Environment `production`). The Environment's secrets and variables are present.
- Staging is at the same code: `deploy-staging.yml` for `94666db` passed migrate, api, game, web and the deployed-commit check (run 44325795597).

## On first deploy (steps 5 to 7)
1. The merge runs `deploy-prod.yml`. **Migrate** creates every table and the `app_service` role. The api and game deploys are expected to fail until their Fly secrets exist.
2. Set the `app_service` password in the production Supabase project, then `fly secrets set` on `schmegettes-api-prod` and `schmegettes-game-prod`: `DATABASE_URL` (pooler, port 6543, `?default_query_exec_mode=simple_protocol`), `SUPABASE_URL`, `SUPABASE_JWKS_URL`, `ALLOWED_ORIGINS`, and on the api `GAME_SOCKET_BASE_URL` ([configuration-and-secrets.md](../../docs/system-docs/security/configuration-and-secrets.md#1-variables-per-package)).
3. Re-run `deploy-prod.yml` on `production` and confirm "Verify deployed commit" passes.
4. Run **Load Clues** on `production` with `environment: production`, `seasons: 1-40`.
5. Host access: sign up the admin account, add it to `private.admins`, add `http://localhost:5174` to the api's `ALLOWED_ORIGINS`, and read the host code on the devtools Admin page ([Host access after a release](../../docs/system-docs/operations/deployment.md#host-access-after-a-release)).

## Migrations
All ten, applied in order on a fresh database (rehearsed on staging):
`20261026000000_init`, `20261027174627_lobby`, `20261028013532_gameplay`, `20261102171133_gameplay_polish`, `20261109145618_wagers`, `20261109210750_games_host`, `20261110033412_private_access`, `20261110180920_accounts`, `20261110203638_answer_judging`, `20261117225224_host_code_rotation`.

## Config changes
None beyond the first-time setup above.

## Breaking changes
None: no earlier production release.

## Accepted security findings
- **GHSA-fc5q-39xc-vjpf**, ReDoS in `picomatch` ≤ 4.0.7, high. No fixed release exists. It reaches only build-time tools (vite, vitest, json-schema-to-typescript), never the shipped bundle or a server. Accepted by Wyatt Garner on 2026-11-18; CI's `bun audit` ignores it (#156). Remove the ignore once `picomatch` ships a fix.

## Known issues
- `@mantine/core` is 9.8.0 and `@mantine/hooks` 9.7.5 (Dependabot #133 open). Tests pass; align them in the next release.
- Not yet implemented: Grafana telemetry and alerting, so production health means `/healthz` on api and game plus a manual run of the critical paths.
