---
task-type: improvement
task-title: "Off-account backups and a tested restore"
---
**Task Type:** Improvement. No player-facing UI change.

**Product docs:** No durable product-doc change. New system doc: `docs/system-docs/operations/disaster-recovery.md`. Update the "Backup" row in [stack.md](../../docs/system-docs/engineering/stack.md) and the "Docs that need hosting first" row in [security-model.md](../../docs/system-docs/security/security-model.md).

**Problem:** Everything players keep lives in one Supabase project per environment: accounts, game history, scoreboards, seen clues (which keep boards fresh), stats and the leaderboard, host access, and the imported clue catalog. The only copy outside the live database is Supabase's own managed backups, inside the same account. If that account is lost, locked, or compromised, or a bad migration or operator mistake deletes data and Supabase's backups don't cover it, every player's history is gone and the leaderboard resets.

[stack.md](../../docs/system-docs/engineering/stack.md) already decided the targets: **RPO 24 h, RTO 4 h**, with a scheduled logical export (`pg_dump`) to storage in a separate account. None of it is built, and a restore has never been tried.

**Outcomes:**
- **A daily production export, off-account.** Once a day, a scheduled job exports the production database to object storage in an account separate from Supabase, Fly, and Vercel. It covers the `public` schema **and** the auth users, so a restore brings back accounts and passwords, not orphaned history. The export is encrypted, and the key is not stored with the files.
- **Kept 30 days, then deleted.** Exports older than 30 days are deleted automatically. This also bounds how long a deleted account's data survives in backups (the `data-retention` task relies on it).
- **A failed or missing export alerts.** If no successful export lands for 26 hours, Wyatt is emailed (through the alerting built in the `observability` task; until that exists, a failed scheduled-job run notifies by GitHub's default email).
- **Three written recovery procedures** in disaster-recovery.md, each with exact commands:
  1. **Full restore:** rebuild production into a fresh Supabase project from the latest export, point `api`, `game`, and `web` at it (every secret to change is listed, from [configuration-and-secrets.md](../../docs/system-docs/security/configuration-and-secrets.md)), and verify. This must fit in the 4 h RTO.
  2. **One game or room recovered:** restore the export into a scratch database and copy back the rows for one game (its results, scoreboard, and the players' seen clues) without touching anything else.
  3. **One player recovered:** the same for one account's history and stats, for example after an accidental deletion request done to the wrong account.
- **A restore drill, done and dated.** The full restore is rehearsed against staging (or a scratch project) from a real production export. disaster-recovery.md records the date, how long it took, and anything that went wrong, and the drill repeats every 6 months.

**What players experience in a restore:** Nothing changes in the game rules. After a full restore, up to 24 hours of games can be missing: those games disappear from My games, scoreboards, and stats, and their clues count as unseen again. Anyone who created an account in that window must create it again. A player-facing notice for this is the `service-notices` task's job; disaster-recovery.md links to it.

**Success Criteria:**
- Seven consecutive daily exports exist in the separate account. A test file dated 31 days ago is removed by the expiry rule; one dated 29 days ago is kept.
- An export file can't be read without the separately stored key.
- The drill restores a production export into a scratch project. A guest and a signed-in account from that export can sign in against it and see their history, and the clue catalog row count matches production. Measured time is under 4 h.
- Deleting a test game in staging and running procedure 2 brings it back exactly, scoreboard included, with no other row changed.
- Disabling the export job for a day fires the missing-export alert.

**Out of scope:** Point-in-time recovery (the paid Supabase add-on; RPO 24 h doesn't need it), backing up staging (it can be rebuilt from migrations and the clue import), backing up Fly or Vercel (stateless; config is in the repo), multi-region failover, and how long players' data is kept (the `data-retention` task).
