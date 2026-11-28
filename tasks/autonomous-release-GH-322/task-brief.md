---
task-type: improvement
task-title: "Claude runs a production release end to end"
---
# Task spec: autonomous release

Product brief: [product-brief.md](product-brief.md).

After this task, a release has two touchpoints for Wyatt, both in the chat with Claude: "do a release" and, after the scope and verification summary, "go". Everything else runs through GitHub Actions workflows that Claude dispatches and reads, or happens automatically on merge. The one-time setup steps for Wyatt are listed in subtask 8 and in the PR body.

## Subtasks

### 1. `supabase/`: a narrow way to post the release's What's new

What's new can only be posted today through `private.admin_post_notice`, which requires a signed-in admin (`private.require_admin()`). A release workflow has no admin session, and giving it one (a bot admin account) would hand it every admin power: host codes, account deletion, staff access. Instead, add one function that can do exactly one thing.

Migration `supabase migration new release_whats_new`:

- `private.release_post_whats_new(release_version text, notice_title text, notice_body text, notice_link text default null) returns uuid`, `security definer`, `set search_path = ''`.
  - `release_version` must match `^\d+\.\d+\.\d+$`; otherwise raise.
  - **Idempotent per version.** If a `whats_new` notice for that version already exists, return its id and change nothing. Record the version in a new nullable column `public.notices.release_version text` with a partial unique index `on public.notices (release_version) where release_version is not null`. Only this function sets it. A redeploy or a re-run of the workflow never posts twice.
  - Inserts `kind = 'whats_new'` only. The existing table checks enforce the title (1–60) and body (≤ 280) limits and the `https://` link rule.
  - `created_by` and the `notice_history.actor` are the fixed release actor `00000000-0000-0000-0000-000000000001`, returned by `private.release_actor()` (an `immutable` SQL function), so admin views can show "Release" rather than an unknown account.
  - Writes `notice_history` (`action = 'post'`, revision 1) and `private.audit('notice_posted', 'system', id, jsonb_build_object('kind', 'whats_new', 'revision', 1, 'source', 'release', 'version', release_version), private.release_actor())`.
- Grants: `revoke all … from public, anon, authenticated, app_service, game_engine`. No role gets `execute`. Only the owner (the role behind `PROD_SUPABASE_DB_OWNER_URL` and `STAGING_SUPABASE_DB_OWNER_URL`) can call it.
- `private.admin_notices` and the devtools Admin page show the release actor as "Release". Check `devtools/src/admin/NoticesSection.tsx` and the api's notice admin row. If `created_by` is resolved to an account email anywhere, map the release actor to the label `Release` there. Don't change any other admin behaviour.

**Why the owner role and not a new login role:** the job that calls it (subtask 4) runs in the `production` environment, which already holds `PROD_SUPABASE_DB_OWNER_URL` for migrations. A separate role would add a credential to rotate without narrowing what that job can reach. The narrowing that matters is that nothing an app or a person signs in as can call the function.

### 2. `e2e/`: production smoke

