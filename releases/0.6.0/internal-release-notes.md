# 0.6.0 internal notes

## Before merging
- **GitHub Actions jobs do not start** (billing). On Wyatt's instruction this release was cut without:
  - **CI:** no package job ran on any PR in this release, nor on the combined `develop`. Every PR ran only targeted local tests; see each PR.
  - **Staging rehearsal:** no Deploy Staging run started, so none of the five migrations below has been applied to a hosted database.
  - **End-to-end on staging, and agent QA:** not done (Wyatt: no QA for this release).
- **Deploy:** `deploy-prod.yml` won't start, so merging this PR does not put it live. 0.5.0 was deployed by hand; this one is waiting on Wyatt's decision. Record how it gets deployed under "After deploy".

## Migrations
Five, additive, applied in this order:
1. `20261121143107_audit_and_staff_access` (#264): `private.audit_log`, `private.staff_grants` (RLS on, no policies, every app role revoked), `private.audit(...)` and audit calls added to `redeem_host_code`, `admin_remove_host`, `admin_rotate_host_code`, `merge_guest`, `delete_account` (same signatures and grants); triggers on `auth.users`; staff-access and audit admin functions. pgTAP `audit_and_staff_access.test.sql`.
2. `20261121160042_guest_cleanup` (#265): **enables `pg_cron`** and schedules `delete-unused-guests` at `17 4 * * *` (UTC); index on `games.host_user_id`; `private.cleanup_runs`; `delete_unused_guests(cutoff)`, which no app role can execute. pgTAP `guest_cleanup.test.sql`. #265 asks for a manual staging run, with the count recorded, before production.
3. `20261121161615_qa_accounts` (#266): QA account markers (RLS-locked), audited admin provisioning, leaderboard exclusion, all-QA cleanup. pgTAP `qa_accounts.test.sql`.
4. `20261121200000_caller_is_admin` (#281): `private.caller_is_admin()` returns a boolean for the caller only; `authenticated` only. pgTAP in `private_access.test.sql`.
5. `20261121210000_rename_member` (#282): `public.rename_member(room, user, name)`, `game_engine` only; like `set_member_name` without remembering the name. pgTAP in `lobby.test.sql`.

Each is compatible with the code already running: new tables and functions, and changed bodies keep their signatures and grants.

## Contracts
All additive, so no subprotocol or `/v2` bump:
- REST: staff-access and audit admin routes (#264), QA admin routes (#266), optional `Profile.isAdmin` (#281, present only for admins).
- WebSocket: optional `userId` on `set_display_name` (#282). An older client never sends it.

## Config changes
- **Rate limits on every api route** (#264): `read` 120/40, `write` 60/20, `room-options` 120/40, plus the existing stricter groups. A client that polls hard will now see 429s.
- **pg_cron** must be available on both Supabase projects (enabled by migration 2).
- New operator scripts: `scripts/staff-access.mjs` (#264) and `scripts/qa-accounts.mjs` (#266). No new deploy secrets.
- New web dependency: `qrcode-generator` 2.0.4 (MIT).

## After deploy
- **Deployed by hand on 2026-11-21** at `cd9b3c1` (the merge of #283), because `deploy-prod.yml` doesn't start. Same steps and flags as `deploy.yml`:
  - **Migrations:** `supabase db push --linked --include-all` on staging first (the rehearsal), then production. Each dry run listed exactly the five migrations above, and each applied cleanly, `pg_cron` included. Staging code wasn't redeployed, so staging has the new schema under the old code. The `supabase link` and `db push` deny rules were lifted in `.claude/settings.json` for this, by Wyatt.
  - **api, game:** `flyctl deploy` (remote builder), image label `cd9b3c16b8585fae3d708c8e9cb733e2a625f8ce`, `APP_ENV=production`, game with `--ha=false`. Both machines passed their health checks.
  - **web:** built with the production variables and `VITE_ENV=production` (no `__e2e` in the bundle), then `web/scripts/vercel-deploy.mjs` with the Vercel token from `devtools/.env.local`; Vercel deployment `dpl_HtzuvQreLa7HwZKWwcNZshyv61zj`.
- **Verified:** every address in `PROD_VERSION_URLS` reports `cd9b3c1`; `/healthz` returns 200 on api and game; `/v1/me` returns 401 without sign-in; no error or warning lines in the api or game logs after the deploy.
- **Production health confirmed by Wyatt:** pending (this sign-off merges only after it).
- Operator follow-ups once live:
  - **QA accounts:** run `node scripts/qa-accounts.mjs --env staging create` and the production equivalent; save the passwords in the password manager (#266).
  - **Guest cleanup:** a manual staging run with its count recorded (#265).
  - **Security assessment:** before the repo goes public (#264).
  - **Admin row:** the owner's account must be on each environment's admin list for the new Admin row to appear.

## Known issues
- `scripts/release-scope.cjs` matches `GH-{N}` only, so it lists 3 of the 7 tasks in this release; the other four were added to `tickets.md` by hand.
- On the host device during a game, the Home button sits at the top of the player column rather than the stage's top-left, because the board fills the stage (navigation docs).
- `private_access.test.sql` test 63 fails on a local database that already holds dev host rows; not on a fresh one.
- The QR code hasn't been scanned off a real mirrored TV.
