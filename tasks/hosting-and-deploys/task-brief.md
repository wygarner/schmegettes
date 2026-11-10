---
jira-type: improvement
jira-title: "hosting-and-deploys: staging and production on Fly.io and Vercel"
---

# Task brief: hosting-and-deploys

No product brief: this task makes no product decisions. Hosting was decided on 2026-11-10: **Fly.io** for `api` and `game`, **Vercel** for `web`, **Supabase** for the database (already decided). Staging and production are set up together.

## Goal

A merge to `develop` deploys to staging, and a merge to `production` deploys to production. Both follow the deploy contract in `docs/system-docs/operations/deployment.md`: build from the merged commit, run migrations first, health-check, check each component's reported commit, roll back with one command.

## Out of scope

- Redis (no service uses it yet) and a long-running worker process (the worker is only the `import-clues` CLI, run by `load-clues.yml`).
- Grafana, alerting, uptime checks, off-account backups.
- Custom domains. The task works on the default `*.fly.dev` and `*.vercel.app` hostnames. Every URL comes from configuration, so adding a domain later means changing configuration only, not code.
- Running more than one `game` instance (needs room ownership in Redis, a later task).

## Prerequisites (owner: Wyatt Garner, in each provider's dashboard)

These need accounts and billing. The implementation can merge before they exist. Deploys fail until they are done.

| # | Provider | Staging | Production |
|---|---|---|---|
| 1 | Supabase | Project `schmegettes-staging` | Project `schmegettes-prod` |
| 2 | Supabase | Auth settings from deployment.md "Supabase Auth settings"; asymmetric JWT signing keys on (services verify against JWKS) | Same |
| 3 | Supabase | `alter role app_service with login password '…'` **after** the first migration run (the role is created by a migration) | Same |
| 4 | Fly.io | Apps `schmegettes-api-staging`, `schmegettes-game-staging` | Apps `schmegettes-api-prod`, `schmegettes-game-prod` |
| 5 | Fly.io | `fly secrets set` per app (see "Runtime configuration") | Same |
| 6 | Fly.io | One deploy token per app: `fly tokens create deploy -a {app}` | Same |
| 7 | Vercel | Project `schmegettes-web-staging`; Git integration **disconnected** (CI is the only deployer) | Project `schmegettes-web-prod`, same |
| 8 | Vercel | Deployment Protection off for production deployments of the staging project if testers need access without a Vercel login | — |
| 9 | GitHub | Environment `staging` (new) with the secrets and variables below | Environment `production` (exists, empty) |

## Runtime configuration

### Fly secrets per app (set by hand with `fly secrets set`, never in CI or the repo)

| Name | api | game | Value |
|---|---|---|---|
| `DATABASE_URL` | yes | yes | Supabase **transaction pooler** URI (port 6543) as `app_service`, with `?default_query_exec_mode=simple_protocol` appended. pgx caches prepared statements by default, and the transaction pooler can't serve them. The parameter turns the cache off without a code change |
| `SUPABASE_URL` | yes | yes | Project URL |
| `SUPABASE_JWKS_URL` | yes | yes | `{SUPABASE_URL}/auth/v1/.well-known/jwks.json` |
| `ALLOWED_ORIGINS` | yes | yes | The web origin, e.g. `https://schmegettes-web-prod.vercel.app` |
| `GAME_SOCKET_BASE_URL` | yes | — | `wss://schmegettes-game-{env}.fly.dev` |

Not secret, so set in `fly.toml` `[env]` or by `fly deploy --env`: `PORT`, `APP_ENV` (`staging` / `production`), `LOG_LEVEL=info`.

### GitHub Environment secrets and variables (`staging` and `production`)

