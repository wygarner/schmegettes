---
task-type: improvement
task-title: "Remove the marketing and revenue agents"
---
**Task Type:** Improvement. Internal tooling only; no player-facing change.

**Product docs:** No durable product-doc change.

**Problem:** The repo ships six agent commands in `.claude/commands/`. Two of them, `/marketing` and `/revenue`, are not part of the delivery lifecycle in [development-workflow.md](../../docs/system-docs/engineering/development-workflow.md), have not been changed since bootstrap (apart from the trademark rename in #37), and produce no files in the repo. They still appear in the README's agent list and in every session's skill list, which suggests a marketing and pricing workflow the project does not run. Schmegettes is a free game played by friends, with open source planned. It has no monetization or growth work.

**Outcomes:**
- `.claude/commands/marketing.md` and `.claude/commands/revenue.md` are deleted.
- The README's agent line lists only `/product`, `/engineering`, `/implement`, `/designer`.
- No file in the repo mentions `/marketing`, `/revenue`, a "Marketing Agent", or a "Revenue Agent" (verify with `grep -rniE "/marketing|/revenue|marketing agent|revenue agent"`). Ordinary uses of the words in product or system docs, if any appear later, are fine.
- The remaining four agents and the lifecycle are unchanged.

**Player flow:** None. Hosts, contestants, and spectators see no difference.

**Success Criteria:**
- After the change merges, a fresh Claude Code session in the repo lists no `marketing` or `revenue` skill.
- The grep above returns nothing.

**Out of scope:**
- Rewriting or merging the other agents.
- Pricing, branding, or growth work of any kind. If it is needed later, add an agent back from git history (`git show d1b47f5:.claude/commands/marketing.md`).
- User-level commands outside the repo (`~/.claude/`).
