# Configuration and Secrets

**Source of truth:** `api/.env.example`, `game/.env.example`, `web/.env.example`, `worker/.env.example`, `devtools/.env.example`, `api/fly.toml`, `game/fly.toml`, `scripts/deploy.mjs`, `.github/workflows/deploy.yml`, `.github/workflows/grafana.yml`, `.github/workflows/ci.yml`

Every variable each package reads, where it lives, who owns each secret and how to rotate it, and the config switches. `api` and `game` run on Fly.io: "Fly secret" means `fly secrets set` on that app (staging and production apps each have their own), and "`fly.toml`" means the value is in the repo or passed by the deploy. `web` runs on Vercel, but its values are built in by CI from the GitHub Environment, not set in Vercel.

## 1. Variables per package

Each package's `.env.example` lists its variables with placeholder values. Local `.env` files are git-ignored and point at local Supabase only.

| Variable | Package(s) | Secret | Production location |
|---|---|---|---|
| `PORT` | api, game | no | `fly.toml` `[env]` |
| `APP_ENV` | api, game, worker | no | api, game: set by the deploy command (`staging` / `production`); worker: `load-clues.yml` |
| `LOG_LEVEL` | api, game, worker | no | `fly.toml` `[env]` (`info`) |
| `DATABASE_URL` | api, game, worker | **yes** (the `app_service` password) | Fly secret. The Supabase transaction pooler URI (port 6543) as `app_service`, ending `?default_query_exec_mode=simple_protocol` ([deployment.md](../operations/deployment.md#database-roles-per-environment)) |
| `DATABASE_OWNER_URL` | worker | **yes** (owner role, bypasses RLS) | Only for `import-clues` and `rate-clues`. Local: `worker/.env`. Staging and production: never on a laptop; `load-clues.yml` and `rate-clues.yml` read the GitHub Environment secrets below |
| `SUPABASE_URL` | api, game | no | Fly secret (not secret, kept with the rest) |
| `SUPABASE_JWKS_URL` | api, game | no (public keys) | Fly secret: `{SUPABASE_URL}/auth/v1/.well-known/jwks.json` |
| `ALLOWED_ORIGINS` | api, game | no | Fly secret: the web origin, `https://schmegettes.app` (staging `https://staging.schmegettes.app`). The api's also includes `http://localhost:5174`, so the devtools Admin page can call it |
| `GAME_SOCKET_BASE_URL` | api | no | Fly secret: `wss://schmegettes-game-{staging,prod}.fly.dev` |
| `STATUS_PAGE_API_TOKEN` | api | **yes** | Fly secret. Instatus API key for that environment's page; unset selects the no-op client |
| `STATUS_PAGE_ID` | api | no | Fly secret alongside the token: the Instatus page ID for that environment |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | api, game | no | Fly secret, staged by the deploy command from the GitHub Environment variable. Unset: no telemetry is exported |
| `OTEL_EXPORTER_OTLP_HEADERS` | api, game | **yes** (OTLP write token) | Fly secret, staged by the deploy command from the GitHub Environment secret |
| `TEST_PANIC_ROOMS` | game | no | Staging game app only, as a Fly secret, set by hand for the forced-panic check and unset afterwards ([observability.md](../operations/observability.md#containment-in-the-game-server)). Ignored outside staging |
| `REDIS_URL` | game | **yes** | host secret store. Listed in `game/.env.example` but not read yet: no service uses Redis |
| `CLUE_DATASET_BASE_URL` | worker | no | `worker/.env`; in `load-clues.yml`, the repository or environment variable `CLUE_DATASET_BASE_URL` (required; the load fails without it). The repo ships no dataset or default URL: each operator, including anyone running a fork, supplies their own and is responsible for its rights |
| `ANTHROPIC_API_KEY` | worker | **yes** | Read by `rate-clues` (and, later, the LLM judge). Local: `worker/.env`. Staging and production: `rate-clues.yml` sets it from `STAGING_ANTHROPIC_API_KEY` or `PROD_ANTHROPIC_API_KEY` (below) |
| `DIFFICULTY_MODEL` | worker | no | The model `rate-clues` uses (default `claude-haiku-5-5`). Local: `worker/.env`. In `rate-clues.yml`, the optional repo or environment variable `DIFFICULTY_MODEL` |
| `VITE_SUPABASE_URL` | web | no | GitHub Environment variable, read by the deploy command at build time |
| `VITE_SUPABASE_ANON_KEY` | web | no (public by design) | GitHub Environment variable |
| `VITE_API_URL` | web | no | GitHub Environment variable |
| `VITE_STATUS_URL` | web | no | GitHub Environment variable: the public Instatus page opened by the unreachable banner |
| `VITE_FARO_URL` | web | no (public by design: the Faro collector URL) | GitHub Environment variable. Unset: Faro is off. Its origin is added to the CSP's `connect-src` |
| `VITE_{LOCAL,STAGING,PRODUCTION}_{SUPABASE_URL,SUPABASE_ANON_KEY,API_URL}` | devtools | no (public, like web's) | `devtools/.env.local` on the admin's computer only. Never a database URL or service-role key: the Admin page signs in as the admin |
| `VITE_{LOCAL,STAGING,PRODUCTION}_QA_ACCOUNT_DOMAIN` | `scripts/qa-accounts.mjs` | no | `devtools/.env.local` on the admin's computer. Domain used for the seven QA email addresses; local defaults to `example.test` |

`VITE_*` values are bundled into the client, so anyone can read them. Never put a secret in a `VITE_*` variable.

## 2. CI and operator secrets

The repository is public. Pull requests from forks run CI with a read-only token and **no secrets or environment variables from GitHub Environments**; jobs that need them run only for branches in this repository ([security-model.md](./security-model.md#7-public-repository)). Never add a workflow path that hands a secret to a fork's code.

The deploy settings below (owner URLs, Fly and Vercel values, `VITE_*`, `GAME_SOCKET_ORIGIN`, the version URLs) have **two copies with one owner**: the GitHub Environment, read by `deploy.yml`, and Wyatt Garner's password manager, one entry per environment, read into a shell only to [deploy without Actions](../operations/deployment.md#deploying-without-actions). Both use the same names (`mise run deploy -- --help`). Never put them in a file: the deploy command reads only the process environment and never creates or reads an `.env` for staging or production. Rotation (section 3) updates both copies.

| Name | Kind | Location | Used by |
|---|---|---|---|
| `PROD_SUPABASE_DB_OWNER_URL` | secret | GitHub Environment `production` | the deploy command's migrations; `load-clues.yml`; `rate-clues.yml` |
| `STAGING_SUPABASE_DB_OWNER_URL` | secret | GitHub Environment `staging` | the deploy command's migrations; `load-clues.yml`; `rate-clues.yml` |
| `FLY_API_TOKEN_API`, `FLY_API_TOKEN_GAME` | secrets | GitHub Environments `staging` and `production`, each with that environment's per-app deploy token (`fly tokens create deploy -a {app}`) | The deploy command |
| `VERCEL_TOKEN` | secret | GitHub Environments `staging` and `production` | The deploy command |
| `FLY_APP_API`, `FLY_APP_GAME` | variables | GitHub Environments: `schmegettes-{api,game}-staging` / `-prod` | The deploy command |
| `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` | variables | GitHub Environments (from the Vercel project's settings) | The deploy command |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_URL`, `VITE_STATUS_URL` | variables (public) | GitHub Environments | The deploy command's web build |
| `GAME_SOCKET_ORIGIN` | variable (public) | GitHub Environments: `wss://schmegettes-game-{staging,prod}.fly.dev` | The deploy command, the web CSP's `connect-src` |
| `E2E_HOST_EMAIL` | variable (not secret) | GitHub Environment `staging` (**not set yet**): the E2E host account ([testing-strategy.md](../engineering/testing-strategy.md#6-end-to-end)) | `e2e.yml` |
| `E2E_HOST_PASSWORD` | secret | GitHub Environment `staging` (**not set yet**) | `e2e.yml` |
| `VITE_ENV` | build value (not secret) | Set by the deploy command to the environment name; unset locally. `staging` allows E2E mode; any other value compiles it out | web build |
| `WEB_VERSION_URL`, `API_VERSION_URL`, `GAME_VERSION_URL` | variables (not secret) | GitHub Environments `staging` / `production`: the web `/version.json` (primary domain) and the api and game `/version` URLs | The deploy command's deployed-commit check |
| `OTEL_EXPORTER_OTLP_ENDPOINT`, `VITE_FARO_URL`, `GRAFANA_URL` | variables | GitHub Environments `staging` and `production` | The deploy command (Fly telemetry secrets, the web build and CSP, the deploy annotation) |
| `OTEL_EXPORTER_OTLP_HEADERS`, `GRAFANA_ANNOTATION_TOKEN` | secrets | GitHub Environments `staging` and `production` | The deploy command. Each telemetry step is skipped when its values are unset |
| Grafana Terraform values | secrets and variables | GitHub Environment `grafana` only (section 4) | `grafana.yml` |
| `STAGING_ANTHROPIC_API_KEY` | secret | GitHub Environment `staging` (**not set yet**) | `rate-clues.yml` |
| `PROD_ANTHROPIC_API_KEY` | secret | GitHub Environment `production` (**not set yet**) | `rate-clues.yml` |
| `ANTHROPIC_API_KEY` | secret | repo secret (**not set yet**) | `ci.yml` evals job |

## 3. Owners and rotation

Owner of every secret: **Wyatt Garner**.

A secret found by a scan (`ci.yml`'s gitleaks job, GitHub secret scanning, or `scripts/history-scan.sh`) is treated as leaked once it is in a pushed commit: rotate it with the steps below, then remove it from the branch. Rewriting published history doesn't un-leak it.

| Secret | How to rotate |
|---|---|
| `app_service` password (`DATABASE_URL`) | In each Supabase project, `alter role app_service with login password '<new>';`. Then `fly secrets set DATABASE_URL=… -a {app}` on that environment's api and game apps (setting a secret restarts the app). |
| Owner database URL (`DATABASE_OWNER_URL`, `PROD_SUPABASE_DB_OWNER_URL`, `STAGING_SUPABASE_DB_OWNER_URL`) | Reset the database password in the Supabase dashboard. Update the worker's secret, the GitHub Environment secret and the password-manager copy. |
| Fly deploy tokens (`FLY_API_TOKEN_API`, `FLY_API_TOKEN_GAME`) | `fly tokens create deploy -a {app}`, update the GitHub Environment secret and the password-manager copy, then revoke the old one (`fly tokens list -a {app}`, `fly tokens revoke {id}`). |
| `VERCEL_TOKEN` | Create a new token in Vercel account settings (scoped to the team), update both GitHub Environment secrets and both password-manager copies, then delete the old token. |
| Supabase JWT signing keys | Rotate in Supabase (asymmetric signing keys). No redeploy: `golib/auth` caches the JWKS and refetches it when a token names a key it hasn't seen. Revoke the old key once tokens signed with it have expired. |
| `REDIS_URL` credentials | Rotate in the Redis provider, then update the game's secret and restart it. |
| `ANTHROPIC_API_KEY`, `STAGING_ANTHROPIC_API_KEY`, `PROD_ANTHROPIC_API_KEY` | Create a new key in the Anthropic console, update the secret where that key is kept (`worker/.env`, the GitHub Environment, or the repo secret), then revoke the old key. |
| `OTEL_EXPORTER_OTLP_HEADERS` | Create a new access-policy token (`metrics:write`, `logs:write`, `traces:write`) in the Grafana Cloud stack, update the GitHub Environment secret in both environments and the password-manager copies, deploy api and game (the deploy stages the new value), then delete the old token. |
| `GRAFANA_ANNOTATION_TOKEN` | Add a new token to the annotations service account, update both GitHub Environment secrets and the password-manager copies, then delete the old token. |
| `GRAFANA_TF_TOKEN`, `GRAFANA_SM_TOKEN` | Create a new token (Terraform service account; Synthetic Monitoring config), update the `grafana` environment secret, run Grafana apply on `develop`, then delete the old token. |
| `TF_API_TOKEN` | Create a new HCP Terraform team or user token, update the `grafana` environment secret, run Grafana apply, then revoke the old one. |
| `ALERT_EMAIL` | Update the `grafana` environment secret and run Grafana apply. Send the contact point's test (observability.md, "Test alert"). |
| `STATUS_PAGE_API_TOKEN` | Create a replacement Instatus key scoped to the page, set it with `fly secrets set STATUS_PAGE_API_TOKEN=… -a {api-app}`, confirm a notice sync, then revoke the old key. Free-plan keys expire after at most 90 days. |

Rotate a secret:

- when someone with access to it leaves
- on any suspected exposure. A secret committed to git is exposed even after the file is deleted, because git history keeps it.

Prefer short-lived tokens over long-lived ones. Don't write a new secret version on every read or token refresh: secret stores bill per version and per access.

## 4. Observability credentials

Setup, step by step: [observability.md §1](../operations/observability.md#1-setting-up-a-stack). Three kinds, kept apart:

- **Shipping credentials:** `OTEL_EXPORTER_OTLP_ENDPOINT` and `OTEL_EXPORTER_OTLP_HEADERS`, runtime config for api and game. The deploy command stages them as Fly secrets from the GitHub Environment, passing values on stdin, never in arguments or logs.
- **The Faro collector URL** (`VITE_FARO_URL`): public-safe by design and bundled into `web`.
- **Operator and CI tokens:** not app config. `GRAFANA_ANNOTATION_TOKEN` (annotations only) lives in the `staging` and `production` environments for the deploy command. The Terraform values live only in the protected GitHub Environment **`grafana`**, whose deployment branches are `develop` only, so only `grafana.yml`'s apply job on `develop` can read them:

| Name | Kind | Used by |
|---|---|---|
| `GRAFANA_URL` | variable | The Terraform provider |
| `GRAFANA_TF_TOKEN` | secret | The Terraform provider (Editor service account) |
| `GRAFANA_SM_URL`, `GRAFANA_SM_TOKEN` | variable, secret | Synthetic Monitoring checks |
| `TF_API_TOKEN` | secret | HCP Terraform (state and locking only) |
| `TF_CLOUD_ORGANIZATION`, `TF_WORKSPACE` | variables | The `cloud {}` block |
| `ALERT_EMAIL` | secret | The contact point. Never committed |
| `HEALTH_TARGETS` | variable | The uptime checks' URLs (JSON per environment) |

## 5. Config switches

Every risky feature and every external integration gets a switch that turns it off without a deploy. A switch is an environment variable; a restart picks up a new value ([stack.md](../engineering/stack.md), "Config switch mechanism").

| Switch | Default | Turning it off | Who may change it | Command |
|---|---|---|---|---|

**None yet.** The first expected switch is for the LLM appeal judge in `worker/` (**Not yet implemented**). Add its row in the same PR that builds it.

Rules:

- **Document each switch** in the table above: name, default, what turning it off does, who may change it, and the one-line command (set the variable, then restart).
- **Roll out enforcement in stages.** First count the requests a new rule would reject. Turn enforcement on once that count has stayed at zero.
- **Remove a switch** once its feature is stable. Each switch is an extra code path to test.

## 6. Never

- Secrets in `.claude/settings*.json`, commits, a committed `.env`, or CI logs.
- Approvals for commands that carry a token go in `.claude/settings.local.json` (git-ignored). Better: the token comes from the environment.
