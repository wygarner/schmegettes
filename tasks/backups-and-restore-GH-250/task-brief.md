---
task-type: improvement
task-title: "Off-account backups and a tested restore"
---
# Task spec: backups-and-restore

Product brief: `tasks/backups-and-restore/product-brief.md`. Decided already: RPO 24 h, RTO 4 h, and a scheduled logical export (`pg_dump`) to storage in a separate account (`stack.md`). **Depends on `observability`** for the missing-export alert. Until that lands, GitHub's failed-workflow email covers a failed run, and the 26-hour "missing" alert is added to `ops/grafana/` when it exists.

## Decisions needed (before implementation starts)

1. **Storage provider (separate account).** Recommended: **Cloudflare R2** in a new Cloudflare account used only for Schmegettes backups. S3-compatible, with lifecycle rules, free up to 10 GB and no egress fees. An export is about 50–80 MB compressed (mostly the clue catalog), so 30 days is about 2 GB. Alternatives: Backblaze B2 (similar), or AWS S3 (more setup; egress costs on restore). Wyatt picks and creates the account and bucket, and names the provider in `data-retention.md`'s sub-processor list.
2. **Encryption key custody.** Recommended: an `age` key pair.
   - The **public** key (recipient) is a GitHub `production` environment variable `BACKUP_AGE_RECIPIENT`. It isn't secret, so the job can encrypt.
   - The **private** key lives only in Wyatt's password manager, plus an offline copy. It's never in GitHub, Supabase, Fly, Vercel or the bucket's account. Restoring needs it, which is the point.

## Approach

**Daily export:** a GitHub Actions workflow `backup.yml` on a `schedule` (03:30 UTC) and `workflow_dispatch`, in the `production` environment. It uses the existing `PROD_SUPABASE_DB_OWNER_URL` secret, which already serves migrations and the clue load. Steps:
1. Pin the `pg_dump` major version to the Supabase server's.
2. `pg_dump --format=custom --no-owner --no-privileges` for schemas `public` and `private`, plus `auth.users` and `auth.identities` (data and the columns needed to restore sign-in: hashed passwords and identities), to `schmegettes-prod-YYYY-MM-DDTHHMMZ.dump`. Supabase's managed schemas (`storage`, `realtime`, and so on) are excluded. Restore recreates `auth` from the target project's own schema and loads only those two tables' rows. Verify the exact dump flags against Supabase's documented `supabase db dump` behavior, and record them in `disaster-recovery.md`.
3. `age -r "$BACKUP_AGE_RECIPIENT"` encrypts the file, then `sha256sum`.
4. Upload `.dump.age` and `.sha256` to the bucket with the S3 API (`aws s3 cp --endpoint-url`), using bucket-scoped write-only credentials (`BACKUP_S3_*` environment secrets). They can put objects but not delete or read, so a stolen CI secret can't wipe or read backups.
5. Send a heartbeat: one OTLP log line `backup ok` with `size_bytes` and `duration_s` (`service.name=backup`, `deployment.environment=production`), posted with `curl` to the Grafana OTLP endpoint if `OTEL_EXPORTER_OTLP_ENDPOINT` is set. Otherwise skip it.
6. Write a job summary (file name, size, duration). No data in logs.

**Expiry:** a bucket lifecycle rule deletes objects 30 days after creation. It's set by the operator and documented with the exact JSON/CLI in `disaster-recovery.md`. The workflow never deletes.

**Missing-export alert:** a Grafana rule (`ops/grafana/alerts.tf`), `count_over_time({service_name="backup"} |= "backup ok" [26h]) < 1` → production route. Until observability exists, GitHub's failed-run email covers failures but not "never ran". `disaster-recovery.md` says so.

**Restore tooling:** `scripts/restore/` (bash, documented and tested by the drill):
- `fetch.sh <date>`: download and verify the sha256, using read-only credentials that only the operator holds;
- `decrypt.sh`: `age -d -i <key file>`, with the key path prompted, never stored;
- `full-restore.sh <target-db-url>`: apply the repo's migrations to a fresh project with `supabase db push`, then `pg_restore --data-only` for `public`/`private`, then load `auth.users`/`auth.identities` with triggers disabled for the load, then reset sequences and run row-count checks;
- `restore-game.sh <scratch-url> <prod-url> <game-id>`;
- `restore-player.sh <scratch-url> <prod-url> <user-id>`. These two copy the listed rows from a scratch restore back into production in one transaction with `on conflict do nothing`, print every row they'd write, and require `--apply` to write.

## Subtasks (narrow → wide)

