---
task-type: improvement
task-title: "Agent QA: dedicated accounts, production rules, and recorded evidence"
---
# Task spec: agent-qa

Product brief: `tasks/agent-qa/product-brief.md`. **Depends on `stats-and-leaderboard`**: QA accounts must be excluded from the leaderboard and from player-visible stats, and those don't exist until that task lands. Build this one after it. **Related:** `release-test-layer` (its E2E host account can be one of the QA accounts, which avoids a second mechanism) and `security-audit-and-staff-access` (admin writes are audited when it exists).

## Approach

**QA accounts are ordinary Supabase accounts, flagged in the database.** A new `private.qa_accounts (user_id primary key references auth.users on delete cascade, role text check (role in ('host','contestant')), label text, created_at)` marks them. A table rather than a `profiles` column, so players can never read or set the flag: RLS is on with no policies. One security-definer helper, `private.is_qa(uid)`, is used wherever QA accounts must be treated differently.

**Creating them** is an operator script, `scripts/qa-accounts.mjs create --env staging|production`. It:
- signs up 7 accounts through Supabase Auth's normal email and password sign-up (email confirmation is off), with addresses on a domain Wyatt controls (`qa-host@…`, `qa-1@…` … `qa-6@…`; the domain is a config value, not in the repo) and generated passwords;
- prints the passwords once, for Wyatt to save in the password manager;
- signs in as the admin (prompting, no echo) and calls `POST /v1/admin/qa-accounts` with the 7 user IDs and roles. That runs `private.admin_mark_qa(user_id, role, label)`, which inserts into `qa_accounts`, sets each `profiles.account_name` (`QA Host`, `QA 1` … `QA 6`), and for the host inserts into `public.hosts` with `note = 'QA host (permanent)'`.

Host access never expires on rotation (private-access rules), so the QA host never needs a code. The script is idempotent: it skips accounts that exist.

