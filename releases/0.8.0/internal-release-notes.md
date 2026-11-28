# 0.8.0 internal notes

## Before merging
- **CI:** green on every PR in this release; all 15 commits since 0.7.0 came through PRs.
- **Staging rehearsal:** Deploy Staging has run on `develop` after every implementation merge, most recently at `f5c859f` (#343, 2026-11-28, passed), so both migrations below are applied on staging.
- **End-to-end on staging:** pending (dispatched 2026-11-28).
- **Agent QA on staging:** not run. As for 0.7.0, the session preparing the release has no QA account credentials (GH-322 covers this). Not checked by an agent: every change in this release.
- **Production values to set first:** none. No new secrets or variables.
- **The 0.7.0 sign-off deploy run** (run 46150454548) is still waiting for approval on the `production` environment. It redeploys 0.7.0's code. Cancel it before this release merges, or it will hold the deploy queue.

## Migrations
Two, additive:
1. `20261128150000_voided_verdict` (#342): `alter type public.verdict add value 'voided'`. Stats count only the four right/wrong verdicts, so voided answers are neither.
2. `20261128160000_match_rule_same_words` (#343): `alter type public.match_rule add value 'same_words'`.

Both are compatible with the code already running: added enum values the old server never writes.

## Contracts
Additive:
- Client messages `host_sound` (#331) and `answer_status` (#343).
- Server: `game_paused.reason` and `room_snapshot.pauseReason` (#331); `verdict_overridden.voided` and error `answer_voided` (#342); `answerStage` on `phase_changed` and `room_snapshot` (#343).
- Domain: `Verdict` gains `voided`, and `MatchRule` gains `same_words`.

Web and game deploy together. The pace option no longer changes answer time, and `answerWindowMs` is now 6000.

## Not verified before release
- **Lenient judging against past overrides:** `game/cmd/judgereplay` was not run against production overrides. Wyatt chose to ship without it (2026-11-28). Watch for answers judged `same_words` that hosts override to incorrect.
- **Real devices:** iPhone host app-switch sound recovery (#331); Android keyboard on the Fold 8 (#340); a phone microphone with a pause mid-answer (#343).

## After deploy
- **Production health** (release-strategy.md step 6): uptime checks green, and no new server errors, client errors, room crashes or stuck phases since the deploy annotation. Watch the Faro events `host_sound_off`/`host_sound_on` (new) and `narrator_line_skipped` with `no_audio_context` (should drop).
- **Production health confirmed by Wyatt:** pending (the sign-off merges only after it).
- **Post What's new** from the production Admin page, using `user-release-notes.md`.