1. **workflow** `.github/workflows/backup.yml`:
   - The steps above, with `concurrency: backup-production` and a 60-minute timeout.
   - Tools: `postgresql-client` matching the server's major version, `age` (pinned release), the AWS CLI (preinstalled).
   - Secrets/vars: `PROD_SUPABASE_DB_OWNER_URL` (existing), `BACKUP_S3_ENDPOINT`, `BACKUP_S3_BUCKET`, `BACKUP_S3_ACCESS_KEY_ID`, `BACKUP_S3_SECRET_ACCESS_KEY` (write-only), `BACKUP_AGE_RECIPIENT` (var), and the optional `OTEL_*`.
   - `actionlint` passes; the repo's scripts CI job runs it if configured.
2. **scripts** `scripts/restore/*.sh`, plus a SQL file per procedure (`restore-game.sql` and `restore-player.sql`, parameterized by ID). They list exactly which tables and rows are copied:
   - **game:** `games`, `game_players`, `board_clues`, `answers`, `wagers`, and the players' `seen_clues` for that game's clues;
   - **player:** `profiles`, `game_players` rows (re-linking `user_id` where it's null for that player's rows, matched by `game_players.id`), `seen_clues`, `hosts`, and the auth rows.
   
   `shellcheck`-clean. A test runs `restore-game.sql` against the local Supabase: seed a game, dump it, delete the game, restore it into a scratch schema, copy it back, and assert identical rows (`supabase/tests/` can't run shell, so put this test under `scripts/restore/test.sh` and run it in the `database` CI job).
3. **ops/grafana** (if present): the missing-export alert. Otherwise listed as pending in the PR.
4. **docs**:
   - new `docs/system-docs/operations/disaster-recovery.md`:
     - what's backed up and what isn't; RPO/RTO; where and how it's encrypted; key custody;
     - the lifecycle rule (exact config);
     - the three procedures with exact commands, including **every secret to change** for a full restore (from `configuration-and-secrets.md`: `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_JWKS_URL` on api and game; `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` on the web environment; `PROD_SUPABASE_DB_OWNER_URL`; the Supabase Auth settings and URL configuration; `app_service`'s password; the clue catalog is in the dump);
     - what players experience (up to 24 h of games and new accounts missing; link the `service-notices` feature for the notice);
     - **Drill log**: date, export used, target, measured time, problems found, next due (+6 months).
   - `stack.md`: the Backup row (built; provider; schedule).
   - `security-model.md`: the "Docs that need hosting first" row.
   - `configuration-and-secrets.md`: the new secrets and variables.
   - `data-retention.md` (if the data-retention task landed): the backups row now names this job and the lifecycle rule.
5. **Operator steps** (Wyatt, not in the PR, listed in the PR and in `disaster-recovery.md`):
   1. create the storage account and bucket, the lifecycle rule (30 days), and two credentials: write-only for CI, read-only for the operator;
   2. generate the `age` key pair, and store the private key in the password manager plus offline;
   3. set the GitHub `production` secrets and variables;
   4. run `backup.yml` by hand once and check the object;
   5. **the drill:** restore the latest production export into a scratch Supabase project with `full-restore.sh`; sign in as a known guest (by restoring that device's session isn't possible, so use a test account created in production for the drill) and as a signed-in account, and see their history; compare the `clues` row count; time it; record it in the drill log;
   6. test the lifecycle with a test object back-dated 31 days. Most providers can't back-date, so instead set a temporary 1-day rule on a test prefix, upload, and check it's gone after 2 days. Document what was done.

## Key files

`.github/workflows/backup.yml` (new), `scripts/restore/**` (new), `ops/grafana/alerts.tf` (if present), `docs/system-docs/operations/disaster-recovery.md` (new), `docs/system-docs/engineering/stack.md`, `docs/system-docs/security/{security-model,configuration-and-secrets}.md`.

## Contracts preserved

No change to `shared/`, the database schema, or any service. The workflow only reads the production database.

## Success criteria

The product brief's criteria:
- seven consecutive daily exports exist;
- the expiry rule removes old objects;
- an export can't be read without the private key: try it, and record it;
- the drill restores into a scratch project in under 4 h, accounts sign in and see history, and the clue count matches;
- procedure 2 brings back a deleted staging test game exactly, with no other row changed. Run it on staging with a staging export: run `backup.yml` with an `environment: staging` input. Staging isn't backed up on schedule, but the workflow supports a manual staging run for drills.
- a missing export fires the alert (observability) or, until then, the failure email.

## Test plan

- `scripts/restore/test.sh` against the local Supabase (in the `database` CI job): a game is restored row-for-row; a player's rows re-link; nothing else changes.
- `shellcheck scripts/restore/*.sh`; `actionlint .github/workflows/backup.yml`.
- Manual: the operator steps and the drill, recorded in `disaster-recovery.md`.

## Database migration plan

None.

## Logging requirements

- The workflow logs file names, sizes and durations only: no rows, no connection strings. Secrets are masked by Actions. Also set `set +x` around commands that take URLs.
- Heartbeat: `backup ok` (`size_bytes`, `duration_s`).
- The restore scripts print row counts and IDs to the operator's terminal only.

## Docs to update

As in subtask 4.
