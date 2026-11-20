---
task-type: improvement
task-title: "Audit log, time-limited staff access, and rate limits everywhere"
---
# Task spec: security-audit-and-staff-access

Product brief: `tasks/security-audit-and-staff-access/product-brief.md`. **Depends on `observability`** for the two alerts (a failed audit write, and a staff-access grant). It can be built first: the logs it writes are the alert sources, and the alert rules are added to `ops/grafana/` once that exists. If observability hasn't landed, the PR says the alerts are pending.

## Approach

**Audit table.** `private.audit_log` is append-only. Rows are written only by one security-definer function, `private.audit(action, subject_type, subject_id, details jsonb)`, which takes the actor from `auth.uid()`, falling back to the `actor` passed by trusted callers (`game_engine`, triggers). The request ID comes from `current_setting('request.id', true)`, which the api and game set per transaction (`set_config` in `db.AsUser`/`AsEngine`). Nobody, the owner aside, can update or delete rows, and players can't read them. The admin reads them through an admin api route.

**Never block the player.** `private.audit` wraps its insert in `begin … exception when others` and on failure raises a `WARNING` with the prefix `audit write failed:` and the SQL state. The action continues. `golib/db` installs a pgx `OnNotice` handler that turns that warning into an `ERROR` log line "audit write failed" (`action`, `sqlstate`, `request_id`). Observability's alert rule fires on that line (critical, immediate).

**Where rows come from:**

| Event | Source |
|---|---|
| Host access granted (code used) | `private.redeem_host_code` calls `private.audit('host_access_granted', 'user', caller)` |
| Host access removed by admin | `private.admin_remove_host` → `host_access_removed` |
| Host code rotated now | `private.admin_rotate_host_code` → `host_code_rotated` (no code values in details) |
| Account created (guest → account, or new sign-up) | Trigger on `auth.users` after update, when `is_anonymous` goes true → false, or after insert with `is_anonymous = false` → `account_created` |
| Guest merged into account | `private.merge_guest` → `guest_merged` (details: `games_added` count) |
| Password changed (by the player, or by the admin in SQL) | Trigger on `auth.users` after update of `encrypted_password` → `password_changed`. The actor is `auth.uid()` when set (the player); otherwise it's null and `details.via = current_user` (for example `postgres` from the SQL editor, which is the admin reset path). |
| Account deleted by the player | `private.delete_account` → `account_deleted` (`details.by = 'self'`) |
| Account deleted by the admin | `private.admin_delete_account(target)` (new; currently done by hand in SQL per `accounts`) → `account_deleted` (`by = 'admin'`) |
| Guests deleted by cleanup | The `data-retention` task's job calls `private.audit('guests_deleted', 'system', null, {count})` once per run. Not built here; the function is ready for it. |
| Staff-access grant / each read under it | See below |

Triggers on `auth.users` are security definer in `private` and only insert audit rows. If they fail, the exception handler makes sure sign-in and password change never fail because of them.

**Staff access** goes through the api, not the owner role:
- `POST /v1/admin/staff-access` (admin JWT, admin limiter) creates a grant: `subject_type` (`user` | `room` | `game`), `subject_id`, `reason` (required, up to 200 characters), `minutes` (default 60, max 480). It's recorded in `private.staff_grants` and audited `staff_access_granted`. The api logs `WARN` "staff access granted" (`grant_id`, `subject_type`, `subject_id`, `minutes`; never the reason text, which could contain personal data) for observability's alert rule, which notifies Wyatt on every grant.
- `GET /v1/admin/staff-access/{grantId}` returns the subject's data while the grant is active, through `private.staff_read(grant_id)` (security definer). The function checks the grant is the caller's, unexpired and unrevoked, audits `staff_read` with the grant ID, and returns a fixed JSON shape for the subject:
  - user: profile, account flags, rooms, games with scores, host access, seen-clue count. Never the email, password hash or tokens.
  - room: members, status, options.
  - game: players, board state, answers with verdicts.
  
  Anything else, or an expired grant, is 403 `grant-inactive`.
- `DELETE /v1/admin/staff-access/{grantId}` revokes a grant early.
- The "operator script" is `scripts/staff-access.mjs`. It signs in as the admin (prompting for the password, never storing it) and calls these routes. The devtools Admin page may get a form later; out of scope here.
- Owner-role access stays limited to migrations and the clue import. `operator-scripts.md` says so.

**Rate limits everywhere.** Every authenticated api route gets a per-user limiter, keyed by user ID, or by IP when unauthenticated (the existing `AllowKey`). Middleware applies a default group to every route, and stricter groups stay where they are. Starting numbers, to be revised from a week of production logs (record them in `operator-scripts.md`/`security-model.md`):

