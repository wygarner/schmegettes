# Configuration and Secrets

**Source of truth:** `api/.env.example`, `game/.env.example`, `web/.env.example`, `worker/.env.example`, `.github/workflows/deploy-prod.yml`, `.github/workflows/ci.yml`

Every variable each package reads, where it lives, who owns each secret and how to rotate it, and the config switches. Hosting is not chosen yet ([stack.md](../engineering/stack.md)), so "host secret store" means whichever host runs that component.

## 1. Variables per package

Each package's `.env.example` lists its variables with placeholder values. Local `.env` files are git-ignored and point at local Supabase only.

| Variable | Package(s) | Secret | Production location |
|---|---|---|---|
| `PORT` | api, game | no | host config |
| `APP_ENV` | api, game, worker | no | host config |
| `LOG_LEVEL` | api, game, worker | no | host config |
| `DATABASE_URL` | api, game, worker | **yes** (the `app_service` password) | host secret store |
| `DATABASE_OWNER_URL` | worker | **yes** (owner role, bypasses RLS) | host secret store. For the worker's import jobs only, which are not built yet |
| `SUPABASE_URL` | api, game | no | host config |
| `SUPABASE_JWKS_URL` | api, game | no (public keys) | host config |
| `ALLOWED_ORIGINS` | api, game | no | host config |
| `GAME_SOCKET_BASE_URL` | api | no | host config |
| `REDIS_URL` | game | **yes** | host secret store. Listed in `game/.env.example` but not read yet: no service uses Redis |
| `CLUE_DATASET_BASE_URL` | worker | no | host config |
| `ANTHROPIC_API_KEY` | worker | **yes** | host secret store. Not read yet: the LLM judge is not built |
| `VITE_SUPABASE_URL` | web | no | web host build config |
| `VITE_SUPABASE_ANON_KEY` | web | no (public by design) | web host build config |
| `VITE_API_URL` | web | no | web host build config |

`VITE_*` values are bundled into the client, so anyone can read them. Never put a secret in a `VITE_*` variable.

## 2. CI and operator secrets

| Name | Kind | Location | Used by |
|---|---|---|---|
| `PROD_SUPABASE_DB_OWNER_URL` | secret | GitHub Environment `production` | `deploy-prod.yml` migrations |
| `PROD_VERSION_URLS` | variable (not secret) | GitHub Environment `production` | `deploy-prod.yml` deployed-commit check |
| `JIRA_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN` | secrets | repo secrets (**not set yet**: Jira is not configured) | `create-jira-ticket.yml`, `jira-transitions.yml` |
| `ANTHROPIC_API_KEY` | secret | repo secret (**not set yet**) | `ci.yml` evals job |

## 3. Owners and rotation

Owner of every secret: **Wyatt Garner**.

| Secret | How to rotate |
|---|---|
| `app_service` password (`DATABASE_URL`) | In each Supabase project, `alter role app_service with login password '<new>';`. Then update `DATABASE_URL` in every host's secret store and restart api, game, and worker. |
| Owner database URL (`DATABASE_OWNER_URL`, `PROD_SUPABASE_DB_OWNER_URL`) | Reset the database password in the Supabase dashboard. Update the worker's secret and the GitHub Environment secret. |
| Supabase JWT signing keys | Rotate in Supabase (asymmetric signing keys). No redeploy: `golib/auth` caches the JWKS and refetches it when a token names a key it hasn't seen. Revoke the old key once tokens signed with it have expired. |
| `REDIS_URL` credentials | Rotate in the Redis provider, then update the game's secret and restart it. |
| `ANTHROPIC_API_KEY` | Create a new key in the Anthropic console, update the worker's secret and the repo secret, then revoke the old key. |
| `JIRA_API_TOKEN` | Create a new Atlassian API token, update the repo secret, then revoke the old token. |

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
