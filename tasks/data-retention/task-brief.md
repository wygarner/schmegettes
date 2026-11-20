---
task-type: enhancement
task-title: "Expire unused guests and write down what we keep"
---
# Task spec: data-retention

Product brief: `tasks/data-retention/product-brief.md`. Product docs: `docs/product-docs/features/accounts/feature-brief.md` ("What we keep, and for how long"), `accounts/interaction-design.md` and `game-history/feature-brief.md` ("Accounts and deletion").

**Related tasks:**
- `observability` sets log and error retention (30 days) in Grafana Cloud.
- `backups-and-restore` sets backup expiry (30 days).
- `security-audit-and-staff-access` provides `private.audit`.

This task builds the guest cleanup and writes `data-retention.md`, which **records** the other two as enforced "by task X", marked "not yet implemented" until they land. If `private.audit` exists when this is built, the cleanup writes one `guests_deleted` row per run; if not, it skips that.

## Approach

**Deleting a guest uses the existing deletion rule:** `delete from auth.users where id = …`, as `private.delete_account` does. The foreign keys already do the rest:
- `profiles` cascades;
- `game_players.user_id` is set null, so scoreboards show "Former player" with the same score and placement (`game_results` handles a null `user_id`);
- `seen_clues`, `hosts`, `room_members` and merge tickets cascade;
- `rooms.host_id` cascades for closed rooms the guest hosted, and their `games.room_id` is set null, so the games stay.

No new deletion path.

**"Last used"** = the latest of:
- `auth.users.last_sign_in_at`;
- the newest `auth.sessions.refreshed_at`, or `updated_at` if the column is absent in the Supabase version (a token refresh on each visit);
- the newest `room_members.joined_at`;
- the newest `game_players.joined_at`;
- the newest `games.started_at` where they're `host_user_id`;
- `auth.users.created_at` as the floor.

A visit refreshes the token, so "each visit resets the 90 days" holds.

**Eligible** = `auth.users.is_anonymous = true`, last used before `now() - interval '90 days'`, and **not** in any room whose status isn't `closed`, and **not** a `game_players` row in a game `in_progress`.

**Runs daily inside the database** with `pg_cron` (available on Supabase), so no credential lives outside it. `cron.schedule('delete-unused-guests', '17 4 * * *', 'select private.delete_unused_guests()')` runs at 04:17 UTC, outside US game nights. Each run records itself in `private.cleanup_runs` (`run_at`, `deleted`, `duration_ms`, `error`) and returns the count. It works in batches of 500 inside one call, up to 20 batches per run, so a first run on a large backlog can't hold locks for long.

**Visibility:** `GET /v1/admin/cleanup-runs` (admin, the last 30 runs) lets the admin see counts. Observability, once landed, adds an alert if no run has been recorded for 26 hours. That rule is listed here as a follow-up line in `ops/grafana/` if it exists; otherwise the PR notes it as pending. Counts only, no IDs, anywhere.

**The returning browser** (day 120): its stored session belongs to a deleted user. Supabase's refresh fails, `onAuthStateChange` fires `SIGNED_OUT`, and `getAccessToken()` signs in anonymously again. `noticeLostAccount()` must **not** show a "signed out" banner for a guest (the brief: never signed in, so no banner). The implementer checks `noticeLostAccount`'s guest handling and fixes it if it fires for guests. An api call made with the stale access token, before the refresh, must fail cleanly: 401 → the client refreshes → new guest. Test the web side.

## Subtasks (narrow → wide)

1. **supabase**: `supabase migration new guest_cleanup`
   - `create extension if not exists pg_cron` (in the schema Supabase documents; check local `supabase start` supports it, and enable it in `config.toml` if needed).
   - `private.cleanup_runs`: RLS on, no policies, privileges revoked from app roles.
   - `private.guest_last_used(uid uuid) returns timestamptz` (stable, security definer) and `private.eligible_guests(cutoff timestamptz, max_rows int) returns setof uuid`, applying the rules above.
   - `private.delete_unused_guests(cutoff timestamptz default now() - interval '90 days') returns integer`:
     - loop batches: `delete from auth.users where id in (select … from private.eligible_guests(cutoff, 500))`;
     - re-check eligibility inside the delete's `where` (`and not exists …` for open rooms and in-progress games), so a guest who joins a room between selection and delete is kept;
     - insert a `cleanup_runs` row, call `private.audit('guests_deleted', 'system', null, jsonb_build_object('count', n))` when that function exists (check `to_regprocedure` at runtime, or just require the security task first; the implementer picks and notes it), and `raise log 'guests deleted: %', n`.
     - Executable by **no app role**: `revoke all from public`. Only `pg_cron` (as the owner) and tests run it.
   - `cron.schedule(...)` as in Approach, idempotent: `cron.unschedule` first if it exists.
   - `private.admin_cleanup_runs()` (`require_admin()`, the last 30 rows), executable by `authenticated`.
   - pgTAP `supabase/tests/guest_cleanup.test.sql`:
     - guests whose last use is set to 91 days ago (sign-in, refresh and join timestamps all old) → deleted; at 89 days → kept;
     - 91 days but in an open room (lobby) → kept; 91 days in an in-progress game → kept;
     - a 91-day guest who played a finished game: deleted, and that game's `game_results` shows "Former player" with the same score and placement, and their `seen_clues` rows are gone; another player's row is unchanged;
     - an account (`is_anonymous = false`) last used 2 years ago → kept;
     - a guest with host access → deleted, and the `hosts` row is gone;
     - the run is recorded with the right count;
     - app roles (`authenticated`, `app_service`, `game_engine`) can't execute `delete_unused_guests` (`throws_ok 42501`);
     - the brief's "can't be run against a game in progress or open room" (both cases above).