| Group | Routes | Per minute / burst |
|---|---|---|
| `read` (default) | every GET not listed | 120 / 40 |
| `write` (default) | every POST/PATCH/DELETE not listed | 60 / 20 |
| `room-options` | `PATCH /v1/rooms/{id}` | 120 / 40 (a host dragging the season slider) |
| existing `join`, `host-code`, `account`, `admin` | unchanged | unchanged |

`/healthz` and `/version` are exempt. Responses are 429 with `Retry-After`, as today.

## Subtasks (narrow → wide)

1. **shared** (additive):
   - `shared/openapi.yaml`:
     - `POST /v1/admin/staff-access` (body as above) → `StaffGrant {grantId, subjectType, subjectId, expiresAt}`;
     - `GET /v1/admin/staff-access/{grantId}` → `StaffSubject` (`oneOf`: user/room/game shapes, all fields typed);
     - `DELETE /v1/admin/staff-access/{grantId}` → 204;
     - `GET /v1/admin/audit?since=&action=&subject=` → `AuditEntry[]` (limit 500).
     - Problem types `grant-inactive` and `invalid-grant`.
   - Run `mise run gen`.
2. **supabase**: `supabase migration new audit_and_staff_access`
   - `private.audit_log`: `id bigint generated always as identity`, `at timestamptz default now()`, `actor uuid`, `action text not null` (check against the list), `subject_type text`, `subject_id uuid`, `request_id text`, `details jsonb not null default '{}'`. RLS enabled with **no policies**; `revoke all` from `public`, `anon`, `authenticated`, `app_service` and `game_engine`. Only the security-definer functions write it.
   - `private.staff_grants`: `id uuid`, `admin_id`, `subject_type`, `subject_id`, `reason`, `created_at`, `expires_at`, `revoked_at`. RLS on, no policies, same revokes.
   - `private.audit(...)` as in Approach. `private.audit_trigger_auth_users()` plus `after insert or update on auth.users` triggers (guarded so they only fire on the transitions above).
   - Add the audit calls to `private.redeem_host_code`, `private.admin_remove_host`, `private.admin_rotate_host_code`, `private.merge_guest` and `private.delete_account`. Use `create or replace`, copying each current body from its latest migration. Signatures and grants are unchanged.
   - New `private.admin_delete_account(target uuid)`: `require_admin()`, then the same deletion as `delete_account`, audited.
   - New `private.staff_grant(subject_type, subject_id, reason, minutes)`, `private.staff_revoke(grant_id)`, `private.staff_read(grant_id) returns jsonb` and `private.admin_audit(since, action, subject)`. Each calls `require_admin()`. Grants: execute to `authenticated` (the admin check is inside, as for the other admin functions).
   - pgTAP `supabase/tests/audit_and_staff_access.test.sql`:
     - `authenticated`, `app_service` and `game_engine` can't select, update or delete `private.audit_log` (`throws_ok` 42501 for each);
     - redeeming a host code, deleting an account, a password change (update `auth.users.encrypted_password` as the user) and an admin password change (as `postgres`) each leave exactly one row with the right actor and subject;
     - a forced audit failure (temporarily `revoke insert` inside the test, or make the check fail with an unknown action through a test-only wrapper) still completes the action, and raises the warning (`warnings` capture via `lives_ok`, plus a check that the action's effect happened);
     - staff grants: a non-admin is refused; `staff_read` on an active grant returns the subject and writes a `staff_read` row; another subject is refused; after `expires_at` (set it in the past) it's refused; a revoked grant is refused.
   - Compatible with running code: new tables and functions; replaced functions keep their signatures; triggers only add rows.
3. **golib** (`golib/db`):
   - Set `request.id` per transaction from the context's request ID (`select set_config('request.id', $1, true)`) inside `AsUser`/`AsEngine`.
   - Install `OnNotice`: a notice with severity `WARNING` and the message prefix `audit write failed:` logs `ERROR` "audit write failed" with `sqlstate`, `action` (parsed from the message) and `request_id`. Other notices are logged at `debug`.
   - Tests: `request.id` is visible in the transaction; the notice handler maps the prefix to an `ERROR`.
4. **api**:
   - `api/cmd/api/routes.go`: new `read` and `write` limiters and a `room-options` group. A middleware picks the group by method unless the route already has one, and applies it after authentication, keyed by user ID.
   - `api/internal/admin` (or a new `staffaccess` package): the four routes. `WARN` "staff access granted" and `INFO` "staff access read"/"staff access revoked" with `grant_id`, `subject_type` and `subject_id`.
   - Tests:
     - the limiter middleware: every route in the generated `ServerInterface` gets a group (a table test that walks the router), exempt routes are exempt, and a 429 carries `Retry-After`;
     - the staff-access handlers with a fake store: shapes validated against OpenAPI, and no email in any response (assert the JSON has no `email` key);
     - a scripted "full game night" against a fake store: host plus 6 contestants, about 200 requests in 30 minutes including 60 season-slider PATCHes in a minute. No 429.
5. **scripts**:
   - `scripts/staff-access.mjs` (`grant <user|room|game> <id> --reason "…" [--minutes 60]`, `read <grantId>`, `revoke <grantId>`). It prompts for the admin email and password via stdin with no echo, signs in to the environment's Supabase (`--env staging|production`), calls the api, and prints the JSON.
   - Test the argument parsing and the max-minutes check.
6. **observability hooks** (if `ops/grafana/` exists; otherwise list as pending in the PR):
   - alert "audit write failed": any line in 5 min → critical, immediate;
   - alert "staff access granted": any line → immediate email to Wyatt, both environments.
7. **docs**:
   - new `docs/system-docs/operations/operator-scripts.md`: every script that touches production (staff-access, admin password reset steps, account deletion on request via `admin_delete_account`, the clue import), with what it does, who may run it, and what it logs and audits;
   - `security-model.md` Known gaps: remove Audit table, Staff access and Rate limits; add the rate-limit table;
   - `data-and-isolation.md`: the new tables and functions, and the triggers on `auth.users`;
   - `logging-conventions.md`: the new events.
8. **Security assessment** (after 1–7 merge, before the repo goes public): this is a separate, follow-up run, not code in this PR. The PR's description reminds Wyatt to start it. Findings go in `docs/security-assessments/{date}/remediation-tracker.md` as `security-model.md` describes.

## Key files

`shared/openapi.yaml` (+ generated), `supabase/migrations/<new>_audit_and_staff_access.sql`, `supabase/tests/audit_and_staff_access.test.sql`, `golib/db/*.go`, `api/cmd/api/routes.go`, `api/internal/ratelimit/`, `api/internal/admin/` (or `staffaccess/`), `scripts/staff-access.mjs`, `ops/grafana/alerts.tf` (if present), and the docs above.

## Contracts preserved

Additive only: four admin routes and two problem types. Every route's behavior is unchanged except that rate limits now apply; a 429 is already part of the contract. No WebSocket change.

## Success criteria

The product brief's criteria:
- pgTAP proves the audit table is append-only and unreadable by players;
- the three staging actions each leave exactly one row;
- a forced failure completes the action and logs the `ERROR` (and fires the alert once observability exists);
- staff access is limited to the subject and expires, with grant and reads audited, and Wyatt is alerted;
- the load test of one user gets 429s above each limit, while the scripted game night gets none;
- the Known-gaps rows are gone.

## Test plan

- `mise run db:test` (`audit_and_staff_access.test.sql`, plus the existing `private_access`, `accounts` and `lobby` tests, which must still pass with the replaced functions)
- `mise run test:api -- ./internal/ratelimit/... ./internal/admin/... ./cmd/api/...`
- `go test ./...` in `golib/db`
- `node --test scripts/staff-access.test.mjs` (or the repo's scripts test runner)
- Manual (staging): the three actions and their rows; a grant, a read, another subject refused, and expiry; one user hammering `GET /v1/me` gets a 429 after about 40 quick requests.

## Database migration plan

- File: `supabase migration new audit_and_staff_access`.
- Tables: `private.audit_log` and `private.staff_grants`, RLS on with no policies, all privileges revoked from app roles.
- Triggers: `after insert or update on auth.users` (security definer, failure-tolerant).
- Functions: `private.audit`, the trigger function, the `staff_*` functions, `admin_audit` and `admin_delete_account`, plus replaced bodies for `redeem_host_code`, `admin_remove_host`, `admin_rotate_host_code`, `merge_guest` and `delete_account` (same signatures and grants).
- Compatible with the code already running: the old api calls the same functions and gets the same results; the audit rows are a side effect.

## Logging requirements

- New: `ERROR` "audit write failed" (`action`, `sqlstate`, `request_id`); `WARN` "staff access granted"; `INFO` "staff access read" and "staff access revoked" (`grant_id`, `subject_type`, `subject_id`); and the existing 429 log line now includes `group`.
- Never logged: the grant reason text, emails, password hashes, tokens, or staff-read payloads.

## Docs to update

As in subtask 7.

## Branch
`technical-improvement/GH-245-security-audit-and-staff-access`, from and into `develop`
