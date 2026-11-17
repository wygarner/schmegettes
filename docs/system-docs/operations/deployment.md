# Deployment and Environments

**Source of truth:** `.github/workflows/deploy.yml` (called by `deploy-staging.yml` and `deploy-prod.yml`), `api/fly.toml`, `game/fly.toml`, `web/scripts/vercel-deploy.mjs`

Hosting was decided on 2026-11-10: **Fly.io** for `api` and `game`, **Vercel** for `web`, **Supabase** for the database. A push to `develop` deploys staging (`deploy-staging.yml`) and a push to `production` deploys production (`deploy-prod.yml`). Both run the same jobs (`deploy.yml`). Custom domains are not set up yet: every URL below is the provider's default hostname and comes from configuration, so adding a domain changes configuration only.

## Environments

| Environment | Source branch | Purpose |
|---|---|---|
| Local | any | Developer machines; local Supabase only |
| Staging | `develop` | Integration testing, migration rehearsal, release verification |
| Production | `production` | Players |

Staging and production are separate projects with every provider: two Supabase projects, two Redis instances, separate hosting projects and secret stores. A wrong local `.env` then cannot reach production data.

## Components

| Component | Requirement | Host | Deploy mode |
|---|---|---|---|
| web | Static/edge host, SPA fallback to `index.html`, CSP + HSTS headers, serves `/version.json` | Vercel (`schmegettes-web-staging`, `schmegettes-web-prod`) | CI builds the bundle; `web/scripts/vercel-deploy.mjs` uploads it with a `vercel.json` (headers, fallback) through Vercel's REST API and waits for the production deployment. No Vercel CLI: the job holding the token runs no npm packages. The projects' Git integration is off |
| api | Runs a build of an exact commit; pre-release step not needed (migrations run in CI); health check on `/healthz`; horizontal scaling | Fly.io (`schmegettes-api-staging`, `schmegettes-api-prod`) | `flyctl deploy` from CI, image built on Fly's remote builder and labelled with the commit; rolling, waits for `/healthz` |
| game | Long-lived WebSockets (no request timeout under 1 h), graceful SIGTERM with ≥20 s drain, sticky sessions not required. **One instance** until room ownership exists | Fly.io (`schmegettes-game-staging`, `schmegettes-game-prod`) | `flyctl deploy --ha=false` from CI; one machine, replaced in place, waits for `/healthz`; `kill_timeout` 30 s |
| worker | Same commit as the others, separate process, no inbound traffic | None yet: the worker is only the `import-clues` command, run by `load-clues.yml`. **Not yet implemented:** a long-running worker process | — |
| Database | Supabase (managed, backups, point-in-time restore, TLS); pooler connection for services | Supabase | `deploy-prod.yml` runs `supabase db push` |
| Redis | Managed, private network or TLS + auth | None yet: no service uses Redis | — |
| Secrets | Fly secrets per app (set by hand); GitHub Environments `staging` and `production` for CI | — | — |

Each environment is built from its own branch's commit, so staging and production never share an image: a release merge commit on `production` is a different commit from anything on `develop`.

### game runs on one machine

Rooms live in one `game` process until room ownership in Redis exists ([realtime-game-server.md](../architecture/realtime-game-server.md)). So `game` runs on exactly one Fly machine: `--ha=false` on deploy, `auto_stop_machines = "off"`, and never `fly scale count` above 1. A rolling deploy of one machine replaces it in place, so two instances never split rooms. Never switch it to bluegreen or canary. A deploy costs players a reconnect; the game resumes from Postgres.

## The deploy contract

Every deploy, staging and production, in order:

1. **Builds from the pushed commit** (`develop` for staging, the merge commit on `production` for production). Nothing built from a local checkout reaches an environment. Each build gets `GIT_SHA`.
2. **Runs migrations before new code takes traffic.** `deploy.yml`'s `migrate` job, against that environment's database, as the owner role. On staging this is the rehearsal for the next release.
3. **Health-checks the new version** (`/healthz`) before traffic shifts to it.
4. **Verifies the deployed commit.** The last job reads each component's `/version` (web: `/version.json`) from the `STAGING_VERSION_URLS` or `PROD_VERSION_URLS` environment variable and fails unless every one reports the pushed commit. Without it, a skipped platform deploy looks like a release.
5. **Keeps rollback one command away** (release-strategy.md, "Rollback"). A code rollback does not undo migrations.

## Setting up an environment

Once per environment (staging, then production), by Wyatt Garner. Deploys fail until every step is done, and the failing job names what is missing.

