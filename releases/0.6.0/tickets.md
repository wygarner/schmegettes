# 0.6.0 tickets

Each line is the implementation PR. The four tasks from the 2026-11-21 QA notes have no GH issue: Actions couldn't create one (billing), so they're named by their task folder. Their product briefs, feature docs and specs are #267–#278.

## Enhancement

- GH-248 data-retention (#265): guests unused for 90 days are deleted daily (pg_cron), and docs on what we keep and for how long
- lobby-qa-polish (#282): QR code above the room code, join URL in the top line, the host renames any player from the player menu, no options line in the lobby, no difficulty descriptions, "Default spoken clue value: Ask | Lowest left" (was Quick picks)
- home-from-every-screen (#280): a Home button on every screen; mid-game it asks first and keeps the seat for Rejoin
- in-app-host-code (#281): an Admin screen in the web app for admins: the host code (masked until Show), Copy, Rotate now
- my-games-drop-watched-filter (#279): My games drops the All / Played / Watched filter

## Improvement

- GH-245 security-audit-and-staff-access (#264): append-only audit log, time-limited staff access, a per-user rate limit on every api route
- GH-254 agent-qa (#266): dedicated QA accounts (left off the leaderboard), audited provisioning, all-QA cleanup, the agent QA process

## Not a task

- App icon and favicon (`a7967d4`, pushed straight to `develop`)
- `/implement` command and agent settings (`26c1278`, pushed straight to `develop`; `.claude/` only)
