// The game's sound effects, to tune by ear without playing a game. They're made in code
// (web/src/lib/sfx.ts), so this page plays the real thing. Rules:
// docs/product-docs/features/sound-effects/feature-brief.md.

import { Button, Group, Stack, Text, Title } from "@mantine/core";
import { unlockAudio } from "../../../../web/src/lib/piper/audio";
import {
  playBuzz,
  playCorrect,
  playDailyDouble,
  playDoubleRound,
  playTimesUp,
  stopEffects,
} from "../../../../web/src/lib/sfx";

const SOUNDS: Array<[string, string, () => Promise<void>]> = [
  ["Correct", "Before “Correct, …” (≤ 0.8 s)", playCorrect],
  ["Time's up", "Before “Sorry, we were looking for …” (≤ 0.8 s)", playTimesUp],
  ["Daily Double", "With the DAILY DOUBLE reveal (≤ 1.5 s)", playDailyDouble],
  ["Double Schmegettes", "During the 3 s interstitial (≤ 2.5 s)", playDoubleRound],
  ["Buzzer", "On the pressing device (≤ 0.2 s)", playBuzz],
];

export default function Sounds() {
  return (
    <Stack p="md" maw={520}>
      <Title order={3}>Sound effects</Title>
      <Text size="sm" c="dimmed">
        Tap one to hear it. The first tap also turns sound on (iOS).
      </Text>
      {SOUNDS.map(([name, when, play]) => (
        <Group key={name} justify="space-between" wrap="nowrap">
          <div>
            <Text fw={600}>{name}</Text>
            <Text size="xs" c="dimmed">
              {when}
            </Text>
          </div>
          <Button
            onClick={() => {
              unlockAudio();
              void play();
            }}
          >
            Play
          </Button>
        </Group>
      ))}
      <Button variant="subtle" onClick={stopEffects}>
        Stop
      </Button>
    </Stack>
  );
}