1. **Supabase:** create the project (`schmegettes-staging` / `schmegettes-prod`) in us-east-1, next to Fly's `iad` region set in both `fly.toml` files. Apply the [Supabase Auth settings](#supabase-auth-settings), and turn on asymmetric JWT signing keys (services verify tokens against the JWKS).
2. **Fly.io:** create the two apps (`schmegettes-{api,game}-{staging,prod}`) and a deploy token per app: `fly tokens create deploy -a {app}`.
3. **Vercel:** create the project (`schmegettes-web-staging` / `schmegettes-web-prod`) and disconnect its Git integration, so CI is its only deployer. On the staging project, turn off Deployment Protection for production deployments if testers have no Vercel login.
4. **GitHub:** in the Environment (`staging` / `production`), add the secrets and variables listed in [configuration-and-secrets.md](../security/configuration-and-secrets.md#2-ci-and-operator-secrets).
5. **First deploy:** run the deploy workflow from the Actions tab (Deploy Staging on `develop`). Migrate creates the `app_service` role; the app deploys fail until step 6.
6. **App credentials:** set the `app_service` password ([below](#database-roles-per-environment)), then `fly secrets set` on each app ([configuration-and-secrets.md](../security/configuration-and-secrets.md#1-variables-per-package)). Run the deploy again.
7. **Clues and hosting:** run Load Clues ([below](#loading-the-clue-catalog)) and give out the first host code ([Host access after a release](#host-access-after-a-release)).

Production goes through the same steps, with the first deploy coming from the first release ([release-strategy.md](./release-strategy.md)).

## Database roles per environment

The `app_service` role is created by the first migration without LOGIN. In each Supabase project, once:

```sql
alter role app_service with login password '<generated, stored only in the secret store>';
```

Services connect through the Supabase pooler (transaction mode, port 6543) as `app_service`. Append `?default_query_exec_mode=simple_protocol` to that `DATABASE_URL`: pgx caches prepared statements by default, and the transaction pooler can't serve them. Only `deploy-prod.yml` and `load-clues.yml` hold an owner credential (`*_OWNER_URL`).

## Loading the clue catalog

A new environment has no clues: Start fails until the catalog is loaded. Run **Load Clues** (`.github/workflows/load-clues.yml`) from the Actions tab:

- `environment`: `staging` or `production`; `seasons`: `1-40` for everything. It reads `STAGING_SUPABASE_DB_OWNER_URL` or `PROD_SUPABASE_DB_OWNER_URL` from that GitHub Environment.
- It takes about a minute for all 40 seasons (about 413,000 clues, 160 MB). The run's summary shows one row per season. Running it again inserts nothing; it retries seasons that failed.
- **Production**: run it on the `production` branch, and only after private access is live. The loader refuses a database without `public.hosts` ([clue catalog](../../product-docs/features/clue-catalog/feature-brief.md#source)).

## Supabase Auth settings

Set once per Supabase project (Authentication settings), matching `supabase/config.toml`:

- **Anonymous sign-ins**: on. Rate limit for anonymous users: 30 per hour per IP.
- **Email provider**: on, for email and password accounts ([accounts](../../product-docs/features/accounts/feature-brief.md)). **Confirm email: off** and **Secure password change: off**, so Schmegettes never sends email and needs no SMTP. Minimum password length 8, no other password requirements. Rate limit for sign-ins and sign-ups: 30 per 5 minutes per IP.
- No OAuth providers.

### Resetting a player's password

There is no reset email. When a player asks, set a new password in the project's SQL editor and tell them in person or by message; they can change it on their Account page. Devices already signed in stay signed in.

```sql
update auth.users
set encrypted_password = extensions.crypt('<new password>', extensions.gen_salt('bf'))
where email = lower('<their email>');
```

To free an email someone else registered, delete that user (Authentication → Users); it follows the account deletion rules.

## Host access after a release

The `private_access` migration creates the first host code, and nobody can host until someone uses it. Read it in the project's SQL editor and give it to the first host:

```sql
select code from public.host_codes where used_at is null;
```

The web host also sends `X-Robots-Tag: noindex, nofollow` on every response (`web/scripts/vercel-deploy.mjs`); the pages carry the meta tag too, and `robots.txt` disallows everything.

## Environment variables

Each package's `.env.example` lists its variables with placeholder values. Client-side variables (`VITE_*`) are public: anything bundled into the client can be read by anyone.

Every variable and secret, where each lives, its owner, and how to rotate it: [configuration-and-secrets.md](../security/configuration-and-secrets.md).
