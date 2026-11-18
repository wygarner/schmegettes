# 0.1.0 tickets

Jira is not configured for this repo, so each line is the implementation PR.

## New Feature

- #5 game-history: fresh boards and durable game history (database)
- #20 lobby: host a game and run the lobby
- #24 gameplay: core loop
- #51 wagers: Daily Doubles and Final Schmegettes
- #63 design-pass-restyle: new look, red buzzer, self-hosted fonts, host inputs on the stage
- #64 design-pass-endgame: final scoreboard, Rematch, host overrides
- #65 design-pass-history: My games
- #97 clue-catalog: load the real clues from the dataset
- #99 private-access: one-use host codes gate hosting
- #108 accounts: email and password sign-in to keep history and hosting

## Enhancement

- #10 In-room play: host is the TV, voice-only answers
- #37 remove-trademark-references: rename round to Double Schmegettes, drop show references
- #38 gameplay-polish: always-on buzzer, controller-only picks, iPhone-landscape host screen, 6 players, 4-row board
- #84 host-voice-pick-transcript: show what a spoken pick hears on the host device
- #91 narrate-correct-response: read the correct response aloud
- #96 answer-and-buzz-timing: 9 s to buzz in, 9 s to answer
- #98 slate-green-palette (superseded by #100)
- #100 pink-green-mauve-palette: light mauve, Venice green, Corinthian pink
- #118 sound-alike-judging: accept answers that sound right, and record why
- #119 narrator-voice: narrator uses the best installed voice, host picks it in the lobby
- #147 piper-narrator: Schmegettes voices (Kristin, Norman, John) generated on the host device
- #151 host-code-rotation: one rotating host code and a devtools Admin page
- #152 menu-screens: sleeker Home, My games and Account

## Bug Fix

- #26 flaky host-absence test (daily CI)
- #27 flaky game record test (daily CI)
- #88 host-narration-ios: narration never played on iOS
- #146 One-player games and hidden browser toolbar

## Improvement

- #1 Root `bun run dev` script
- #6 Remove Rails; `api/` is Go
- #9, #12 Signing key setup in local and CI Supabase
- #52 bootstrap-guide-fixes: worker CI, pinned tools, golib in Dependabot
- #53 scaffold-services: remove finished task folder
- #56 bootstrap-guide-docs: security, config and secrets, testing, release comms
- #66 design-pass-cleanup: one ordinal helper, design-system status
- #68 daily-2026-11-09-db-plan: fix the game_history test plan
- #122 hosting-and-deploys: staging and production on Fly.io and Vercel
- #139 vercel-api-deploy: deploy web through Vercel's API, drop the Vercel CLI
- #144 migrate-signing-key: fix the staging migrate step
- #154 daily-2026-11-17: merge develop's dependency bumps
- #155 daily-2026-11-17: fix games stats schema formatting
- #156 daily-2026-11-17: accept the picomatch advisory in the audit
- Dependabot bumps merged into `develop` (bun, Go, uv)
