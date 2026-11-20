# Configuration and Secrets

**Source of truth:** `api/.env.example`, `game/.env.example`, `web/.env.example`, `worker/.env.example`, `api/fly.toml`, `game/fly.toml`, `.github/workflows/deploy.yml`, `.github/workflows/ci.yml`

Every variable each package reads, where it lives, who owns each secret and how to rotate it, and the config switches. `api` and `game` run on Fly.io: "Fly secret" means `fly secrets set` on that app (staging and production apps each have their own), and "`fly.toml`" means the value is in the repo or passed by the deploy. `web` runs on Vercel, but its values are built in by CI from the GitHub Environment, not set in Vercel.

## 1. Variables per package

Each package's `.env.example` lists its variables with placeholder values. Local `.env` files are git-ignored and point at local Supabase only.

| Variable | Package(s) | Secret | Production location |
|---|---|---|---|
| `PORT` | api, game | no | `fly.toml` `[env]` |
| `APP_ENV` | api, game, worker | no | api, game: set by `deploy.yml` (`staging` / `production`); worker: `load-clues.yml` |
| `LOG_LEVEL` | api, game, worker | no | `fly.toml` `[env]` (`info`) |
| `DATABASE_URL` | api, game, worker | **yes** (the `app_service` password) | Fly secret. The Supabase transaction pooler URI (port 6543) as `app_service`, ending `?default_query_exec_mode=simple_protocol` ([deployment.md](../operations/deployment.md#database-roles-per-environment)) |
| `DATABASE_OWNER_URL` | worker | **yes** (owner role, bypasses RLS) | Only for `import-clues`. Local: `worker/.env`. Staging and production: never on a laptop; `load-clues.yml` reads the GitHub Environment secrets below |
| `SUPABASE_URL` | api, game | no | Fly secret (not secret, kept with the rest) |
| `SUPABASE_JWKS_URL` | api, game | no (public keys) | Fly secret: `{SUPABASE_URL}/auth/v1/.well-known/jwks.json` |
| `ALLOWED_ORIGINS` | api, game | no | Fly secret: the web origin, e.g. `https://schmegettes-web-prod.vercel.app`. The api's also includes `http://localhost:5174`, so the devtools Admin page can call it |
| `GAME_SOCKET_BASE_URL` | api | no | Fly secret: `wss://schmegettes-game-{staging,prod}.fly.dev` |
| `REDIS_URL` | game | **yes** | host secret store. Listed in `game/.env.example` but not read yet: no service uses Redis |
| `CLUE_DATASET_BASE_URL` | worker | no | `worker/.env`; in `load-clues.yml`, the optional repo variable `CLUE_DATASET_BASE_URL` (defaults to the dataset URL) |
| `ANTHROPIC_API_KEY` | worker | **yes** | host secret store. Not read yet: the LLM judge is not built |
| `VITE_SUPABASE_URL` | web | no | GitHub Environment variable, read by `deploy.yml` at build time |
| `VITE_SUPABASE_ANON_KEY` | web | no (public by design) | GitHub Environment variable |
| `VITE_API_URL` | web | no | GitHub Environment variable |
| `VITE_{LOCAL,STAGING,PRODUCTION}_{SUPABASE_URL,SUPABASE_ANON_KEY,API_URL}` | devtools | no (public, like web's) | `devtools/.env.local` on the admin's computer only. Never a database URL or service-role key: the Admin page signs in as the admin |

`VITE_*` values are bundled into the client, so anyone can read them. Never put a secret in a `VITE_*` variable.

## 2. CI and operator secrets

| Name | Kind | Location | Used by |
|---|---|---|---|
| `PROD_SUPABASE_DB_OWNER_URL` | secret | GitHub Environment `production` | `deploy.yml` migrations; `load-clues.yml` |
| `STAGING_SUPABASE_DB_OWNER_URL` | secret | GitHub Environment `staging` | `deploy.yml` migrations; `load-clues.yml` |
| `FLY_API_TOKEN_API`, `FLY_API_TOKEN_GAME` | secrets | GitHub Environments `staging` and `production`, each with that environment's per-app deploy token (`fly tokens create deploy -a {app}`) | `deploy.yml` |
| `VERCEL_TOKEN` | secret | GitHub Environments `staging` and `production` | `deploy.yml` |
| `FLY_APP_API`, `FLY_APP_GAME` | variables | GitHub Environments: `schmegettes-{api,game}-staging` / `-prod` | `deploy.yml` |
| `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` | variables | GitHub Environments (from the Vercel project's settings) | `deploy.yml` |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_URL` | variables (public) | GitHub Environments | `deploy.yml` web build |
| `GAME_SOCKET_ORIGIN` | variable (public) | GitHub Environments: `wss://schmegettes-game-{staging,prod}.fly.dev` | `deploy.yml`, the web CSP's `connect-src` |
| `STAGING_VERSION_URLS`, `PROD_VERSION_URLS` | variables (not secret) | GitHub Environment `staging` / `production`: the web `/version.json` and the api and game `/version` URLs, space-separated | `deploy.yml` deployed-commit check |
| `ANTHROPIC_API_KEY` | secret | repo secret (**not set yet**) | `ci.yml` evals job |

## 3. Owners and rotation

Owner of every secret: **Wyatt Garner**.

| Secret | How to rotate |
|---|---|
| `app_service` password (`DATABASE_URL`) | In each Supabase project, `alter role app_service with login password '<new>';`. Then `fly secrets set DATABASE_URL=… -a {app}` on that environment's api and game apps (setting a secret restarts the app). |
| Owner database URL (`DATABASE_OWNER_URL`, `PROD_SUPABASE_DB_OWNER_URL`, `STAGING_SUPABASE_DB_OWNER_URL`) | Reset the database password in the Supabase dashboard. Update the worker's secret and the GitHub Environment secret. |
| Fly deploy tokens (`FLY_API_TOKEN_API`, `FLY_API_TOKEN_GAME`) | `fly tokens create deploy -a {app}`, update the GitHub Environment secret, then revoke the old one (`fly tokens list -a {app}`, `fly tokens revoke {id}`). |
| `VERCEL_TOKEN` | Create a new token in Vercel account settings (scoped to the team), update both GitHub Environment secrets, then delete the old token. |
| Supabase JWT signing keys | Rotate in Supabase (asymmetric signing keys). No redeploy: `golib/auth` caches the JWKS and refetches it when a token names a key it hasn't seen. Revoke the old key once tokens signed with it have expired. |
| `REDIS_URL` credentials | Rotate in the Redis provider, then update the game's secret and restart it. |
| `ANTHROPIC_API_KEY` | Create a new key in the Anthropic console, update the worker's secret and the repo secret, then revoke the old key. |

Rotate a secret:

- when someone with access to it leaves
- on any suspected exposure. A secret committed to git is exposed even after the file is deleted, because git history keeps it.

Prefer short-lived tokens over long-lived ones. Don't write a new secret version on every read or token refresh: secret stores bill per version and per access.

## 4. Observability credentials

**Not yet implemented** (see [stack.md](../engineering/stack.md)). When telemetry ships, keep three kinds apart:

- **Shipping credentials** (Grafana Cloud OTLP): runtime config for api, game, and worker, in each host's secret store.
- **The Grafana Faro collector key**: public-safe by design and bundled into `web`.
- **Operator and CI tokens** (alert provisioning, source-map upload, read-only telemetry access for automation): not app config. Kept in CI secrets or with the operator only.

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
