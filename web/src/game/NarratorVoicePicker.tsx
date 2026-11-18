import { Button, Group, Stack, Text, UnstyledButton } from "@mantine/core";
import { useCallback, useEffect, useState } from "react";
import { narrate } from "../lib/narrator";
import {
  chooseVoice,
  getSavedVoice,
  hasNaturalVoice,
  narratorChoice,
  piperChoiceValue,
  rankVoices,
  saveVoice,
  tipPlatform,
  useNarratorVoices,
  voiceLabel,
} from "../lib/narratorVoice";
import { prepareVoice } from "../lib/piper/engine";
import {
  DEFAULT_PIPER_VOICE,
  PIPER_VOICES,
  type PiperVoice,
  type PiperVoiceId,
  useVoiceStatus,
  type VoiceStatus,
} from "../lib/piper/voices";
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

function statusText(status: VoiceStatus): string {
  switch (status.state) {
    case "downloading":
      return `Downloading… ${Math.floor(status.fraction * 100)}%`;
    case "preparing":
      return "Getting ready…";
    case "failed":
      return "Couldn't download";
    case "unavailable":
      return "Not available on this device";
    default:
      return "";
  }
}

const blocked = (status: VoiceStatus) => status.state === "failed" || status.state === "unavailable";

/**
 * The lobby's "🔊 Kristin" button and its picker: the Schmegettes voices first, then the
 * device's English voices, best first. Tapping a voice saves it on this device and says the
 * sample line on the TV (a Schmegettes voice once it has downloaded). Rules:
 * docs/product-docs/features/lobby/interaction-design.md.
 */
export function NarratorVoicePicker() {
  const { voices, supported } = useNarratorVoices();
  const [, setSaved] = useState(getSavedVoice); // re-render after a pick
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const choice = narratorChoice();
  const piperId: PiperVoiceId = choice.kind === "piper" ? choice.id : DEFAULT_PIPER_VOICE;
  const piperStatus = useVoiceStatus(piperId);

  // The chosen Schmegettes voice downloads in the background as soon as the lobby opens.
  const toPrepare = choice.kind === "piper" ? choice.id : null;
  useEffect(() => {
    if (toPrepare) void prepareVoice(toPrepare);
  }, [toPrepare]);

  if (!supported && typeof AudioContext === "undefined") return null;

  const device = choice.kind === "device" ? chooseVoice(voices, choice.uri) : null;
  let label: string;
  if (choice.kind === "piper" && !blocked(piperStatus)) {
    const name = PIPER_VOICES.find((v) => v.id === choice.id)?.name ?? "";
    label = piperStatus.state === "downloading" ? `${name} · ${Math.floor(piperStatus.fraction * 100)}%` : name;
  } else {
    const best = device ?? chooseVoice(voices, null);
    label = best ? voiceLabel(best) : "Default voice";
  }
  const ranked = rankVoices(voices);
  const platform = tipPlatform();
  const tip =
    voices.length > 0 && blocked(piperStatus) && !hasNaturalVoice(voices) && platform ? VOICE_TIPS[platform] : null;

  function pickPiper(id: PiperVoiceId) {
    const value = piperChoiceValue(id);
    saveVoice(value);
    setSaved(value);
    void prepareVoice(id).then((ready) => {
      // Skip the sample if the host picked something else meanwhile.
      if (ready && getSavedVoice() === value) void narrate(VOICE_SAMPLE);
    });
  }

  function pickDevice(voice: SpeechSynthesisVoice) {
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
          <GroupLabel>Schmegettes voices</GroupLabel>
          {PIPER_VOICES.map((v) => (
            <PiperRow
              key={v.id}
              voice={v}
              selected={choice.kind === "piper" && choice.id === v.id}
              onPick={() => pickPiper(v.id)}
            />
          ))}
          <GroupLabel>Voices on this device</GroupLabel>
          {voices.length === 0 ? (
            <Text c={SOFT}>Loading voices…</Text>
          ) : ranked.length === 0 ? (
            <Text c={SOFT}>No English voices on this device.</Text>
          ) : (
            ranked.map((voice) => (
              <Row
                key={voice.voiceURI}
                label={voiceLabel(voice)}
                selected={voice.voiceURI === device?.voiceURI}
                onPick={() => pickDevice(voice)}
              />
            ))
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

function GroupLabel({ children }: { children: string }) {
  return (
    <Text size="xs" fw={700} c={SOFT} tt="uppercase" mt={6}>
      {children}
    </Text>
  );
}

function PiperRow({ voice, selected, onPick }: { voice: PiperVoice; selected: boolean; onPick: () => void }) {
  const status = useVoiceStatus(voice.id);
  const text = statusText(status);
  return (
    <Group gap={6} wrap="nowrap">
      <Row label={voice.name} selected={selected} onPick={onPick} disabled={status.state === "unavailable"} />
      {text && (
        <Text size="xs" c={SOFT} style={{ whiteSpace: "nowrap" }}>
          {text}
        </Text>
      )}
      {status.state === "failed" && (
        <Button size="compact-xs" variant="light" onClick={onPick}>
          Try again
        </Button>
      )}
    </Group>
  );
}

function Row({
  label,
  selected,
  onPick,
  disabled = false,
}: {
  label: string;
  selected: boolean;
  onPick: () => void;
  disabled?: boolean;
}) {
  return (
    <UnstyledButton
      aria-pressed={selected}
      disabled={disabled}
      onClick={onPick}
      style={{
        flex: 1,
        display: "flex",
        gap: 8,
        padding: "6px 8px",
        borderRadius: 8,
        color: "#fff",
        opacity: disabled ? 0.45 : 1,
        background: selected ? "rgba(255,255,255,.1)" : "transparent",
      }}
    >
      <span aria-hidden style={{ width: 14 }}>
        {selected ? "✓" : ""}
      </span>
      <span>{label}</span>
    </UnstyledButton>
  );
}
