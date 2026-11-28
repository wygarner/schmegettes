# 0.8.0 tickets

Each line is the implementation PR.

## Enhancement

- GH-339 lenient-judging (#343): a `same_words` judging rule (the same words in any order or form), silent first letters, and answers in two stages from when the microphone is listening (6 s to begin, 6 s to finish), with listening that survives a pause
- GH-338 override-ends-clue (#342): an override to correct voids the later answers on the clue ($0, DOESN'T COUNT); flipping it back restores them
- GH-337 wager-pad-limit (#341): the wager pad refuses a digit past the limit

## Bug Fix

- GH-330 host-sound-recovery (#331): the host device resumes its sound after an app switch or interruption, or the game pauses until the host taps
- GH-327 rematch-scores (#328): scores show $0 as soon as a rematch starts
- GH-336 android-keyboard (#340): on Android the keyboard no longer covers the field being typed in

## Not in this release

- GH-322 autonomous-release: spec only
- fold-cover-screen: closed as not reproducible (#344)
