---
task-type: improvement
task-title: "Audit log, time-limited staff access, and rate limits everywhere"
---
**Task Type:** Improvement. No player-facing UI change.

**Product docs:** No durable product-doc change. System docs: [security-model.md](../../docs/system-docs/security/security-model.md) "Known gaps" (remove the Audit table, Staff access, and Rate limits rows as they close), [data-and-isolation.md](../../docs/system-docs/architecture/data-and-isolation.md), and a new `docs/system-docs/operations/operator-scripts.md`.

**Problem:** Three security gaps are listed as known in [security-model.md](../../docs/system-docs/security/security-model.md), and all three get more serious once the repo is public and the game is shared beyond friends:

1. **No audit trail.** If host access is granted by mistake, an account is deleted, or a password is changed by someone holding a stolen token (also a known gap), nothing records who did it or when.
2. **Staff access is unbounded.** The admin (Wyatt) investigates a player's or room's problem by reading the production database as the owner role, with no record and no time limit. That's the one path around row-level security.
3. **Rate limits cover only some routes.** Room codes, host codes, and admin routes are limited. Every other `api` route can be called as fast as a script can go.

**Outcomes:**
- **An append-only audit table.** Application code can insert but never update or delete rows, enforced by grants and proven by a database test. It records at least:
  - host access granted (host code used) and removed by the admin
  - host code rotated now
  - account created, guest merged into an account, password changed, account deleted (by the player, by the admin, or by the guest cleanup in the `data-retention` task, counted per run)
  - admin password resets, wherever the record can be captured (Supabase Auth's own audit log is an acceptable source)
  - every staff-access grant, and every action taken under one
  Each row has the actor, the subject, the action, when, and a request ID. No emails, passwords, or tokens.
- **A failed audit write never blocks the player**, but it raises a critical alert (through the `observability` task's alerting).
- **Staff access is an explicit, expiring grant.** To look at a player's or room's data in production, the admin runs an operator script that takes a subject (player, room, or game), a reason, and a duration (default 1 hour, maximum 8). It records the grant, then gives read-only access limited to that subject until it expires. Every grant sends Wyatt an alert (so an unexpected grant is noticed). Owner-role access stays limited to migrations and the clue import, as today.
- **operator-scripts.md** lists every script that touches production (staff access, password reset steps, account deletion on request, the clue import) with what it does, who may run it, and what it logs.
- **Every `api` route has a per-user rate limit**, sized from real use with headroom (engineering sets the numbers from a week of production logs, with a floor of what a host can do in a frantic lobby). Responses keep the existing 429 with `Retry-After`.
- **The first security assessment** runs after the above lands and before the repo goes public. Findings go in `docs/security-assessments/{date}/remediation-tracker.md`, as [security-model.md](../../docs/system-docs/security/security-model.md) already describes.

**Player flow:** Nothing visible changes. A player who hits a new rate limit sees the app's existing "Too many tries. Wait a minute and try again." treatment. No real player action should ever hit a limit in normal play, including a host who rapidly changes lobby settings or a contestant who rejoins several times.

**Success Criteria:**
- pgTAP proves `authenticated`, `app_service`, and `game_engine` can't update or delete audit rows, and players can't read them.
- Using a host code, deleting an account, and changing a password in staging each leave exactly one audit row with the right actor and subject.
- A forced audit-write failure lets the action complete and fires the alert.
- A staff-access grant in staging gives read access to the named player only. Another player's data is refused, and after the expiry everything is refused. The grant and each read are in the audit table, and Wyatt receives the grant alert.
- A load test of one user against each `api` route gets 429s above its limit. A scripted full game night (host plus 6 contestants, rematch, rejoin) gets none.
- The Audit table, Staff access, and Rate limits rows are gone from security-model.md's Known gaps, and the assessment's tracker exists.

**Out of scope:** A UI for browsing the audit log (the admin queries it), moving the rate limiter to Redis (needed only with a second `api` instance), per-account sign-in lockout and leaked-password checks (Supabase Auth settings, separate decisions), deciding whether to stop exposing the Supabase Data API (its own known gap), and the LLM judge's safeguards (not built).
