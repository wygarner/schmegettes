import { Button, Group, Stack, Text, UnstyledButton } from "@mantine/core";
import { useCallback, useState } from "react";
import {
  chooseVoice,
  getSavedVoice,
  hasNaturalVoice,
  rankVoices,
  saveVoice,
  tipPlatform,
  useNarratorVoices,
  voiceLabel,
} from "../lib/narratorVoice";
import { announcement, speak } from "../lib/speech";
import { Sheet } from "../ui/Sheet";
import { SOFT } from "../ui/tokens";

/** What a voice says when the host taps it. */
export const VOICE_SAMPLE = announcement("Volcanoes", 400);

/** Where to download a better voice. The path is a constant so it's a one-line fix per OS release. */
export const VOICE_TIPS = {
  ios: "Want a more natural voice? Download a Premium voice in Settings → Accessibility → Spoken Content → Voices → English, then reload this page.",
  mac: "Want a more natural voice? Download a Premium voice in System Settings → Accessibility → Spoken Content → System voice → Manage Voices, then reload this page.",
} as const;

/**
 * The lobby's "🔊 Ava" button and its picker: the device's English voices, best first.
 * Tapping one saves it on this device and says the sample line on the TV. Hidden when the
 * device can't speak. Rules: docs/product-docs/features/lobby/interaction-design.md.
 */
export function NarratorVoicePicker() {
  const { voices, supported } = useNarratorVoices();
  const [saved, setSaved] = useState(getSavedVoice);
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  if (!supported) return null;

  const current = chooseVoice(voices, saved);
  const label = current ? voiceLabel(current) : "Default voice";
  const ranked = rankVoices(voices);
  const platform = tipPlatform();
  const tip = voices.length > 0 && !hasNaturalVoice(voices) && platform ? VOICE_TIPS[platform] : null;

  function pick(voice: SpeechSynthesisVoice) {
    saveVoice(voice.voiceURI);
    setSaved(voice.voiceURI);
    void speak(VOICE_SAMPLE, voice); // the tap also unlocks speech on iOS
  }

  return (
    <>
      <Button
        variant="subtle"
        color="mauve.1"
        size="compact-sm"
        aria-label={`Narrator voice: ${label}`}
        onClick={() => setOpen(true)}
        style={{ minWidth: 0, maxWidth: "26cqw" }}
        styles={{ label: { minWidth: 0, overflow: "hidden" } }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>🔊 {label}</span>
      </Button>
      <Sheet opened={open} onClose={close} label="Narrator voice">
        <Text fw={700} mb="xs">
          Narrator voice
        </Text>
        <Stack gap={2} style={{ maxHeight: "calc(100dvh - 190px)", minHeight: 40, overflowY: "auto" }}>
          {voices.length === 0 ? (
            <Text c={SOFT}>Loading voices…</Text>
          ) : ranked.length === 0 ? (
            <Text c={SOFT}>No English voices on this device.</Text>
          ) : (
            ranked.map((voice) => {
              const selected = voice.voiceURI === current?.voiceURI;
              return (
                <UnstyledButton
                  key={voice.voiceURI}
                  aria-pressed={selected}
                  onClick={() => pick(voice)}
                  style={{
                    display: "flex",
                    gap: 8,
                    padding: "6px 8px",
                    borderRadius: 8,
                    color: "#fff",
                    background: selected ? "rgba(255,255,255,.1)" : "transparent",
                  }}
                >
                  <span aria-hidden style={{ width: 14 }}>
                    {selected ? "✓" : ""}
                  </span>
                  <span>{voiceLabel(voice)}</span>
                </UnstyledButton>
              );
            })
          )}
        </Stack>
        {tip && (
          <Text size="sm" c={SOFT} mt="sm">
            {tip}
          </Text>
        )}
        <Group justify="flex-end" mt="sm">
          <Button onClick={close}>Done</Button>
        </Group>
      </Sheet>
    </>
  );
}
