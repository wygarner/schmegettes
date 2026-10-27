# api/ — Rails 8 API (not generated yet)

This package is generated once Ruby 3.4 is installed (`mise install`). It is the first bootstrap task, `tasks/scaffold-services/`.

## Generate

From the repo root:

```bash
gem install rails -v '~> 8.0'
rails new api --api --database=postgresql \
  --skip-git --skip-docker --skip-kamal --skip-thruster --skip-solid \
  --skip-action-cable --skip-action-mailer --skip-action-mailbox --skip-action-text \
  --skip-active-storage --skip-jbuilder --skip-ci
```

`rails new` keeps this file. It also writes its own `README.md`; replace that with a short pointer to this file and to `docs/system-docs/engineering/stack.md`.

## Then configure

| Concern | Change |
|---|---|
| Migrations | Supabase CLI owns the schema. Delete `db/migrate/`, set `config.active_record.schema_format = :sql`, and add `config.active_record.dump_schema_after_migration = false`. Never run `rails db:migrate`. |
| Database role | `DATABASE_URL` is the `app_service` role. Add `Db.as_user(claims) { ... }` (in `app/lib/db.rb`): it opens a transaction, runs `set local role authenticated` and `select set_config('request.jwt.claims', ?, true)`, then yields. Every controller action that reads user data goes through it. |
| Auth | Gem `jwt`. A `before_action` verifies `Authorization: Bearer` against `SUPABASE_JWKS_URL` (cache the JWKS), checks `aud = authenticated` and `exp`, and stores the claims for `Db.as_user`. |
| Contract | Gem `json_schemer`. Request specs validate responses against `../shared/openapi.yaml`. |
| CORS | Gem `rack-cors`, origins from `ALLOWED_ORIGINS` only. |
| Logging | Gems `lograge` + JSON formatter, fields per `docs/system-docs/operations/logging-conventions.md`. Filter `authorization`, `token`, `password` in `filter_parameter_logging.rb`. |
| Health | `GET /healthz` (checks the DB connection) and `GET /version` returning `{ service: "api", commit: ENV["GIT_SHA"] }`. |
| Jobs | Enqueue with `select pgmq.send('jobs', ?::jsonb)` inside the same transaction as the data it relates to. Validate the payload against `../shared/schemas/jobs/job.schema.json` first. |
| Port | `PORT=3001` (web expects it). |

## Environment

See `.env.example`.
