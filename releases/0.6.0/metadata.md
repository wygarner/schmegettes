---
version: 0.6.0
released: false
release-date:
---

# 0.6.0

The host lobby gets a QR code and lets the host fix anyone's name; every screen gets a way Home; admins can read and rotate the host code from their phone. Under the hood: an audit log, time-limited staff access and rate limits on every route, unused guests expire after 90 days, and dedicated QA accounts.

- Cut from `develop` at `9864a12` (#282) on 2026-11-21, with `origin/production` merged in.
- Version: backwards-compatible additions (enhancements, additive migrations, additive contracts), so the minor version.
- Cut while GitHub Actions jobs do not start (billing). No CI, staging rehearsal, end-to-end run or agent QA ran on this release, on Wyatt's instruction; see `internal-release-notes.md`.
