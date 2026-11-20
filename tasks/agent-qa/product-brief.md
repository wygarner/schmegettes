---
task-type: improvement
task-title: "Agent QA: dedicated accounts, production rules, and recorded evidence"
---
**Task Type:** Improvement. Workflow and test-data change; no player-facing UI.

**Product docs:** Small durable change: [stats and leaderboard](../../docs/product-docs/features/stats-and-leaderboard/feature-brief.md) must say that QA accounts never appear on the leaderboard (engineering adds the line with the implementation). New system doc: `docs/system-docs/quality/agent-qa.md`. Update [testing-strategy.md](../../docs/system-docs/engineering/testing-strategy.md) (the "Agent QA" line), [development-workflow.md](../../docs/system-docs/engineering/development-workflow.md) step 3, [release-strategy.md](../../docs/system-docs/operations/release-strategy.md) steps 3 and 6, `AGENTS.md`, and the `/implement` command.

**Problem:** Most changes here are implemented by agents, and the definition of done is "CI is green". Green CI doesn't prove a change works in the real app: the narrator skipping clues (`narrator-skips-clues`) passed every test and was found by a person playing. Agents can already drive a browser, but there are no rules for it:

- **No QA identities.** An agent testing on staging or production uses whatever guest its browser makes, or a real person's account. Its games land in real history, use up clues as "seen", and would count toward stats and the leaderboard.
- **No production rules.** Nothing says what an agent may do in production (create a room? finish a game? use the admin page?) or must never do.
- **No evidence or cleanup record.** "I checked it" in a PR isn't reviewable, and leftover test rooms and games are never removed.
- **No line between agent and human QA.** Some things an agent can't test, such as the narrator's voice, a real microphone, iOS audio, or AirPlay to a TV. Nothing says when a human must check.

**Outcomes:**
- **Dedicated QA accounts per environment:** one QA host (with permanent host access, so no agent ever needs a current host code) and six QA contestants, created by an operator script and listed in agent-qa.md. Their passwords live in a password manager and the local environment, never in the repo or `.claude/settings*.json`. The accounts are marked as QA in the database, so they are **excluded from the leaderboard** and from any stats players see, and their games appear only in their own My games.
- **When agent QA is required:**

  | Change | Where | When |
  |---|---|---|
  | Any player-visible change (new feature, enhancement, bug fix with a UI or gameplay effect) | Local stack (`mise` dev) | Before the implementation PR is marked ready; recorded on the PR |
  | Every release | Staging | Release verification, after the automated end-to-end suite (`release-test-layer` task) |
  | Every production deploy | Production | Smoke only, within the production rules below |
  | Internal changes with no visible effect | — | Not required |

- **Production rules** (agent-qa.md, as a table of allowed and forbidden actions). Allowed, with QA accounts only: sign in, create a room, join it, play up to one clue, leave, and close the room. Forbidden: finishing a game in production (it writes history and seen clues), touching any non-QA account or room, the admin page (host codes, host access, notices), the owner role, staff access, or any write through the Supabase dashboard. An agent that needs something forbidden stops and asks Wyatt.
- **Cleanup:** every QA session ends by closing its rooms and leaving its games. A QA cleanup script removes QA accounts' rooms, games, and seen clues in staging on demand, and in production only for rows older than a day that belong only to QA accounts (never a game a real player was in). The QA accounts themselves are never deleted.
- **A standard evidence record**, posted as a PR comment (or added to the release's internal notes), with this shape:

  ```markdown
  ### QA: {pass | fail | partial}
  **Environment:** local | staging | production · **Commit:** {sha} · **By:** {agent or person}
  **Devices:** host 844×390, phone 390×844 ×2 (or a real device)
  | Step | Expected | Result | Evidence |
  |---|---|---|---|
  **Not tested (needs a human):** {e.g. narrator voice on iPhone}
  **Cleanup:** rooms closed {codes}; cleanup script run {yes/no}
  ```

  Screenshots are attached, never contain anything but QA accounts, and never show a password or host code.
- **The human checklist**, in agent-qa.md, for what agents can't test: narrator voice and timing on a real iPhone host, spoken answers through a real phone microphone, the iOS silent switch, AirPlay to a TV, and Home Screen web-app mode. A release that changes any of these needs a human check, noted in the evidence record.

**Success Criteria:**
- The QA accounts exist in staging and production. After a QA game in staging, the leaderboard (staging) doesn't show them, and no real player's My games or seen clues changed.
- An agent following agent-qa.md QAs a real player-visible PR end to end on the local stack and posts a complete evidence record, with no human help beyond approving the run.
- A production smoke run by an agent leaves no open room and no finished game.
- The cleanup script, pointed at production, refuses any game a non-QA player was in (proven by a test).
- `/implement` and `AGENTS.md` link agent-qa.md and require the evidence record for player-visible changes.

**Out of scope:** The automated Playwright suite (the `release-test-layer` task), simulating voice or microphone input, device farms or real-device clouds, a QA environment separate from staging, and QA for devtools prototypes.