Add `e2e/tests/smoke.spec.ts` and a `smoke` Playwright project (`testMatch: "smoke.spec.ts"`, `baseURL` from `SMOKE_BASE_URL`, timeout 5 minutes). It stays within the production rules in [agent-qa.md](../../docs/system-docs/quality/agent-qa.md#production-rules):

1. QA Host signs in (`SMOKE_HOST_EMAIL`/`SMOKE_HOST_PASSWORD`) on an 844 × 390 page and creates a room.
2. QA 1 signs in (`SMOKE_PLAYER_EMAIL`/`SMOKE_PLAYER_PASSWORD`) on a 390 × 844 page and joins by the room code. **Never as a guest**: a guest is a non-QA account, which the production rules forbid creating.
3. The host starts the game. The board shows on the host.
4. One clue at most: the contestant picks the lowest clue in the first category, buzzes, and lets the answer time out. Production builds have no E2E mode, so nothing can be "said".
5. The host leaves the game and closes the room. The test asserts the room is closed.

**Verify before writing step 4.** Find out what happens to an unfinished game when its room closes: read `game/internal/room/` (the host-absence rule) and the `games` lifecycle in `supabase/`. If closing a room mid-game, or the host-absence rule that follows, finishes the game or writes history, stop after step 3: the smoke is then sign in, create, join, start, close. Record which one you chose, and why, in a comment at the top of the spec and in the PR body. The production rules forbid a finished game.

`critical-path` stays unchanged. Add an `afterAll` that closes the room even when a step fails, so a failed smoke never leaves an open room.

### 3. Workflows

All new workflows pin actions by SHA like the existing ones, set `permissions: contents: read` (plus what the job needs), and use `persist-credentials: false`.

**3a. `smoke-prod.yml`**: `workflow_dispatch`, `environment: production`, concurrency group `smoke-production`. It checks the four `SMOKE_*` values are set (fail with a pointer to agent-qa.md if not), runs `bun run --cwd e2e test --project smoke` with `SMOKE_BASE_URL: https://schmegettes.app`, and uploads the report on failure. Then it runs `node scripts/qa-accounts.mjs --env production cleanup` as a **dry run only**, which lists anything left behind and fails the job if the list isn't empty. It never applies cleanup.

**3b. `release-health.yml`**: `workflow_dispatch` with inputs `environment` (`production` default, or `staging`) and `since` (ISO time; default: the time of the latest `deploy` annotation for that environment). It runs `node scripts/release-health.mjs` (subtask 4) in that environment with `GRAFANA_URL` and `GRAFANA_READ_TOKEN`. The job fails if any check fails, and writes the table to `$GITHUB_STEP_SUMMARY` so the result can be read from the run.

**3c. What's new on sign-off.** Add `publish-whats-new.yml` on `push` to `production` with `paths: releases/*/metadata.md`, `environment: production`. It finds each `releases/X.Y.Z/metadata.md` in the push that has `released: true` and a `whats-new` block (subtask 5). For each, it calls `select private.release_post_whats_new(…)` through `psql "$PROD_SUPABASE_DB_OWNER_URL"` with the values passed as `psql` variables (`-v`, quoted with `:'var'`), never interpolated into the SQL text. It prints the returned id, and whether the notice was new or already there. A metadata file without `released: true` is skipped. A missing or invalid `whats-new` block fails the job with the reason; it never posts partial text.

**3d. `deploy-prod.yml`**: no code change. Removing the required reviewer is a settings change (subtask 8). Update the workflow's header comment, which implies an approval wait.

### 4. `scripts/release-health.mjs`

A Node script, structured like `scripts/deploy.mjs` (injectable `fetch`, testable), that queries Grafana's HTTP API with a read-only token and prints one row per check:

| Check | Source | Passes when |
|---|---|---|
| Alerts | `GET /api/prometheus/grafana/api/v1/rules`, the `schmegettes-<env>` group | No rule is `firing` or `pending`, test alerts excluded |
| Uptime | `probe_success` for the `schmegettes-<env>-*` jobs, over the window | Every job's minimum over the last 10 minutes is 1 |
| Server errors | The same 5xx-plus-`ERROR` query the "Server errors" rule uses (read it from `ops/grafana/`; don't copy-paste a second definition: export it as a Terraform output or a shared file both read) | Below `server_error_threshold` |
| Live game | `schmegettes_rooms_crashed_total` and `schmegettes_phase_stuck_total`, increase since `since` | 0 |
| Client errors | Faro exceptions since `since` | Below `client_error_threshold` |

- The window is `since` to now. If less than 15 minutes have passed since `since`, the script waits until 15 minutes have, polling at most every 60 s, so a check never passes on an empty window.
- Thresholds come from the same place the alert rules read them, `ops/grafana/variables.tf` defaults. Parse them, or move them to a JSON file that both Terraform and the script read.
- The datasource UIDs are found by type through `GET /api/datasources`, never hard-coded.
- The script never prints the token, query results beyond counts, or log lines. It prints check name, value, threshold and pass/fail only.
- Exit 0 if all checks pass, 1 if any fail, and 2 if Grafana can't be reached or the token is rejected. Exit 2 is reported as "health unknown", never as a pass.

### 5. Release docs format

`releases/X.Y.Z/metadata.md` frontmatter gains a `whats-new` block, written with the other release docs:

```yaml
whats-new:
  title: "Notices from us"            # 1–60 characters
  body: "See incidents, …"            # at most 280 characters; plain text
  link:                               # optional, https:// only
```

`user-release-notes.md` stays the long form. The `whats-new` block is its summary for the in-app notice. `scripts/release-scope.cjs` is unchanged.

Add a small validator, `scripts/release-metadata.mjs check releases/X.Y.Z/metadata.md`, used by `publish-whats-new.yml` and runnable before the release PR opens. It checks the version folder name, `released`, `release-date` (blank or `YYYY-MM-DD`), and the `whats-new` limits.

### 6. Session permission for releases

In `.claude/CLAUDE.md`, add under "Change discipline":

> Releases and hotfixes: when Wyatt asks in chat for a release, Claude may push `releases/X.Y.Z`, `releases/X.Y.Z-signoff` and `hotfix/X.Y.Z-*` branches, open their PRs to `production`, and merge them as merge commits once Wyatt has said "go" for that release in the same chat and verification has passed. The go-ahead covers that one release only.

Mirror the same rule in `.claude/commands/engineering.md` Phase E and its Constraints ("Never skip human approval": the approval is the chat go-ahead).

### 7. Process docs

Rewrite [release-strategy.md](../../docs/system-docs/operations/release-strategy.md) "Process" as:

1. **Scope**: as today. Claude presents the scope, the version and the checks to come.
2. **Cut and docs**: as today, plus the `whats-new` block, validated with `scripts/release-metadata.mjs`.
3. **Verify**: CI green, staging migrations rehearsed, `e2e.yml` passes on staging. The release's internal notes record the run ids. **Agent QA is no longer a release step.** Real-device items from the human checklist that the release touches are listed as "not checked" in the go-ahead message.
4. **Go-ahead**: Claude posts a summary in chat: scope, run ids, anything not checked, and production config the release needs, with whether it is set (subtask 7, rule below). Wyatt replies "go". Claude merges `origin/production` in, then merges as a merge commit. `deploy-prod.yml` runs with no approval wait.
5. **Confirm the deploy**: as today. Then `release-health.yml` and `smoke-prod.yml`.
6. **Sign-off**: only if both pass. Claude opens the sign-off PR and merges it; `publish-whats-new.yml` posts What's new. If health or smoke fails, no sign-off: Claude reports it in chat with the run links and follows Rollback or incident-response.md. Wyatt decides between rollback and fix-forward.

Replace step 8 ("Post What's new from the Admin page") with the automatic post. Keep "The gap between code is live and marked released is deliberate", reworded so the automated checks, not a person, close that gap.

**Rule for config.** Add to [development-workflow.md](../../docs/system-docs/engineering/development-workflow.md) Step 4: a task that adds a production secret or variable lists it in the PR body under "Production config". Wyatt sets it in staging and production before the PR merges. The release's internal notes say "set" for each one, and Claude checks the names exist with `gh secret list --env production` and `gh variable list --env production` (names only).

### 8. One-time setup (Wyatt), documented

Add a "One-time setup for autonomous releases" section to release-strategy.md and list it in the implementation PR body:

1. **Settings → Environments → production**: untick Required reviewers. Keep Deployment branches = `production`.
2. **`production` environment**: secrets `SMOKE_HOST_PASSWORD` and `SMOKE_PLAYER_PASSWORD`, and variables `SMOKE_HOST_EMAIL` (QA Host) and `SMOKE_PLAYER_EMAIL` (QA 1). Use the production QA accounts from the password manager.
3. **Grafana (Schmegettes stack)**: a service account with the **Viewer** role and a token. Add it as secret `GRAFANA_READ_TOKEN` in the `production` and `staging` environments.
4. Run `release-health.yml` and `smoke-prod.yml` once by hand and check both pass on the current production.

Update [security-model.md](../../docs/system-docs/security/security-model.md) step 7 (the `production` environment JSON no longer has `reviewers`). Update its Admin row to say What's new can also be posted by the release workflow through `private.release_post_whats_new`, owner only, audited with source `release`.

## Key files

| Subtask | Files |
|---|---|
| 1 | `supabase/migrations/<ts>_release_whats_new.sql`, `supabase/tests/release_whats_new.test.sql`, possibly `devtools/src/admin/NoticesSection.tsx` and `api/internal/notices/store.go` (actor label only) |
| 2 | `e2e/tests/smoke.spec.ts`, `e2e/playwright.config.ts` |
| 3 | `.github/workflows/smoke-prod.yml`, `release-health.yml`, `publish-whats-new.yml`, `deploy-prod.yml` (comment) |
| 4 | `scripts/release-health.mjs`, `scripts/release-health.test.mjs`, possibly `ops/grafana/` (shared threshold and query source) |
| 5 | `scripts/release-metadata.mjs`, `scripts/release-metadata.test.mjs`, `releases/README.md` |
| 6 | `.claude/CLAUDE.md`, `.claude/commands/engineering.md` |
| 7–8 | `docs/system-docs/operations/release-strategy.md`, `development-workflow.md`, `quality/agent-qa.md`, `engineering/testing-strategy.md`, `security/security-model.md`, `security/configuration-and-secrets.md`, `operations/deployment.md`, `operations/observability.md` |

## Contracts preserved

There's no change to `shared/`, REST, or socket contracts, and no `mise run gen`. `public.notices` gains a nullable column that no app role can write and the public notices read doesn't return.

## Success criteria

- `private.release_post_whats_new` posts one What's new per version. A second call with the same version returns the same id and changes nothing. No app role can execute it (pgTAP).
- `smoke-prod.yml` passes on production and leaves no open room and no finished game (its cleanup dry run lists nothing).
- `release-health.yml` passes on production after a deploy, fails when a rule is firing (unit test with a stubbed Grafana), and reports "health unknown" on a bad token.
- Merging a sign-off with a valid `whats-new` block posts What's new once. Re-running the workflow doesn't post again.
- release-strategy.md describes a release with no step that needs Wyatt outside the chat after the one-time setup.
- `.claude/CLAUDE.md` permits release branch pushes and merges only after a chat go-ahead for that release.

## Test plan

- `mise run db:test`: `supabase/tests/release_whats_new.test.sql` covers posting, idempotency, version format, title and body limits, `execute` denied to `anon`, `authenticated`, `app_service` and `game_engine`, the history row, and the audit row with `source = release`.
- `node --test scripts/release-health.test.mjs scripts/release-metadata.test.mjs`: stubbed Grafana responses (all green, firing rule, uptime dip, crash counter increase, 401 → exit 2, empty window waits). Validator cases (missing block, title 61 characters, body 281 characters, `http://` link).
- `mise run test:e2e -- --project smoke` against `mise run dev`, with local QA accounts from `node scripts/qa-accounts.mjs --env local create`. Run it once, paste the result in the PR.
- If devtools or api changed for the actor label, run the targeted test for that file (`mise run test:api -- ./internal/notices/...`).
- CI runs the rest. `smoke-prod.yml` and `release-health.yml` are first run on production after the one-time setup. Record those run ids in the PR.

## Database migration plan

- File: `supabase migration new release_whats_new`.
- `alter table public.notices add column release_version text`, plus the partial unique index. It's additive and nullable, so the running api and devtools, which never select it, are unaffected.
- `private.release_actor()` and `private.release_post_whats_new(...)`, with `revoke all` from every app role and no `execute` grant.
- The `notices` RLS and grants are unchanged. The new column is not added to `private.active_notices` or the public read.
- pgTAP: `supabase/tests/release_whats_new.test.sql`.
- Compatible with the code already running: a new column and functions only.

## Logging requirements

- `publish-whats-new.yml` logs the version, the notice id and "posted" or "already posted". It never logs the database URL.
- `release-health.mjs` logs check names, numbers and pass/fail only, never the token, log lines or query bodies.
- `smoke-prod.yml`: Playwright's report on failure may contain screenshots of QA accounts only. The spec never types a password into a field whose value is captured in the trace's text: set `trace: "off"` for the `smoke` project and keep `screenshot: "only-on-failure"`.
- No app logging changes.

## Docs to update

- `docs/system-docs/operations/release-strategy.md`: Process, one-time setup, Communication (What's new row).
- `docs/system-docs/engineering/development-workflow.md`: Step 4 production config rule. Automation map: the three new workflows.
- `docs/system-docs/quality/agent-qa.md`: "When it is required". Every release now runs the E2E suite instead, and every production deploy runs `smoke-prod.yml`.
- `docs/system-docs/engineering/testing-strategy.md`: the `smoke` project.
- `docs/system-docs/security/security-model.md`: step 7, the Admin row, and the owner-role sentence (the owner role is also used by `publish-whats-new.yml`).
- `docs/system-docs/security/configuration-and-secrets.md`: the `SMOKE_*` and `GRAFANA_READ_TOKEN` rows.
- `docs/system-docs/operations/deployment.md`: no approval wait for production.
- `docs/system-docs/operations/observability.md`: section 1, the Viewer token; and a pointer to `release-health.mjs`.
- `releases/README.md`: the `whats-new` block.
- `.claude/CLAUDE.md`, `.claude/commands/engineering.md`.
