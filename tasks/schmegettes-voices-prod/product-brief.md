---
jira-type: bug-fix
jira-title: "Schmegettes voices are silent when the iPhone's silent switch is on"
---
**Task Type:** Bug Fix. The Schmegettes voices work, but on an iPhone with the ring/silent switch on they make no sound, while the device's built-in voices still speak. Found in production QA (2026-11-18, iPhone 11, Safari) and confirmed by turning the switch off.

**Product docs:** `docs/product-docs/features/gameplay/feature-brief.md#the-narrators-voice` ("Plays through the silent switch"), `features/sound-effects/` (same rule for game sounds).

**Problem:** iOS Safari plays Web Audio as "ambient" sound by default, which the silent switch mutes. Built-in speech synthesis isn't muted, so with the switch on the room hears the device voice, or nothing once `schmegettes-voices-only` removes it. A host with their phone on silent (common) gets a silent game and no hint why.

**Outcomes:** The narrator is heard with the silent switch on, like a video or music app. The volume buttons still control it.

**Player flow:**
- The host device plays the narrator (and, once `sound-effects` ships, its sounds) at media volume whether the silent switch is on or off.
- Nothing to set and no message. The "Tap to turn on sound" unlock is unchanged.
- Phones that join make no sound today; `sound-effects` applies the same rule to their buzzer sound.
- Using the microphone (a host who plays and answers) must not mute the narrator or make it quieter afterwards.

**How (engineering's call):** Safari's `navigator.audioSession.type = "playback"` (iOS 16.4+) is the direct fix. For older iOS, playing the Web Audio output through an `<audio>` element (media playback ignores the switch) is a known workaround. Check how either interacts with the microphone (`play-and-record`) when the host answers.

**Success Criteria:**
- On an iPhone 11 and a recent iPhone (Safari, current iOS) with the silent switch **on**: the lobby sample and every line of a game are heard in the Schmegettes voice.
- The same after the host answers with the microphone, and after the phone is locked and unlocked mid-game.
- The volume buttons change the narrator's volume.
- Nothing changes on desktop or Android.

**Out of scope:** removing device voices (`schmegettes-voices-only`), sound effects themselves (`sound-effects`), any in-game volume setting.
