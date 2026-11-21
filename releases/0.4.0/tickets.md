# 0.4.0 tickets

Each line is the implementation PR. Task specs: #212, #228. Docs: #226, #227, #255.

## Enhancement

- #229 clue-difficulty: each category is rated Easy, Medium or Hard by Claude; a Difficulty game option (Any, Easy, Medium, Hard; Any by default) fills boards from that level first

## Improvement

- #231 github-issues-tracker: task tracking moves from Jira to GitHub Issues (workflows, scripts and agent commands only)
- #234 main-domain: the TV lobby shows "Join at {host}/join", read from the page's own address
- #256 difficulty-cut-ties: cut points put tied scores on the side that keeps each level nearest a third; a `recut` action on Rate Clues
- `0ebc1c0` (pushed to `develop` without a PR): removes the "Players" label from the lobby's player tab

## Bug Fix

- #247 rate-clues: a category that keeps failing no longer holds back the difficulty scale

## Not in this release

- tracker-smoke (#235, #237): a throwaway spec that tested the tracker; its folder was deleted.
- Task specs with no implementation yet: GH-239, GH-243, GH-245, GH-248, GH-250, GH-252, GH-254 (#238, #242, #244, #246, #249, #251, #253).
