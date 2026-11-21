# 0.2.0 tickets

Jira is not configured for this repo, so each line is the implementation PR. Product docs: #162 (feature docs), #163–#167 (product briefs); task specs: #168–#176.

## New Feature

- #184 sound-effects: stings before the correct response, Daily Double, Double Schmegettes, buzzer press
- #185 rejoin-games: rejoin a game in progress from Home; resume an unfinished game

## Enhancement

- #178 schmegettes-voices-only: the narrator uses only the Schmegettes voices; Start waits for the voice
- #179 five-categories: five categories per board, with wider columns
- #180 clue-pacing: pick reveal animation instead of the spoken announcement; the board returns 1 s after the correct response
- #181 microphone-gate: the microphone comes first, and nobody plays without it
- #182 ios-home-screen-tip: Home Screen tip for full screen on iPhone and iPad Safari
- #183 lobby-game-options: seasons, timers, Double Schmegettes on/off

## Bug Fix

- #177 schmegettes-voices-prod: the narrator plays through the iPhone's silent switch

## Technical Improvement (no ticket)

- #159 no-daily-branches: task PRs target `develop` directly
- #160 skip-docs-only-deploys: no staging deploy for docs-only merges
- #161 dev-starts-supabase: `bun run dev` starts local Supabase if it isn't running
