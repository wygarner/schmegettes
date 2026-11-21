# 0.2.0 internal notes

## Before merging
- **Staging rehearsal:** `deploy-staging.yml` for `bfc0257` must pass migrate, api, game, web and the deployed-commit check. Earlier staging runs for this batch were cancelled as newer merges landed; only the last one counts.
- **Smoke test on staging, on an iPhone**, with the silent switch **on**: sign in, host (voice downloads, Start waits), join by code (microphone gate first), pick (reveal), buzz, judge (chime, response, board back about 1 s later), a Daily Double, finish a game. Also: game options (Fast timers, Double off), close a phone's tab and Rejoin from Home, resume an abandoned game.
- 0.1.0 is live but was never signed off (`releases/0.1.0/metadata.md` still says `released: false`). Sign it off, or record here why not, before signing off 0.2.0.

## Migrations
Three, all additive, applied in order:
- `20261118210000_five_categories`: `build_board_round` builds 5 categories (same signature and grants). Games already running keep 6 columns.
- `20261118220000_game_options`: `timer_pace` enum; `timers` and `double_round` on `rooms` and `games` (defaults = the old behavior); `set_room_options` (security definer, granted to `authenticated`); `start_game` copies the options and skips the Double board when off.
- `20261118230000_rejoin_games`: `rooms.resume_game_id` (+ unique index); `my_current_room`, `resume_game`, `start_resumed_game` (security definer; the last one is `game_engine` only); `join_room` redefined (same signature).

Compatible with the code already running: new columns have defaults, functions keep their signatures.

## Config changes
None. No new environment variables or secrets.

## Contracts
All additive: `PATCH /v1/rooms/{roomId}` (now implemented), `GET /v1/me/current-room`, `POST /v1/games/{gameId}/resume`, `GameDetail.resumableUntil`, `Room.timers` / `Room.doubleRound`, new problem types (`not-the-host`, `invalid-settings`, `not-resumable`, `not-in-game`); on the socket, `phase_changed.revealUntil`, `room_snapshot.buzzWindowMs` / `answerWindowMs`, and `resume` on `lobby_updated` / `room_snapshot`.

## Behavior changes to know about
- **One socket per contestant.** A second connection for the same contestant closes the first with WebSocket close code **4001** (`other_device`); the old page stops reconnecting. The host's TV view is exempt.
- **Hosting needs a device that can run the Schmegettes voices**, and Web Audio. Devices that fail the speed check can't press Start. The built-in voices are gone entirely.
- **Every contestant needs the microphone** (and speech recognition on iPhone) before joining.

## Known issues
- A playing host whose microphone permission is turned off mid-game isn't blocked (the host device can't drop its socket); their answers come back as nothing heard.
- Sound-effect levels and timbre were tuned in code, not by ear; use devtools → system/sounds to adjust.
- Resume: a game's length after resuming isn't split into played time; the Final reset on resume is covered by code review, not by a pgTAP test.
- `scripts/release-scope.cjs` finds nothing without Jira keys; this release's scope was listed by hand from `git log --first-parent`.
- Open Dependabot PRs (#124–#133, #157) are not in this release; `@mantine/hooks` is still 9.7.5 (#133).
