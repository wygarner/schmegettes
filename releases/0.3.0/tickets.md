# 0.3.0 tickets

Jira is not configured for this repo, so each line is the implementation PR. Product docs and briefs: #189, #192–#199; task specs: #190, #200–#203. Fix to CI on develop: #213.

## Enhancement

- #204 lobby-tidy: player list folded by default, no host buzzer in the lobby, Join/Leave, icon-only voice and options buttons, no Start hint, Timers option removed (always 9 s / 9 s), Norman the default voice
- #205 pick-reveal-hold: the pick card holds 0.75 s longer (reveal 2.25 s)
- #206 buzz-in-sound: the TV plays a buzz when a player wins the buzz
- #207 quick-picks: a game option where saying just a category picks its lowest clue left

## Bug Fix

- #191 narrator-skips-clues: the narrator reads every clue on supported hosts

## Not in this release

- main-domain: only its task spec (#188) and product brief (#187) merged; the "Join at" text change isn't implemented. The domain itself was set up by hand.
- clue-difficulty: product docs and brief only (#208, #209).
