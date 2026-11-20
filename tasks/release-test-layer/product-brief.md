---
jira-type: improvement
jira-title: "End-to-end tests, a boot check in CI, and enforced coverage"
---
**Task Type:** Improvement. No player-facing change.

**Product docs:** No durable product-doc change. System docs: [testing-strategy.md](../../docs/system-docs/engineering/testing-strategy.md) (remove each "Not yet implemented"), [release-strategy.md](../../docs/system-docs/operations/release-strategy.md) step 3, [stack.md](../../docs/system-docs/engineering/stack.md) (runtime pins).

**Problem:** A release is verified today by a person playing through the critical path by hand: sign in, create a room, join by code, buzz, judge, finish. A game needs a host device plus at least two phones, so that check is slow, gets skipped under pressure, and catches only what one person happens to try. Three more gaps from [testing-strategy.md](../../docs/system-docs/engineering/testing-strategy.md):

- **Nothing in CI starts the built services.** A build that fails at boot (a missing module, a bad config read) passes every test and is found only on deploy.
- **Coverage is collected but not enforced.** The floors are written down, and nothing fails when code drops below them.
- **Runtimes are pinned to minor versions** (`node 24`, `go 1.25`, `python 3.13` in `mise.toml`), so CI, laptops, and deploys can quietly run different patch releases.

**Outcomes:**
- **A Playwright suite for the critical path** that plays a real game on a deployed environment, with one browser as the host device (landscape iPhone size, 844 × 390) and two as contestant phones (390 × 844):
  1. Each device starts as a guest; the host enters a host code.
  2. Host creates a room; both phones join with the code and appear in the lobby.
  3. Host starts; the board appears; the player in control picks a clue by tapping.
  4. Buzzing opens after the clue; one phone buzzes first and answers; the verdict is applied and scores change on every screen.
  5. A wrong answer reopens buzzing for the other phone.
  6. The game reaches the end (a test setting or seeded short board is fine) and the scoreboard shows on every device and in My games.
  7. One contestant reloads mid-game and is back in their seat with their score.
  Voice and narration can't be driven reliably in a browser test. The suite uses the tap and typed paths and treats narration as complete through a test hook that exists only outside production. Spoken answers stay covered by unit tests and manual QA.
- **It runs as release verification** against staging, before the release PR merges (release-strategy.md step 3), and can be run on demand. A failure blocks the release the same way red CI does. Each run leaves a trace and screenshots for any failure.
- **CI boots each built service.** For `api` and `game`, CI starts the built image or binary with test configuration and requires `/healthz` to return 200 before the job passes. For `web`, it serves the production build and loads Home without a console error.
- **Coverage floors are enforced** per package at the levels already in [testing-strategy.md](../../docs/system-docs/engineering/testing-strategy.md) §3. A package below its floor fails CI. If a package is below its floor today, its floor starts at its current number and steps up, and the doc says so.
- **Exact runtime pins.** `mise.toml` pins exact patch versions of Node, Go, and Python (and Bun, if it isn't already), and Dependabot or a documented routine keeps them current.

**Success Criteria:**
- The suite passes against staging three runs in a row with no retries, in under 10 minutes.
- Breaking the buzz path on a branch deployed to staging makes the suite fail at step 4 with a screenshot.
- A PR that makes `api` exit at boot fails CI in the boot check, not on deploy.
- A PR that deletes a tested file's tests fails the coverage floor for that package.
- `mise.toml` has no minor-only runtime pins.
- testing-strategy.md has no "Not yet implemented" left for E2E, the boot check, or coverage.

**Out of scope:** Agent QA (the separate `agent-qa` task), visual regression testing, running E2E on every PR (release verification only, per [stack.md](../../docs/system-docs/engineering/stack.md)), load testing, real iOS Safari devices in CI, the LLM eval harness (until the LLM judge exists), and required status checks (not available on this GitHub plan; accepted gap).
