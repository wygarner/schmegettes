# Data Retention

**Source of truth:** `supabase/migrations/20261121160042_guest_cleanup.sql`, `supabase/migrations/20261110180920_accounts.sql`, `supabase/migrations/20261121143107_audit_and_staff_access.sql`, `supabase/migrations/20261122173952_service_notices.sql`, `web/src/lib/supabase.ts`, `web/src/lib/piper/voices.ts`

What Schmegettes keeps about players, where, for how long, and what deletes it. The product rules are in [accounts](../../product-docs/features/accounts/feature-brief.md#what-we-keep-and-for-how-long) and [game history](../../product-docs/features/game-history/feature-brief.md#accounts-and-deletion); the tables and foreign keys in [data-and-isolation.md](../architecture/data-and-isolation.md).

**The deletion rule** (one path for every deletion: a player's own, the admin's, and the guest cleanup) is `delete from auth.users where id = …`. The foreign keys do the rest: the profile, memberships, seen clues, host access and merge tickets go; closed rooms the user hosted go, and their games keep a null `room_id`; `game_players.user_id` becomes null, so scoreboards show "Former player" with the same score and placement.

## Data inventory

| What | Where | Kept for | Deleted by | On account deletion |
|---|---|---|---|---|
| Accounts (email, password hash, sign-in times) | Supabase Auth, `auth.users` | Until the player or the admin deletes it | `private.delete_account()`; `private.admin_delete_account(user)` ([operator-scripts.md](./operator-scripts.md)) | Deleted |
| Guests (anonymous users) | `auth.users` (`is_anonymous`) | 90 days after last use | The daily guest cleanup (below) | Deleted (a guest merged into an account is deleted at the merge) |
| Sessions and refresh tokens | `auth.sessions`, `auth.refresh_tokens` | Until sign-out or expiry (Supabase Auth settings) | Supabase Auth; cascades | Deleted |
| Profiles and names (`display_name`, `account_name`) | `public.profiles` | With the user | Cascade from `auth.users` | Deleted |
| Rooms and memberships | `public.rooms`, `public.room_members` | Rooms until the host is deleted; memberships with the user | Cascades | The user's memberships and the closed rooms they hosted are deleted (open rooms protect a guest from the cleanup) |
| Games and scoreboards | `public.games`, `game_players`, `board_clues`, `game_results` (view) | **Permanently**, by design | — | The seat stays as "Former player": `user_id` and the name snapshot are nulled; score and placement are unchanged |
| Answers (typed or spoken text, transcripts heard, verdicts) | `public.answers` | Permanently, with their game | — | Kept, attached to the "Former player" seat |
| Wagers | `public.wagers` | Permanently, with their game | — | Kept, like answers |
| Seen clues | `public.seen_clues` | With the user | Cascade | Deleted |
| Host access | `public.hosts` | With the user, or until the admin removes it | Cascade; `private.admin_remove_host` | Deleted |
| Merge tickets | `private.merge_tickets` | 24 hours, or until used | Spent by `merge_guest`; cascade | Deleted |
| Audit log | `private.audit_log` | Permanently (append-only) | — | Kept: rows hold the user ID as actor or subject, never an email |
| Staff-access grants | `private.staff_grants` | Permanently (reason, admin, subject, times) | — | Kept |
| Cleanup runs | `private.cleanup_runs` | Permanently (counts and durations only) | — | Not applicable: no IDs |
| Service notices and notice history | `public.notices`, `private.notice_history` | Permanently | — | Kept; history holds the admin's user ID, while Instatus receives notice text only |
| Server logs and error reports | Grafana Cloud | **14 days** (the free tier's retention for logs, traces, metrics and Faro data; at most 30 days on any plan), recorded in [observability.md](./observability.md#8-retention-and-access). Fly.io also keeps its own short stdout log window | Grafana Cloud retention | Kept until they expire. They hold user IDs and failed spoken-pick text, never emails, passwords, or answers ([logging-conventions.md](./logging-conventions.md)) |
| Database backups | Supabase | Supabase's own plan backups, on Supabase's schedule (at most 30 days). There is no off-site export: the `backups-and-restore` task was dropped (2026-11-24) | Supabase's backup expiry | Gone from backups when Supabase's last backup holding it expires |
| Supabase Auth and API logs | Supabase | Supabase's retention for the project's plan (confirm on the plan page) | Supabase | Kept until they expire; they include emails and IP addresses |
| Web request logs | Vercel | Vercel's retention for the plan. The web app is static, so only edge request logs exist | Vercel | Kept until they expire; IP addresses and paths, no player data |
| CI logs and test data | GitHub Actions | GitHub's default (90 days) | GitHub | Not applicable: tests use synthetic users only |
| Narrator voice files | The host device's browser (Cache Storage) | Until the browser clears it or another voice is chosen | The browser | Not applicable: on the device only, no player data |
| Guest session on a device | The browser's local storage (Supabase session) | Until the browser clears it | The browser; a refused refresh after the guest is deleted | A deleted guest's browser quietly becomes a new guest (no notice; `web/src/lib/supabase.ts`) |

## Guest cleanup

**Rule.** A guest (`auth.users.is_anonymous`) is deleted when its last use is more than 90 days ago. Last use is the latest of: sign-in (`last_sign_in_at`), a token refresh (`auth.sessions.refreshed_at` / `updated_at`; every visit refreshes the token), joining a room, joining a game, hosting a game, and the guest's creation. A guest in a room that isn't closed, or in a game in progress (as a player or its host), is never deleted, and that is checked again inside the delete. Accounts are never touched.

**Schedule.** `pg_cron` job `delete-unused-guests` runs `select private.delete_unused_guests()` daily at 04:17 UTC, inside the database, so no credential lives outside it. Each run deletes in batches of 500, at most 20 batches (10,000 guests), and the next day continues any backlog. It records one row in `private.cleanup_runs` (`run_at`, `deleted`, `duration_ms`, `error`), one `guests_deleted` audit row with the count, and a database log line `guests deleted: N`. A failed run deletes nothing and records the error (SQLSTATE and message, never row values). No app role can run it.

**Check it:**

```sql
select run_at, deleted, duration_ms, error from private.cleanup_runs order by run_at desc limit 5;
select jobname, schedule, active from cron.job where jobname = 'delete-unused-guests';
select status, return_message, start_time from cron.job_run_details
where jobid = (select jobid from cron.job where jobname = 'delete-unused-guests')
order by start_time desc limit 5;
```

or `GET /v1/admin/cleanup-runs` (admin, the last 30 runs). An alert when no run has been recorded for 26 hours waits for the `observability` task. **Not yet implemented.**

**Run it by hand** (owner, SQL editor; staging first): `select private.delete_unused_guests();` returns the count.

## Sub-processors

Every outside service that stores or sees player data.

| Service | What it gets | Region |
|---|---|---|
| Supabase | The database (everything above) and Supabase Auth: emails, password hashes, sessions, IP addresses in auth logs | AWS us-east-1 |
| Fly.io | Runs `api` and `game`: every request and game message passes through, and stdout logs (user IDs, no emails) | `iad` (Ashburn, Virginia) |
| Vercel | Serves the web app: IP addresses and paths in edge request logs | Global edge network |
| Grafana Labs | Logs, traces, metrics and Faro error reports (user and room IDs, no emails or answers) | The Grafana Cloud stack's region, chosen when the operator creates the stack ([observability.md](./observability.md#1-setting-up-a-stack)) |
| Hugging Face | The host device downloads narrator voices from it, so it sees the host's IP address and browser | Hugging Face's CDN |
| GitHub | Code and CI logs. No player data: CI uses synthetic test users | — |
| Instatus | Incident and Maintenance notice title, body, schedule, and resolution; no player data | Instatus' hosting region for the selected page |

## Offboarding

**Deleting an account on request:** `private.admin_delete_account` from the SQL editor, as in [operator-scripts.md](./operator-scripts.md), "Deleting an account on request". It's audited with the admin as the actor. The account's results stay on scoreboards as "Former player"; logs and backups that mention its ID expire within 30 days.

**"What do you have about me?"** Find the user ID from the email the player gives, then:

1. Run a staff-access grant for the user and read it (`node scripts/staff-access.mjs --env production grant user <id> --reason "Data request"`, then `read`). That covers the profile, account flags, rooms, games with scores, host access and seen-clue count, and is audited.
2. For the rest, run these read-only queries in the SQL editor (`<id>` is the user ID):

```sql
begin read only;
select id, email, is_anonymous, created_at, last_sign_in_at from auth.users where id = '<id>';
select display_name, account_name, show_on_leaderboard, created_at from public.profiles where user_id = '<id>';
select m.room_id, r.code, r.status, m.role, m.display_name, m.joined_at
  from public.room_members m join public.rooms r on r.id = m.room_id where m.user_id = '<id>';
select gp.game_id, g.started_at, g.finished_at, gp.role, gp.display_name, res.score, res.placement
  from public.game_players gp join public.games g on g.id = gp.game_id
  left join public.game_results res on res.game_player_id = gp.id where gp.user_id = '<id>';
select a.game_id, a.answer, a.heard, a.verdict, a.score_delta, a.created_at
  from public.answers a join public.game_players gp on gp.id = a.game_player_id where gp.user_id = '<id>';
select w.game_id, w.amount, w.answer, w.submitted_at
  from public.wagers w join public.game_players gp on gp.id = w.game_player_id where gp.user_id = '<id>';
select count(*) as seen_clues, min(seen_at), max(seen_at) from public.seen_clues where user_id = '<id>';
select created_at, note from public.hosts where user_id = '<id>';
select at, action, subject_type, details from private.audit_log where actor = '<id>' or subject_id = '<id>' order by at;
rollback;
```

Send the player the results. Leave out other players' names: they appear only in scoreboards, and the request covers the player's own data.