2. **api**: `GET /v1/admin/cleanup-runs` in the admin package (admin limiter, no new contract beyond the route):
   - `shared/openapi.yaml`: the route with `CleanupRun {runAt, deleted, durationMs, error}`; run `mise run gen`.
   - Handler test with a fake store.
3. **web**:
   - `web/src/lib/supabase.ts`: make sure a lost **guest** session silently becomes a new guest with no banner, and a lost **account** session still shows the existing banner.
   - Tests in `supabase.test.ts`: a guest's `SIGNED_OUT` → no notice + new anonymous sign-in; an account's → notice.
4. **docs**:
   - new `docs/system-docs/operations/data-retention.md`:
     - **Data inventory table:** one row per kind of data. Columns: what, where, kept for, deleted by, on account deletion. Rows: accounts and guests, profiles and names, rooms, games and scoreboards (permanent, "Former player"), answers (permanent with games, including transcripts), seen clues, host access, merge tickets, the audit log (once the security task lands), logs and errors (30 days, Grafana; observability task), backups (30 days; backups task), cleanup runs, Supabase Auth logs (Supabase's own retention; note the plan's number), and the narrator voice files on devices (browser storage, device-only). Every row names the job or setting that enforces it, with "not yet implemented" until its task lands.
     - **Guest cleanup:** the rule, the schedule, and how to check it (`select * from private.cleanup_runs order by run_at desc limit 5;` or the admin route).
     - **Sub-processors table:** service, what it gets, region. Supabase (database and auth, us-east-1); Fly.io (api and game, `iad`); Vercel (web, edge, request logs); Grafana Labs (logs, traces, Faro errors: region of the stack); Hugging Face (narrator voice downloads, sees host IPs); the backup storage provider (backups task); the status-page service (service-notices task). The last two are "to be named when built". Also GitHub (code, CI logs; no player data except in CI test fixtures, which are synthetic).
     - **Offboarding:** deleting an account on request (`private.admin_delete_account` if the security task has landed; otherwise the SQL in `accounts`), and answering "what do you have about me?" with the exact read-only queries per table for a user ID, run through staff access once that exists.
   - `accounts/feature-brief.md` and `game-history/feature-brief.md` already describe the rule. Update "any cleanup of old anonymous accounts follows the deletion rule" in game-history to link `data-retention.md`.
   - `data-and-isolation.md`: `pg_cron`, `cleanup_runs`, and the functions.

## Key files

`supabase/migrations/<new>_guest_cleanup.sql`, `supabase/tests/guest_cleanup.test.sql`, `supabase/config.toml` (if needed for `pg_cron`), `shared/openapi.yaml` (+ generated), `api/internal/admin/`, `web/src/lib/supabase.ts` (+ test), `docs/system-docs/operations/data-retention.md` (new), `docs/system-docs/architecture/data-and-isolation.md`, `docs/product-docs/features/game-history/feature-brief.md`.

## Contracts preserved

Additive: one admin route. Deletion semantics are the existing ones.

## Success criteria

The product brief's criteria:
- 91 days deleted, 89 kept, 91 in an open room kept;
- the scoreboard shows "Former player" with the same score, and seen clues are gone;
- a 2-year-old account is untouched;
- pgTAP proves open rooms and games in progress are protected;
- `data-retention.md` exists, with every row naming its enforcer;
- in staging, `private.cleanup_runs` shows a daily run.

## Test plan

- `mise run db:test` (`guest_cleanup.test.sql`)
- `mise run test:api -- ./internal/admin/...`
- `mise run test:web -- src/lib/supabase.test.ts`
- Manual (staging): set a test guest's timestamps to 91 days ago with the owner role in the SQL editor (staging only), run `select private.delete_unused_guests();` as the owner, and check the scoreboard and that the browser silently becomes a new guest.

## Database migration plan

- File: `supabase migration new guest_cleanup`.
- Extension `pg_cron`; table `private.cleanup_runs` (RLS on, no policies, app roles revoked); functions `guest_last_used`, `eligible_guests`, `delete_unused_guests` (no app role may execute) and `admin_cleanup_runs` (`authenticated`, admin-checked); a daily cron job.
- Compatible with running code: new objects only. The first run in production deletes the backlog of guests over 90 days in batches. Run it once by hand on staging first and record the count in the PR.

## Logging requirements

- The database: `raise log 'guests deleted: %'` (count only).
- `cleanup_runs` rows hold counts and durations, never IDs.
- The api logs nothing new beyond the request line.

## Docs to update

As in subtask 4.
