# Sound Effects

## Why

The narrator gives the game a voice, but the big moments are silent: a Daily Double appears without a sound, "Double Schmegettes!" sits on screen in silence, and the correct response arrives with no cue telling the room whether someone got it. Short sounds mark those moments so the room reacts together, even when nobody is looking at the TV.

Players also expect the buzzer to make a sound when pressed. Today it doesn't. What QA heard on iPhones was the phone's own dictation chime, which plays when the microphone starts and is muted while the narrator talks, so it seemed to work only some of the time. A buzzer sound of our own makes every press sound the same.

## Jobs to be done

| Who | Job |
|---|---|
| Everyone in the room | "I hear right away when something big happens: a Daily Double, the Double round, whether the clue was got." |
| Contestant | "When I press my buzzer, I hear it, every time." |
| Host (TV) | "The sounds play by themselves, never talk over the narrator, and never slow the game down." |

## Rules

### The sounds

| Moment | Where | Sound | Length |
|---|---|---|---|
| **Correct response, someone got it** | TV | A bright two-note chime, before the narrator says "Correct, …" | under 0.8 s |
| **Correct response, nobody got it** (all wrong, no buzz, a missed Daily Double) | TV | A low, soft "time's up" tone, before "Sorry, we were looking for …" | under 0.8 s |
| **Daily Double** | TV | A rising flourish as "DAILY DOUBLE" appears, before "It's a Daily Double." | under 1.5 s |
| **"Double Schmegettes!"** | TV | A short fanfare during the 3 s interstitial | under 2.5 s |
| **Buzzer press** | The pressing device only (phone, or the host device when the host plays) | A short, solid "thunk" | under 0.2 s |

- **The buzzer sound plays on every press that does something**: a buzz in `dim` (early) or `lit`, and the press that starts a spoken pick. A press that does nothing (`idle`, `locked`, `answering`) plays nothing, so the sound never suggests a press counted when it didn't. It plays the moment the finger lands, before the server answers; it isn't a "you won the buzz" sound.
- **Sounds never overlap the narrator.** Each TV sound ends before the narrator's next line starts. The narrator's line waits for the sound, and the sound counts against the existing timings: the correct-response screen still returns to the board 1 s after the line ends, at most 6 s after the clue ended ([gameplay](../gameplay/feature-brief.md#answering-and-judging)); the Daily Double reveal is still 2 s ([wagers](../wagers/feature-brief.md#daily-doubles)); the interstitial is still 3 s.
- **Sounds never hold up the game.** A sound that fails to load or play is skipped, without a message. No timer waits for one.
- **Nothing plays for a wrong answer mid-clue** (buzzing reopens), when buzzing opens, or for the pick reveal. These happen often and would get tiresome. The pick reveal is silent.
- **Level:** sounds are mixed a little below the narrator so the narrator stays the loudest thing. One volume, set by the device; there is no in-game volume or mute setting.
- **Original sounds only.** Every sound is made for Schmegettes or comes from a public-domain (CC0) library, and none imitates a TV quiz show's sound cues. Their licenses are listed with the other third-party notices.
- **Sound unlocking** works as for the narrator: the host's first tap turns on sound on the TV ("Tap to turn on sound" when it's blocked), and a phone's first buzzer press is the tap that unlocks its own sound.
- Sounds are small (all together well under 1 MB) and load with the app, so they're ready at the first game, unlike the narrator's voice.

### What isn't changed

- The phone's own dictation chime when the microphone starts listening (iPhone) is the phone's, not the game's. The game can't turn it off.

## Out of scope

- Music, a "think" tune for Final, and a theme
- A sound for each player's buzz on the TV, or a "you won the buzz" sound
- Volume or mute settings in the game
- Haptics (vibration) on the buzzer
