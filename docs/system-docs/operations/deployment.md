# Deployment and Environments

**Source of truth:** `.github/workflows/deploy-prod.yml`

Hosting is **not chosen yet** ([stack.md](../engineering/stack.md)). This doc states what each host must provide. When a host is picked, fill in the "Host" and "Deploy mode" columns, the rollback commands in [release-strategy.md](./release-strategy.md), and the deploy step in `deploy-prod.yml`, all in the same PR.

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
| web | Static/edge host, SPA fallback to `index.html`, CSP + HSTS headers, serves `/version.json` | TBD | TBD |
| api | Runs a build of an exact commit; pre-release step not needed (migrations run in CI); health check on `/healthz`; horizontal scaling | TBD | TBD |
| game | Long-lived WebSockets (no request timeout under 1 h), graceful SIGTERM with ≥20 s drain, horizontal scaling, sticky sessions not required | TBD | TBD |
| worker | Same commit as the others, separate process, no inbound traffic | TBD | TBD |
| Database | Supabase (managed, backups, point-in-time restore, TLS); pooler connection for services | Supabase | `deploy-prod.yml` runs `supabase db push` |
| Redis | Managed, private network or TLS + auth | TBD | — |
| Secrets | Each host's secret store; GitHub Environment `production` for CI | — | — |

Fly.io (used by the prototype) fits `game` well: long-lived sockets, `fly deploy --image`, and `fly releases rollback`. If it is picked for game, api, and worker, they can share one image per commit, built once and promoted from staging to production.

## The deploy contract

Every production deploy, in order:

1. **Builds from the merge commit on `production`.** Nothing built from a local checkout reaches production. Each build gets `GIT_SHA`.
2. **Runs migrations before new code takes traffic.** `deploy-prod.yml`'s `migrate` job, against the production database, as the owner role.
3. **Health-checks the new version** (`/healthz`) before traffic shifts to it.
4. **Verifies the deployed commit.** The last job reads each component's `/version` (web: `/version.json`) from the `PROD_VERSION_URLS` environment variable and fails unless every one reports the merge commit. Without it, a skipped platform deploy looks like a release.
5. **Keeps rollback one command away** (release-strategy.md, "Rollback"). A code rollback does not undo migrations.

## Database roles per environment

The `app_service` role is created by the first migration without LOGIN. In each Supabase project, once:

```sql
alter role app_service with login password '<generated, stored only in the secret store>';
```

Services connect through the Supabase pooler (transaction mode) as `app_service`. Only `deploy-prod.yml` and `load-clues.yml` hold an owner credential (`*_OWNER_URL`).

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

The web host must also send `X-Robots-Tag: noindex, nofollow` on every response (the pages already carry the meta tag, and `robots.txt` disallows everything).

## Environment variables

Each package's `.env.example` lists its variables with placeholder values. Client-side variables (`VITE_*`) are public: anything bundled into the client can be read by anyone.

Every variable and secret, where each lives, its owner, and how to rotate it: [configuration-and-secrets.md](../security/configuration-and-secrets.md).
