# Sound Effects

## Why

The narrator gives the game a voice, but the big moments are silent: a Daily Double appears without a sound, "Double Schmegettes!" sits on screen in silence, and the correct response arrives with no cue telling the room whether someone got it. Short sounds mark those moments so the room reacts together, even when nobody is looking at the TV.

Players also expect the buzzer to make a sound when pressed. Today it doesn't. What QA heard on iPhones was the phone's own dictation chime, which plays when the microphone starts and is muted while the narrator talks, so it seemed to work only some of the time. A buzzer sound of our own makes every press sound the same.

## Jobs to be done

| Who | Job |
|---|---|
| Everyone in the room | "I hear right away when something big happens: a Daily Double, the Double round, whether the clue was got." |
| Contestant | "When I press my buzzer, I hear it, every time." |
| Everyone in the room | "When someone buzzes in, the room hears it, so we all look up at who's answering." |
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
| **Buzz-in** (a player wins the buzz) | TV | A bright electronic buzz, clearly different from the thunk | under 0.4 s |

- **The buzzer sound plays on every press that does something**: a buzz in `dim` (early) or `lit`, and the press that starts a spoken pick. A press that does nothing (`idle`, `locked`, `answering`) plays nothing, so the sound never suggests a press counted when it didn't. It plays the moment the finger lands, before the server answers; it isn't a "you won the buzz" sound.
- **The buzz-in plays on the TV once per winning buzz**: the moment the host device learns the clue moved to `answering`, for whoever won, the host included. After a wrong answer buzzing reopens silently, and the next winning buzz plays it again. Early buzzes, losing buzzes and spoken picks play nothing on the TV. Daily Doubles and Final have no buzzing, so no buzz-in. It never delays the answer: the winner's microphone and answer time start as they do today.
- **Sounds never overlap the narrator.** Each TV sound ends before the narrator's next line starts. The narrator's line waits for the sound, and the sound counts against the existing timings: the correct-response screen still returns to the board 1 s after the line ends, at most 6 s after the clue ended ([gameplay](../gameplay/feature-brief.md#answering-and-judging)); the Daily Double reveal is still 2 s ([wagers](../wagers/feature-brief.md#daily-doubles)); the interstitial is still 3 s.
- **Sounds never hold up the game.** A sound that fails to load or play is skipped, without a message. No timer waits for one.
- **Nothing plays for a wrong answer mid-clue** (buzzing reopens), when buzzing opens, or for the pick reveal. These happen often and would get tiresome. The pick reveal is silent.
- **Level:** sounds are mixed a little below the narrator so the narrator stays the loudest thing. One volume, set by the device; there is no in-game volume or mute setting.
- **Original sounds only.** Every sound is made for Schmegettes (generated in the browser from tones and noise), and none imitates a TV quiz show's sound cues. A sound swapped later for a recording must be public domain (CC0) and listed with the third-party notices.
- **The silent switch doesn't mute them.** Like the narrator ([gameplay](../gameplay/feature-brief.md#the-narrators-voice)), game sounds play at media volume with an iPhone's ring/silent switch on, on the TV and on phones.
- **Sound unlocking** works as for the narrator: the host's first tap turns on sound on the TV ("Tap to turn on sound" when it's blocked), and a phone's first buzzer press is the tap that unlocks its own sound. **Sound is required on the host device** (**Not yet implemented**: `host-sound-recovery`): when the host device comes back from another app, or the phone interrupts its audio (a call, Siri, an alarm), sound is turned back on at once. If the browser won't allow that without a tap, the game pauses until the host taps **Tap to turn on sound** ([gameplay](../gameplay/feature-brief.md#fairness-and-disconnects)). Phones don't pause the game: a phone that lost sound gets it back at its next buzzer press.
- Sounds are generated in the browser, so there's nothing to download: they're ready at the first game, unlike the narrator's voice.

### What isn't changed

- The phone's own dictation chime when the microphone starts listening (iPhone) is the phone's, not the game's. The game can't turn it off.

## Out of scope

- Music, a "think" tune for Final, and a theme
- A TV sound for every press (only the winning buzz has one), or a "you won the buzz" sound on the winner's phone
- Volume or mute settings in the game
- Haptics (vibration) on the buzzer
