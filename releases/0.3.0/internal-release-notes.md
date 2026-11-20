# 0.3.0 internal notes

## Before merging
- **CI:** GitHub Actions didn't start any jobs on #204–#207 (account billing, fixed 2026-11-19), so those PRs merged without CI. `ci.yml` was dispatched on `develop` afterwards and passed in every package (run 44646478381), after #213 fixed a formatting error #207 introduced in `shared/openapi.yaml`.
- **Staging rehearsal:** both migrations applied on staging (run 44641372454, Migrate succeeded). Staging api, game and web all report `985033c`, the last code change. Staging api and game had been crash-looping since before this batch: the `app_service` password in the staging `DATABASE_URL` no longer matched the database (`28P01`). Reset 2026-11-20; see Known issues.
- **Smoke test on staging, on an iPhone** with the silent switch on: sign in, host (Norman downloads on a fresh device, Start waits), join by code, pick (card holds about 1 s), buzz (buzz-in on the TV), judge, finish a game. Also: open and fold the player list; Join as host (no buzzer until Start); Quick picks on: "Opera" picks the lowest clue left, and "Opera… for 600" with a pause (see Known issues); Quick picks off: "Didn't catch the amount."
- 0.1.0 and 0.2.0 are live but were never signed off (both `metadata.md` say `released: false`). Sign them off, or record why not, before signing off 0.3.0.

## Migrations
Two, applied in order:
- `20261119232726_lobby_fixed_timers`: every room's `timers` set to `standard`; `set_room_options` (same signature) always writes `standard`. `games.timers` untouched, so games already started keep their pace.
- `20261119234826_quick_picks`: `quick_picks` on `rooms` and `games` (default false). `set_room_options` dropped and recreated with a 7th parameter `new_quick boolean default null`, so the 6-argument call from the api already running keeps working until the new api is deployed. `start_game` copies `quick_picks`.

The only non-additive step is the function drop/recreate, which is covered by the default parameter.

## Config changes
None. No new environment variables or secrets. (The domain move to `schmegettes.app` was done by hand outside this release.)

## Contracts
All additive: `Room.quickPicks` (always sent), `PATCH /v1/rooms/{roomId}` body `quickPicks`, `room_snapshot.quickPicks`. `Room.timers` and the PATCH body's `timers` stay; new games are always `standard`.

## Behavior changes to know about
- **Pick reveal is 2.25 s** (was 1.5 s), on the server (`play.PickReveal`) and the web. The fallback reading deadline and the early-buzz window move with it.
- **Norman is the default voice.** Host devices with no explicit pick download about 63 MB once; Start waits for it.
- **Quick picks is applied on the phone** (`pickByVoice.ts`); the server only carries the flag.

## Known issues
- Quick picks: a pause before the amount ("Opera… for 600") may end recognition at "Opera" and pick the lowest clue. Not yet checked on devices.
- The buzz-in sound may reach the winner's microphone; not yet checked with the TV loud.
- `scripts/release-scope.cjs` finds nothing without Jira keys; this release's scope was listed by hand.
- **Staging's `app_service` password drifted** from the Fly `DATABASE_URL` (cause unknown; reset by hand 2026-11-20). The deployed-commit check passed earlier runs without verifying because `develop` had moved on; it only verifies the newest run.
- The Vercel Git-integration preview check fails on every PR since #189. It isn't the deploy path (`deploy.yml` deploys web) and doesn't gate anything.
