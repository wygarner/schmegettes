# Operator Scripts

**Source of truth:** `scripts/staff-access.mjs`, `api/internal/staffaccess/`, `supabase/migrations/20261121143107_audit_and_staff_access.sql`, `.github/workflows/load-clues.yml`, `.github/workflows/rate-clues.yml`, `.github/workflows/deploy.yml`

Every way a person reaches production data outside the game itself: what each one does, who may run it, and what it logs and audits. If it isn't listed here, don't do it in production. The audit log is described in [data-and-isolation.md](../architecture/data-and-isolation.md), "Audit log and staff access"; the log lines in [logging-conventions.md](./logging-conventions.md), "Security events".

**The owner role is for migrations and the clue catalog only.** Its URL lives in GitHub Environment secrets and never on a laptop for staging or production ([configuration-and-secrets.md](../security/configuration-and-secrets.md)). Everything about a player, room, or game goes through the admin's own account, so `private.require_admin()` checks it and the audit log records it.

| What | How | Who may run it | Logs | Audit rows |
|---|---|---|---|---|
| Look at a player's, room's or game's data | `scripts/staff-access.mjs` (below) | The admin (an account in `private.admins`) | `WARN` "staff access granted" (alerts the admin), `INFO` "staff access read" / "revoked" | `staff_access_granted`, `staff_read` per read, `staff_access_revoked` |
| Read the audit log | `scripts/staff-access.mjs --env … audit` | The admin | The request line | — |
| Reset a player's password | SQL editor (below) | The admin, on the player's request | — | `password_changed`, no actor, `details.via = postgres` |
| Delete an account on request | SQL editor, `private.admin_delete_account` (below) | The admin, on the owner's request or to free a squatted email | — | `account_deleted`, actor the admin, `details.by = admin` |
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
