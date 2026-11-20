---
jira-type: bug-fix
jira-title: "Staging runs again"
---
**Task Type:** Bug Fix. Staging is meant to be the always-current copy of `develop` that rehearses every migration and every release ([deployment.md](../../docs/system-docs/operations/deployment.md), [release-strategy.md](../../docs/system-docs/operations/release-strategy.md)). It is down, so no release can be verified.

**Product docs:** No durable product-doc change.

**Problem:** As of 2026-11-19 (evidence gathered around 00:15 UTC on 2026-11-20):

- `https://schmegettes-api-staging.fly.dev/healthz` and `https://schmegettes-game-staging.fly.dev/healthz` time out. `fly status` shows both machines **stopped** after hitting Fly's max restart count of 10.
- The api log on every boot: `database unavailable … failed SASL auth: FATAL: password authentication failed for user "app_service" (SQLSTATE 28P01)` against the staging pooler (`aws-0-us-east-1.pooler.supabase.com:6543`). The process exits with code 1, Fly restarts it, and it gives up.
- **Deploy Staging** last succeeded at 2026-11-19 03:46 UTC. Every run since (03:54, 22:43, 23:46 UTC) failed in **Migrate (staging)**, so nothing after that point reached staging, and the deploy jobs were skipped.
- Production (`-prod`) `/healthz` on api and game returns 200; production is not affected.

The evidence points to staging database credentials (the `app_service` password and, given the migration failures, probably the owner URL) no longer matching the staging Supabase project, not to an application bug. Engineering should confirm the cause, including whether `game` fails the same way, rather than assume it.

**Outcomes:**
- Both staging services boot, stay up, and answer `/healthz` with 200. `/version` reports the current `develop` commit.
- **Deploy Staging** runs end to end on the next merge into `develop`: migrations, api, game, web, and deployed-commit verification all pass.
- The cause is written down, and the fix keeps it from silently happening again: if a credential rotation caused it, the rotation steps in [configuration-and-secrets.md](../../docs/system-docs/security/configuration-and-secrets.md) cover every place the credential lives (Fly secret, GitHub Environment secret, worker).
- [configuration-and-secrets.md](../../docs/system-docs/security/configuration-and-secrets.md) no longer says `STAGING_SUPABASE_DB_OWNER_URL` and `PROD_SUPABASE_DB_OWNER_URL` are "not set yet": both are set in their GitHub Environments.

**Player flow:** Players never touch staging. The tester flow that must work again: open the staging web app → sign in as a guest → create a room → join from a second device → play a clue. Any step that needs the api or game currently fails.

**Success Criteria:**
- `curl https://schmegettes-{api,game}-staging.fly.dev/healthz` returns 200, and `/version` returns the deployed `develop` SHA.
- The first Deploy Staging run after the fix is green in every job, including Migrate and Verify deployed commit.
- The staging tester flow above completes on a phone and a host device.
- Production api and game stay at 200 throughout; no production secret changes unless the cause is shown to affect production too.

**Out of scope:** Alerting on a down staging (the separate `observability` task), required checks / branch protection (accepted gap), changing hosting providers, and any change to Supabase roles or RLS beyond restoring the existing credentials.
