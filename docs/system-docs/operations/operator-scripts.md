# Operator Scripts

**Source of truth:** `scripts/staff-access.mjs`, `scripts/qa-accounts.mjs`, `api/internal/staffaccess/`, `api/internal/admin/`, `supabase/migrations/20261121143107_audit_and_staff_access.sql`, `supabase/migrations/20261121161615_qa_accounts.sql`, `.github/workflows/load-clues.yml`, `.github/workflows/rate-clues.yml`, `.github/workflows/deploy.yml`, `scripts/history-scan.sh`

Every way a person reaches production data outside the game itself: what each one does, who may run it, and what it logs and audits. If it isn't listed here, don't do it in production. The audit log is described in [data-and-isolation.md](../architecture/data-and-isolation.md), "Audit log and staff access"; the log lines in [logging-conventions.md](./logging-conventions.md), "Security events".

**The owner role is for migrations and the clue catalog only.** Its URL lives in GitHub Environment secrets and never on a laptop for staging or production ([configuration-and-secrets.md](../security/configuration-and-secrets.md)). Everything about a player, room, or game goes through the admin's own account, so `private.require_admin()` checks it and the audit log records it.

| What | How | Who may run it | Logs | Audit rows |
|---|---|---|---|---|
| Look at a player's, room's or game's data | `scripts/staff-access.mjs` (below) | The admin (an account in `private.admins`) | `WARN` "staff access granted" (alerts the admin), `INFO` "staff access read" / "revoked" | `staff_access_granted`, `staff_read` per read, `staff_access_revoked` |
| Read the audit log | `scripts/staff-access.mjs --env … audit` | The admin | The request line | — |
| Reset a player's password | SQL editor (below) | The admin, on the player's request | — | `password_changed`, no actor, `details.via = postgres` |
| Delete an account on request | SQL editor, `private.admin_delete_account` (below) | The admin, on the owner's request or to free a squatted email | — | `account_deleted`, actor the admin, `details.by = admin` |
| Answer "what do you have about me?" | A staff-access read, then read-only queries in the SQL editor ([data-retention.md](./data-retention.md#offboarding)) | The admin, on the player's request | As for staff access | As for staff access |
| Run the guest cleanup by hand | SQL editor: `select private.delete_unused_guests();` (it runs daily on its own) | The admin; staging first | Database log `guests deleted: N` | `guests_deleted` with the count |
| Provision or clean dedicated QA accounts | `scripts/qa-accounts.mjs` (below) | The admin; staging before production | `INFO` "qa accounts marked", "qa cleanup" (counts only) | `qa_account_marked`, `qa_cleanup` |
| Host code, hosts, host notes | devtools **Admin** page | The admin | `INFO` "host code rotated", "host access removed", "host note updated" | `host_code_rotated`, `host_access_removed` |
| Load clue seasons | `load-clues.yml` (Actions, `workflow_dispatch`), worker `import-clues` as the owner | Anyone with write access to the repo; production only from the `production` branch | Worker job lines | — (catalog only, no player data) |
| Rate clue difficulty | `rate-clues.yml` (Actions), worker `rate-clues` as the owner | Same as above | Worker job lines | — (catalog only) |
| Migrations | `deploy.yml` on a deploy, as the owner | The deploy workflow only; never `supabase db push` from a laptop | Workflow logs | — |

## Staff access

`scripts/staff-access.mjs` signs in as the admin and calls the api's admin routes. It asks for the admin's email and password (the password isn't echoed or stored) and prints the api's JSON. It reads the environment's Supabase URL, public anon key and api URL from `VITE_{ENV}_SUPABASE_URL`, `VITE_{ENV}_SUPABASE_ANON_KEY` and `VITE_{ENV}_API_URL`, in the process environment or `devtools/.env.local` (the Admin page's settings).

```bash
# Grant: a subject (user, room, or game), a reason, and a duration (default 60 minutes, at most 480)
node scripts/staff-access.mjs --env production grant user <userId> --reason "Missing game after a rejoin" --minutes 30
# Read, while the grant is active (each read is audited)
node scripts/staff-access.mjs --env production read <grantId>
# End it early when done
node scripts/staff-access.mjs --env production revoke <grantId>
# The audit log, newest first, at most 500 entries
node scripts/staff-access.mjs --env production audit --subject <userId>
```

- A grant gives read access to that one subject, in a fixed shape: a user's profile, account flags, rooms, games with scores, host access and seen-clue count; a room's options and members; a game's players, board, and answers with verdicts. Never emails, password hashes, or tokens.
- Another subject needs another grant. An expired, revoked, or other admin's grant answers 403 `grant-inactive`.
- The reason is stored with the grant and is never logged. Write what you're investigating, not the player's personal details.
- Every grant logs `WARN` "staff access granted". A grant you didn't make means someone has the admin's password: change it and check the audit log.
- Rate limit: the admin routes allow 5 calls a minute.

## QA accounts

`scripts/qa-accounts.mjs` uses normal Supabase sign-up, then signs in as the admin and calls the rate-limited admin API. It reads `VITE_{ENV}_{SUPABASE_URL,SUPABASE_ANON_KEY,API_URL,QA_ACCOUNT_DOMAIN}` from the process environment or `devtools/.env.local`. Passwords are printed once during creation and never stored by the script.

```bash
node scripts/qa-accounts.mjs --env staging create
node scripts/qa-accounts.mjs --env staging list
node scripts/qa-accounts.mjs --env staging cleanup              # dry run
node scripts/qa-accounts.mjs --env staging cleanup --apply
node scripts/qa-accounts.mjs --env production cleanup           # at least 24 hours, dry run
node scripts/qa-accounts.mjs --env production cleanup --apply --yes
```

Cleanup is enforced in SQL: it refuses a room or game containing any non-QA participant and never deletes the QA accounts. Full operating and production rules are in [agent-qa.md](../quality/agent-qa.md).

## Resetting a password

There is no reset email ([deployment.md](./deployment.md), "Resetting a player's password"). In the project's SQL editor:

```sql
update auth.users
set encrypted_password = extensions.crypt('<new password>', extensions.gen_salt('bf'))
where email = lower('<their email>');
```

The `auth.users` trigger records `password_changed` with no actor and `details.via = postgres`.

## Deleting an account on request

Use the function, not Authentication → Users, so the deletion is checked the same way as a player's own and audited with the admin as the actor. In the SQL editor, as one transaction, with the admin's own user ID as the caller:

```sql
begin;
select set_config('request.jwt.claims',
  json_build_object('sub', '<admin user id>', 'role', 'authenticated')::text, true);
select private.admin_delete_account((select id from auth.users where email = lower('<their email>')));
commit;
```

It refuses a user who is in a game in progress (`55006`); try again after the game. The account's results stay on other players' scoreboards as "Former player" ([data-and-isolation.md](../architecture/data-and-isolation.md), "History outlives rooms and accounts").

## History secret scan

`scripts/history-scan.sh` scans every commit on every local and remote-tracking ref for secrets with the same gitleaks version (8.30.1, run through `mise exec`) and `.gitleaks.toml` as CI. Run it before history becomes public: before the repository was made public, and before any long-lived branch from elsewhere is pushed.

```bash
git fetch --prune origin
scripts/history-scan.sh ~/history-scan.json    # the report must be outside the repository
```

It prints only aggregates: finding counts by rule and by file, and the number of distinct commit author and committer emails with their domains (never full addresses). The JSON report is redacted; delete it once every finding is classified. A provable false positive gets a narrow `.gitleaks.toml` allowlist entry; anything else is rotated ([configuration-and-secrets.md](../security/configuration-and-secrets.md#3-owners-and-rotation)). Exit status: 0 clean, 1 findings, anything else a scan error. Anyone with a checkout may run it; it reads no credentials.