| Name | Kind | Used by |
|---|---|---|
| `{STAGING,PROD}_SUPABASE_DB_OWNER_URL` | secret | migrate job, `load-clues.yml` (names already documented) |
| `FLY_API_TOKEN_API`, `FLY_API_TOKEN_GAME` | secret | deploy job |
| `VERCEL_TOKEN` | secret | deploy job |
| `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` | variable | deploy job |
| `FLY_APP_API`, `FLY_APP_GAME` | variable | deploy job |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_URL`, `GAME_SOCKET_ORIGIN` | variable (public: bundled into the client or written into a header) | web build and CSP |
| `{STAGING,PROD}_VERSION_URLS` | variable | verify job |

## Subtasks

### 1. `api/` and `game/`: container images and Fly config

- `api/Dockerfile`, `game/Dockerfile`. **Build context is the repo root**, because both modules `replace schmegettes/golib => ../golib`. Multi-stage: `golang` builder (version from `go.mod`), `CGO_ENABLED=0`, `-ldflags "-X main.commit=${GIT_SHA}"`. Runtime: distroless static, non-root.
- Root `.dockerignore`: `node_modules`, `web/dist*`, `devtools`, `worker`, `docs`, `tasks`, `releases`, `.git`.
- `api/fly.toml`:
  - `internal_port = 3001`, `force_https = true`
  - `[[http_service.checks]]` on `GET /healthz`
  - `kill_signal = "SIGTERM"`, `kill_timeout = "15s"` (api drains for 10 s)
  - `min_machines_running = 1`, rolling deploy strategy
- `game/fly.toml`:
  - `internal_port = 3002`, `/healthz` check
  - `kill_timeout = "30s"` (the game drains for up to 20 s)
  - `auto_stop_machines = "off"`, `min_machines_running = 1`
  - **Exactly one machine** (`fly scale count 1`, recorded in the deployment doc). Rooms live on one instance until room ownership exists.
  - Deploy strategy `immediate`. Never bluegreen: two instances at once would split rooms. A deploy costs players a reconnect, and the game resumes from Postgres (realtime-game-server.md, "Current state").
- One `fly.toml` per service, not per environment. CI passes `--app` and `--env APP_ENV=…`.

**Key files:** `api/Dockerfile`, `game/Dockerfile`, `api/fly.toml`, `game/fly.toml`, `.dockerignore`

**Risk to check on staging:** the game server sends no WebSocket pings (`game/internal/socket`). If Fly's proxy closes a socket idle for a long time (for example, a lobby left waiting), add a server ping every 30 s in `game/internal/socket` with a test. That would be the only Go code change in this task.

### 2. `web/`: Vercel build output with security headers

- `web/scripts/vercel-output.mjs`: after `bun run --cwd web build`, writes `.vercel/output/` (Vercel Build Output API v3). `static/` is a copy of `web/dist`. `config.json` contains:
  - **SPA fallback:** `{ "handle": "filesystem" }`, then every other path to `/index.html`. `/version.json` and assets are served as files, never as the fallback.
  - **Headers on every response:**
    - `Content-Security-Policy`, built from the environment: `default-src 'self'`; `connect-src 'self' {VITE_SUPABASE_URL} {VITE_API_URL} {GAME_SOCKET_ORIGIN}`; `script-src 'self'`; `style-src 'self' 'unsafe-inline'` (only if Mantine's runtime styles need it; prove it in the test); `img-src 'self' data:`; `font-src 'self'`; `frame-ancestors 'none'`; `base-uri 'self'`; `object-src 'none'`
    - `Strict-Transport-Security: max-age=63072000; includeSubDomains`
    - `X-Content-Type-Options: nosniff`
    - `Referrer-Policy: strict-origin-when-cross-origin`
    - `Permissions-Policy: microphone=(self)`, because voice input uses the microphone
  - **Cache:** `Cache-Control: no-store` on `/index.html` and `/version.json`; immutable caching on `/assets/*`.
- The script exits non-zero if any input value is missing or not an `https:`/`wss:` origin, so a misconfigured environment fails the build instead of shipping a broken CSP.
- Audit `web/src` for any other origin the client contacts (fonts are self-hosted; Supabase JS is used for auth only) and list each one in the CSP.

**Key files:** `web/scripts/vercel-output.mjs`, `web/scripts/vercel-output.test.ts`

### 3. GitHub Actions: one reusable deploy, two triggers

- `.github/workflows/deploy.yml` (`workflow_call`, input `environment: staging | production`) holds the three existing jobs, with real steps:
  - **migrate:** unchanged, reads `secrets.{ENV}_SUPABASE_DB_OWNER_URL` for the input environment.
  - **deploy** (needs migrate), three parallel jobs:
    - **api:** `flyctl deploy --config api/fly.toml --dockerfile api/Dockerfile --app $FLY_APP_API --remote-only --build-arg GIT_SHA=$GITHUB_SHA --env APP_ENV=…`. Fly waits for the `/healthz` check.
    - **game:** same shape with the game files.
    - **web:** `bun install --frozen-lockfile`, `mise run gen` if web needs generated code, `GIT_SHA=$GITHUB_SHA bun run --cwd web build`, `node web/scripts/vercel-output.mjs`, then `vercel deploy --prebuilt --prod --token $VERCEL_TOKEN`.
  - **verify:** unchanged logic, reads `vars.{ENV}_VERSION_URLS`.
- `deploy-prod.yml`: `on: push: production` plus `workflow_dispatch`, calls `deploy.yml` with `production`. Keep the `if: github.ref == 'refs/heads/production'` guard.
- `deploy-staging.yml` (new): `on: push: develop` plus `workflow_dispatch`, calls `deploy.yml` with `staging`. Concurrency group `deploy-staging`, no cancel-in-progress.
- Pin every new action by commit SHA, as `deploy-prod.yml` already does. Install `flyctl` and `vercel` at exact versions (through mise `[tools]` if the repo pins CLIs there).
- Nothing echoes a secret. Deploy tokens go only through `env:`.

**Key files:** `.github/workflows/deploy.yml`, `.github/workflows/deploy-prod.yml`, `.github/workflows/deploy-staging.yml`, `mise.toml`

### 4. Docs

| Doc | Change |
|---|---|
| `docs/system-docs/operations/deployment.md` | Host and Deploy mode columns filled in; staging deploy described; game single-machine rule; pooler URL parameter; prerequisite checklist; Vercel Git integration off |
| `docs/system-docs/operations/release-strategy.md` | Rollback table: Fly (`fly releases` to find the previous image, then `fly deploy -a {app} --image {image}`) and Vercel (`vercel rollback`), checked against the current CLIs; staging rehearsal now real |
| `docs/system-docs/engineering/stack.md` | Hosting row decided 2026-11-10 |
| `docs/system-docs/security/configuration-and-secrets.md` | Every new secret and variable; `STAGING_SUPABASE_DB_OWNER_URL` no longer "not set yet"; rotation rows for Fly and Vercel tokens |
| `docs/system-docs/security/security-model.md` | Web security headers row points at the script and its test |
| `docs/system-docs/engineering/development-workflow.md` | Workflow table gains `deploy.yml` and `deploy-staging.yml` |

## Contracts preserved

No change to `shared/` (OpenAPI, protocol, job schemas), the database schema, or any API or socket behavior. `/healthz` and `/version` already exist on `api` and `game`, and `web` already writes `/version.json`. The only possible runtime change is the WebSocket ping in subtask 1, which is protocol-level framing and not a message in `shared/schemas/protocol/`.

## Database migration plan

None. The migrate job already exists. The first staging run applies every migration to the empty staging database, which is the first real rehearsal of the production migration run.

## Success criteria

1. A push to `develop` runs `deploy-staging.yml`: migrate, deploy and verify all pass, and every staging component reports that commit.
2. A push to `production` runs `deploy-prod.yml` with the same three jobs. The placeholder that fails on purpose is gone.
3. `curl -sI` on the staging web origin shows CSP, HSTS, nosniff, Referrer-Policy and Permissions-Policy. A deep link (`/room/ABCD`) serves `index.html`; `/version.json` serves JSON.
4. On staging, a manual smoke test of the critical paths passes: sign in (guest and email/password), create room, join by code from a second device, buzz, judge, finish a game. The browser console shows no CSP violations.
5. Restarting `schmegettes-game-staging` mid-game: clients reconnect and the game resumes paused on the active clue.
6. A lobby socket left idle for 10 minutes stays open (or the ping in subtask 1 is added and it then does).
7. Rolling back one Fly app and the Vercel project with the documented commands works on staging.
8. `load-clues.yml` with `environment: staging` loads seasons `1-40`.

## Test plan

| Package | Test | Command |
|---|---|---|
| web | `web/scripts/vercel-output.test.ts`: the headers are present on `/(.*)`; CSP `connect-src` contains exactly the configured origins; missing or `http:` input fails; the SPA fallback comes after the filesystem handler; no-store on `index.html` and `version.json` | `mise run test:web -- scripts/vercel-output.test.ts` |
| game (only if the ping is added) | Socket test: server pings on an interval, and a client that stops answering is closed | `mise run test:game -- ./internal/socket/...` |
| images | Both images build from the repo root and the binaries report the build arg | `docker build -f api/Dockerfile --build-arg GIT_SHA=test .` (and game); `docker run` then `curl /version` shows `"commit":"test"` |
| workflows | Lint the new and changed workflows | `actionlint` on the three files, if installed |

Staging itself is the end-to-end test (success criteria 1 to 8). No full suite locally.

## Logging requirements

No service log changes. Workflow logs never contain the owner URL, Fly or Vercel tokens, or the anon key echoed by a debug step. `fly deploy` and `vercel deploy` output is fine. `LOG_LEVEL=info` in both deployed environments, so no answers are logged (logged only at `debug`).

## Order of rollout after merge

1. Wyatt completes prerequisites 1, 2, 4 and 7 to 9.
2. Dispatch `deploy-staging.yml`. Migrate runs; deploy fails until step 3.
3. Run prerequisite 3 (`app_service` password) and set the Fly secrets (prerequisite 5) with that password in `DATABASE_URL`. Re-run the staging deploy.
4. Run `load-clues.yml` on staging. Create a host code (deployment.md, "Host access after a release"). Check success criteria 3 to 8.
5. Production: the same prerequisites, then release 0.1.0 through the normal release process.
