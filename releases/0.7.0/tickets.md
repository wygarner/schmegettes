# 0.7.0 tickets

Each line is the implementation PR.

## New Feature

- GH-252 service-notices (#291): incident, maintenance and What's new notices on Home and in the host lobby, posted from the devtools Admin page and synced to an Instatus status page; a "can't reach Schmegettes" banner

## Improvement

- GH-241 observability (#318): logs, traces and metrics to Grafana Cloud; Faro in the web app; alert rules, uptime checks and the "tonight" dashboard as Terraform; room-crash containment and a stuck-phase watchdog in the game server; deploy annotations
- GH-300 one deploy command (#301): `scripts/deploy.mjs`, shared by the deploy workflows and operators
- GH-312 Go 1.27 (#313): Go 1.27.4, oapi-codegen v2.9.0, staticcheck v0.8.2, dependency updates
- GH-316 remove the marketing and revenue agents (#317): `.claude/commands` only, plus the trademark rule in `product-overview.md`

## Not in this release

- GH-250 backups-and-restore: spec only; the task was dropped on 2026-11-24
