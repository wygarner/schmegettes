---
jira-type: enhancement
jira-title: "Buzz-in sound on the TV when a player wins the buzz"
---
**Task Type:** Enhancement. Adds one sound to the existing sound effects. It reverses the earlier out-of-scope line ("a sound for each player's buzz on the TV").

**Product docs:** `docs/product-docs/features/sound-effects/feature-brief.md` and `interaction-design.md`.

**Problem:** Prod QA (2026-11-19): when someone buzzes in, the room hears nothing. Each player hears only their own press (the thunk on their phone), so the room misses the moment and doesn't look up at who's answering.

**Outcomes:** Every winning buzz is heard by the whole room, from the TV, and it never slows the game.

**Player flow:**
- `buzzing_open` → a player's buzz wins → the clue moves to `answering`. As soon as the host device gets that, the TV plays the **buzz-in**: a bright, original electronic buzz, under 0.4 s, clearly different from the press thunk, mixed below the narrator.
- One buzz-in per winning buzz. After a wrong answer, buzzing reopens silently, and the next winner gets a buzz-in.
- The host who plays and wins: their thunk plays at the press, then the buzz-in on the host device when the server confirms.
- Nothing plays on the TV for early buzzes, losing buzzes, presses that do nothing, or spoken picks. Daily Doubles and Final have no buzzing, so no buzz-in.
- The answer time and the winner's microphone start exactly as today; no timer waits for the sound.
- Same rules as the other sounds: plays through the silent switch, needs the TV's sound unlocked (skipped silently until then), skipped silently if it fails, no replay after a reconnect or reload.

**Success Criteria:**
- In a game with 3 phones, each winning buzz plays exactly one buzz-in on the TV within ~100 ms of the TV showing who's answering; phones play only their own thunk.
- Wrong answer → reopen → second winner: a second buzz-in.
- No buzz-in on early buzzes, on a Daily Double or in Final.
- With the ring/silent switch on, the buzz-in is heard on an iPhone host.
- The winner's transcript and verdict are unaffected by the sound (QA with the TV loud, the winner near it).
- The answer time is unchanged (9 s from `answering`).

**Out of scope:** a sound per press on the TV; a "you won" sound on the winner's phone; per-player buzz sounds; volume or mute settings; haptics.
