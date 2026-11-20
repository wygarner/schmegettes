---
jira-type: enhancement
jira-title: "Expire unused guests and write down what we keep"
---
**Task Type:** Enhancement to [accounts](../../docs/product-docs/features/accounts/feature-brief.md) and [game history](../../docs/product-docs/features/game-history/feature-brief.md). Account deletion already exists. This adds the rest of the data lifecycle.

**Product docs:** [accounts/feature-brief.md](../../docs/product-docs/features/accounts/feature-brief.md) ("What we keep, and for how long", and the 2026-11-19 decision), [accounts/interaction-design.md](../../docs/product-docs/features/accounts/interaction-design.md) (edge cases), [game-history/feature-brief.md](../../docs/product-docs/features/game-history/feature-brief.md) ("Accounts and deletion"). New system doc: `docs/system-docs/operations/data-retention.md`.

**Problem:** Every guest ever created stays in the database forever, with their game history and seen clues. Safari alone drops a guest after about 7 days without a visit, so most guests are abandoned within weeks, but their data never goes away. Game history has always said "any cleanup of old anonymous accounts follows the deletion rule", but no cleanup exists. Nothing written down says how long logs, error reports, or backups are kept, or which outside companies hold players' data. All of that has to be answered before the repo goes public and before players outside the friend group arrive.

**Outcomes:**
- **Unused guests are deleted after 90 days**, following the existing deletion rule: results stay on scoreboards as "Former player", and seen clues and host access are deleted. "Used" means any sign-in, token refresh, join, host, or game. A guest in an open room or a game in progress is never deleted. A guest that became an account, or was moved into one, isn't a guest.
- **The cleanup runs on its own** daily, in staging and production, and logs how many guests it deleted (counts only, no IDs).
- **Retention is enforced, not just written:** logs and error reports at most 30 days (set in Grafana Cloud by the `observability` task), backups 30 days (the `backups-and-restore` task). data-retention.md lists each, where it's enforced, and how to verify it.
- **data-retention.md** records, for each kind of data: what it is, where it lives, how long it's kept, what deletes it, and what happens on account deletion. That includes the cases a deleted account leaves behind (backups up to 30 days, logs up to 30 days, "Former player" rows on scoreboards).
- **A sub-processor list** in data-retention.md: every outside service that stores or sees player data, what it gets, and its region. At least Supabase (database, auth), Fly.io (api, game), Vercel (web), Grafana Labs (logs, errors), Hugging Face (the host device downloads narrator voices from it, so it sees the host's IP address), the backup storage provider, and the status-page service.
- **The admin's offboarding steps** in data-retention.md: deleting an account on request (the squatted-email case in [accounts](../../docs/product-docs/features/accounts/feature-brief.md#admin)), and answering "what do you have about me?" for a player, with the exact queries.

**Player flow:**
- Day 0: a guest plays a game on Chrome and never comes back.
- Day 90: the next daily cleanup deletes the guest. Other players' scoreboards for that game now show "Former player" in that seat. Their scores and placements are unchanged.
- Day 120: the same browser opens Schmegettes. Its saved session no longer works, so it silently becomes a new guest with no history, as if the browser data had been cleared. No "signed out" banner, since it was never signed in.
- A guest who plays every few weeks is never affected. Each visit resets the 90 days.
- A guest who entered a host code and goes unused for 90 days loses host access with the guest, and needs a current host code again ([private access](../../docs/product-docs/features/private-access/feature-brief.md)).
- Leaderboard and stats are unaffected: guests aren't on them ([stats and leaderboard](../../docs/product-docs/features/stats-and-leaderboard/feature-brief.md)).

**Success Criteria:**
- In staging, a guest whose last use is set to 91 days ago is deleted by the next run. One at 89 days is kept. One at 91 days who is in an open room is kept.
- After the deletion, a scoreboard that guest played on shows "Former player" with the same score, and the guest's seen-clue rows are gone.
- A signed-in account last used 2 years ago is never touched.
- The cleanup can't be run against a game in progress or open room, proven by a database test (pgTAP).
- data-retention.md exists, and every row in its tables names the job or setting that enforces it.

**Out of scope:** A privacy policy or terms page shown to players (a separate decision before public launch), self-service "download my data", deleting accounts that are signed in but inactive, shortening how long games are kept (permanent, by design), and warning a guest before deletion (there's no way to reach one).
