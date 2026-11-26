# Contributing

Thanks for your interest. Schmegettes is maintained by one person, so please open an issue to discuss a change before writing a large pull request.

- **Branches.** Branch from `develop` and open your pull request into `develop`. `production` only receives releases.
- **CI.** A pull request from a fork needs a maintainer's approval before its workflows run. Fork pull requests run CI without any secrets, so jobs that need them (agent evals) are skipped.
- **Tests.** Run the tests for what you changed before opening the pull request, for example `mise run test:web -- src/lib/room.test.ts` or `mise run test:game -- ./internal/room/...`. Don't open a pull request with failing tests. Setup is in [developer-setup.md](docs/system-docs/engineering/developer-setup.md).
- **Contracts.** Changes in `shared/` need `mise run gen` and the generated code committed with them.
- **Task issues.** Issues keyed `GH-{N}` are created and moved by automation. Please don't edit their labels or state by hand.
- **Secrets.** Never commit credentials, tokens, or `.env` files. CI scans every pull request for secrets.
- **Security problems** are reported privately; see [SECURITY.md](SECURITY.md).

By contributing, you agree that your contribution is licensed under the [GNU General Public License v3.0](LICENSE).
