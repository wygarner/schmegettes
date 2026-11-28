---
task-type: improvement
task-title: "Claude runs a production release end to end"
---
# Product brief: autonomous release

## Problem

Releasing 0.7.0 (2026-11-26) needed Wyatt to step in five times outside the chat with Claude. He had to approve the production deployment in GitHub, which can't be done from the GitHub mobile app. Agent QA couldn't run because the QA account passwords are only in his password manager. The health check couldn't run because Claude's Grafana connector reaches another stack. What's new has to be posted from the Admin page, which agents may not use. The release branches were outside what the session could push. One of the blockers was a missing production setting (the Instatus values) that the release couldn't fix.

## Goal

Wyatt says "do a release" and, after reviewing the scope, "go", both in chat. Claude does everything else: cut, notes, verification, merge, deploy, health check, production smoke, sign-off and What's new. Wyatt does a small number of one-time setup steps, and nothing per release.

## Decisions (Wyatt, 2026-11-26)

- **The chat go-ahead is the approval.** The `production` environment no longer requires a reviewer in GitHub. Branch protection and the `production`-only deployment branch rule stay.
- **No human health check before sign-off.** An automated Grafana check and an automated production smoke replace it. This is an accepted trade-off.
- **Staging agent QA at release time is replaced** by the automated end-to-end suite. Player-visible tasks keep the E2E suite covering what they change.
- **What's new posts itself** when the sign-off merges, from text written in the release docs.
- **Production config is the task's job, not the release's.** A task that needs a new production value has it set in staging and production before it merges.

## Out of scope

- The human checklist in agent-qa.md (real iPhone narrator, microphone, silent switch, AirPlay, Home Screen mode). Releases that touch these list them as unchecked in the go-ahead message, and Wyatt decides.
- Hotfixes follow the same steps but are not otherwise changed.
