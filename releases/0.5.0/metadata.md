---
version: 0.5.0
released: true
release-date: 2026-11-21
---

# 0.5.0

Stats and leaderboard: signed-in players see their all-time stats and a leaderboard they can opt out of. Also a release test layer: an end-to-end suite, a CI boot check, coverage floors and exact runtime pins.

- Cut from `develop` at `1a198b0` (#257) on 2026-11-21, with `origin/production` merged in.
- Version: backwards-compatible additions (a new feature, an additive migration, additive contracts), so the minor version.
- Cut while GitHub Actions jobs do not start (billing). Merged without CI or a staging rehearsal and deployed by hand on Wyatt's instruction; see `internal-release-notes.md`.
