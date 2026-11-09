---
jira-type: improvement
jira-title: "System docs required by the bootstrap guide v2 (security, testing, config, comms)"
---

**Task Type:** Improvement

**Problem:** The bootstrap guide (Everlo-Software/global `new-project-bootstrap-guide-v2.md`, updated 2026-11-05) now requires security, data-protection, observability, and testing docs that this repo doesn't have. Several of them can't wait for hosting: they decide what gets built before launch (rate limits, an audit table, an error tracker) and who answers when something breaks. Without them, those gaps exist only in a chat transcript, and each later task would make the decisions again.

**Outcomes:**

- `stack.md` has the rows the guide added, each with a decision (or "Decision needed" with a recommended default):
  - log retention and access
  - error tracker (server and client)
  - alert routing, uptime checks, and who is on call
  - backups, off-account export, RPO and RTO
  - config switch mechanism
- `docs/system-docs/security/security-model.md` exists with:
  - trust boundaries for web, api, game, worker, Supabase, Redis, CI, and agents
  - roles: anonymous player, linked player, host, `app_service`, `game_engine`, owner
  - a **Known gaps** list. It starts with rate limits, an audit table, staff access, secret rotation, telemetry shipping, and a client error tracker.
- `docs/system-docs/security/configuration-and-secrets.md` exists. It lists:
  - every secret, with its owner, where it lives, and how to rotate it
  - every config switch, with its default, what turning it off does, and who may change it ("none yet" is a valid answer)
  - the three kinds of observability credential (guide §5)
  
  It absorbs the secrets table now in `deployment.md`, so the table lives in one place.
- `docs/system-docs/engineering/testing-strategy.md` exists. It covers:
  - test layers and when each runs
  - the two areas with dedicated tests: room isolation (RLS) and auth guards
  - coverage floors per package, written as planned until CI enforces them
  - the rules for features, bug fixes, and refactors
- `release-strategy.md` has the communication table (guide §12), with a named owner for each row.
- `development-workflow.md` has the doc-accuracy rules:
  - code wins
  - every implementation PR fixes the docs it makes untrue
  - each system doc names its source of truth at the top
  - unbuilt work is marked "Not yet implemented"
  - docs are audited before each minor release
- Every existing system doc gets a "Source of truth" line at the top.
- `docs/system-docs/README.md` links the new docs.

**Player flow:** None. Docs only, no player-facing change. The one player-visible decision is the communication table's "Players" rows (see Decisions Needed).

**Success Criteria:**

- Every new or changed statement matches the code today, or is marked "Not yet implemented" or "Decision needed".
- Each new doc names its source of truth.
- No secrets, tokens, or real credentials appear in any doc.
- A reader can answer "what's the plan for X before launch?" for each Known gap without reading the bootstrap guide.

**Out of scope:**

- Any code or config change (rate limits, the audit table, OpenTelemetry, error tracking, coverage thresholds)
- Docs that depend on choosing hosts: `observability.md`, `incident-response.md`, `disaster-recovery.md`, `data-retention.md`, `operator-scripts.md`, `agent-qa.md`. List them as follow-ups in `security-model.md` Known gaps or the README, so they aren't lost.
- Choosing hosts
