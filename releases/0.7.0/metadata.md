---
version: 0.7.0
released: true
release-date: 2026-11-26
---

# 0.7.0

Hosts and players hear from us in the app: incident, maintenance and What's new notices on Home and in the host lobby, plus a status page and a clear message when Schmegettes can't be reached. Under the hood: Schmegettes now reports its own failures to Grafana and emails an alert before players notice; a crashed room no longer affects other rooms; one deploy command for Actions and operators; Go 1.27.

- Cut from `develop` at `9291393` (#318) on 2026-11-25, with `origin/production` merged in.
- Version: a new feature with additive migrations and contracts, so the minor version.