**Exclusions:**
- `private.leaderboard()` (from stats-and-leaderboard) adds `and not private.is_qa(user_id)` to the ranked set, and a QA viewer gets the normal leaderboard without a row of their own.
- `private.my_stats()` works for a QA account (it's their own data). The brief's "excluded from any stats players see" means the leaderboard, the only cross-player view.
- My games is already per-player, so QA games appear only in QA accounts' My games and in the My games of any real player who was in that game. Production rules forbid that game existing.

**Cleanup** is a security-definer function, `private.admin_qa_cleanup(older_than interval, dry_run boolean) returns table(kind text, id uuid)`, called through `POST /v1/admin/qa-cleanup` by `scripts/qa-accounts.mjs cleanup --env … [--apply]`. It removes:
- **rooms** whose every member is a QA account (closing them: `status = 'closed'`, then deleting them if not referenced by a game with a non-QA player);
- **games** whose every `game_players` row is a QA account: delete the game (its answers, board and players cascade) and the QA accounts' `seen_clues` for that game's clues;
- with `older_than`: on production the api forces at least `interval '1 day'`; on staging `0`.

A game or room with **any** non-QA participant is never touched. That rule is in the SQL `where`, not in the script, and is proven by pgTAP. QA accounts themselves are never deleted. `dry_run` (the default) returns what would go without deleting.

**Docs carry the rules:** `docs/system-docs/quality/agent-qa.md` holds:
- the accounts list (labels and emails; passwords "in the password manager");
- when QA is required (the brief's table);
- the production rules as a table of allowed and forbidden actions (verbatim from the brief);
- the session checklist (sign in as QA only; close rooms; leave games; run cleanup on staging);
- the evidence record template (verbatim);
- the human checklist (narrator voice and timing on a real iPhone, a real microphone, the silent switch, AirPlay, Home Screen mode);
- how to run the local stack for QA (`mise run dev` with seeded local QA accounts: `scripts/qa-accounts.mjs create --env local` works against local Supabase);
- screenshot rules.

`AGENTS.md` and `.claude/commands/implement.md` link it and require the evidence record on player-visible PRs.

## Subtasks (narrow → wide)

1. **shared** (additive):
   - `POST /v1/admin/qa-accounts` (body `{accounts: [{userId, role, label}]}` → 204);
   - `POST /v1/admin/qa-cleanup` (body `{olderThanHours, dryRun}` → `{removed: [{kind, id}]}`);
   - `mise run gen`.
2. **supabase**: `supabase migration new qa_accounts`
   - `private.qa_accounts` (RLS on, no policies, app roles revoked) and `private.is_qa(uid)` (security definer, `stable`).
   - `private.admin_mark_qa(...)` and `private.admin_qa_cleanup(...)` (each calls `require_admin()`; executable by `authenticated`).
   - `create or replace private.leaderboard()`: the stats task's body plus the QA exclusion (same signature and grants).
   - pgTAP `supabase/tests/qa_accounts.test.sql`:
     - players can't read `qa_accounts` or call the admin functions;
     - a QA account with 10 wins isn't on the leaderboard, and a real player's rank isn't shifted by it;
     - cleanup deletes an all-QA game, its answers and the QA players' seen clues for it;
     - cleanup **refuses** a game where one non-QA player took part (row kept; this is the brief's proof);
     - cleanup keeps everything newer than `older_than`;
     - `dry_run` deletes nothing;
     - QA accounts survive cleanup.
3. **api**: `api/internal/admin`: the two routes behind the admin limiter. Production (`ENV=production`) clamps `olderThanHours` to at least 24. Log `INFO` "qa accounts marked" (count) and "qa cleanup" (`dry_run`, counts per kind). Handler tests, including the production clamp.
4. **scripts**:
   - `scripts/qa-accounts.mjs` with `create`, `cleanup` and `list`, plus `--env local|staging|production`. It reads the Supabase URL and anon key per environment from the same config devtools uses (`devtools/.env.local` keys), prompts for the admin password, and never writes passwords to disk or logs.
   - Unit tests for argument parsing, the production dry-run default, and refusing `--apply` on production without `--yes`.
5. **docs and agent instructions**:
   - new `docs/system-docs/quality/agent-qa.md` (contents above);
   - `testing-strategy.md`: the Agent QA line now links it;
   - `development-workflow.md` step 3: "Player-visible changes: agent QA on the local stack per agent-qa.md, with the evidence record on the PR";
   - `release-strategy.md` step 3 (agent QA on staging after E2E, recorded in the release's internal notes) and step 6 (production smoke within the production rules);
   - `AGENTS.md` and `.claude/commands/implement.md`: link agent-qa.md, require the evidence record for player-visible changes, and add the never-list's production rules in one line each;
   - `stats-and-leaderboard/feature-brief.md`: "QA accounts never appear on the leaderboard." (the brief asks engineering to add it);
   - `operator-scripts.md` (if the security task landed): add `qa-accounts.mjs`.
6. **Operator steps** (Wyatt, after merge; listed in the PR): run `create` on staging and production, save the passwords in the password manager, and put the QA host's email in `agent-qa.md`. If `release-test-layer` uses a dedicated E2E host, it can be the QA host (set `E2E_HOST_EMAIL`/`E2E_HOST_PASSWORD` to it).
7. **Proof run** (success criterion): an agent QAs one real player-visible PR on the local stack following `agent-qa.md` and posts a complete evidence record. Pick the next player-visible PR after this merges, and link it from this task's PR as follow-up evidence.

## Key files

`shared/openapi.yaml` (+ generated), `supabase/migrations/<new>_qa_accounts.sql`, `supabase/tests/qa_accounts.test.sql`, `api/internal/admin/`, `scripts/qa-accounts.mjs` (+ test), `docs/system-docs/quality/agent-qa.md` (new), `docs/system-docs/engineering/{testing-strategy,development-workflow}.md`, `docs/system-docs/operations/release-strategy.md`, `AGENTS.md`, `.claude/commands/implement.md`, `docs/product-docs/features/stats-and-leaderboard/feature-brief.md`.

## Contracts preserved

Additive: two admin routes. `private.leaderboard()` keeps its signature; QA accounts simply don't rank.

## Success criteria

The product brief's criteria:
- QA accounts exist in staging and production;
- a QA game in staging leaves the staging leaderboard without them and changes no real player's My games or seen clues;
- an agent posts a complete evidence record for a real PR on the local stack;
- a production smoke leaves no open room and no finished game;
- cleanup refuses any game with a non-QA player (pgTAP);
- `/implement` and `AGENTS.md` link `agent-qa.md` and require the record.

## Test plan

- `mise run db:test` (`qa_accounts.test.sql`, plus `stats_and_leaderboard.test.sql`, which must still pass)
- `mise run test:api -- ./internal/admin/...`
- `node --test scripts/qa-accounts.test.mjs` (or the repo's scripts test runner)
- Manual: the operator steps, a staging QA session with cleanup, and the proof run.

## Database migration plan

- File: `supabase migration new qa_accounts`.
- Table: `private.qa_accounts` (RLS on, no policies, app roles revoked).
- Functions: `is_qa`, `admin_mark_qa` and `admin_qa_cleanup` (admin-checked), plus a replaced `leaderboard()` (same signature).
- pgTAP as above.
- Compatible with running code: a new table, and a function whose only change is excluding rows.

## Logging requirements

- `INFO` "qa accounts marked" (count) and "qa cleanup" (`dry_run`, counts by kind). Never emails, passwords or IDs beyond counts.
- Screenshots in evidence records never show a password or host code (rule in `agent-qa.md`).

## Docs to update

As in subtask 5.
