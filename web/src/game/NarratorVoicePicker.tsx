import { ActionIcon, Button, Group, RingProgress, Stack, Text, Tooltip, UnstyledButton } from "@mantine/core";
import { useCallback, useEffect, useState } from "react";
import { narrate } from "../lib/narrator";
import { getSavedVoice, narratorChoice, piperChoiceValue, saveVoice } from "../lib/narratorVoice";
import { prepareVoice } from "../lib/piper/engine";
import {
  PIPER_VOICES,
  type PiperVoice,
  type PiperVoiceId,
  useVoiceStatus,
  type VoiceStatus,
} from "../lib/piper/voices";
import { Sheet } from "../ui/Sheet";
import { SOFT } from "../ui/tokens";

/** What a voice says when the host taps it. */
export const VOICE_SAMPLE = "Here's a sample of my voice.";

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

/** Fired when the host picks a voice, so every reader of the choice updates. */
const PICKED = "schmegettes:narrator-voice";

export interface NarratorStatus {
  id: PiperVoiceId;
  name: string;
  status: VoiceStatus;
  /** Start may be pressed: the picked voice is on the device and loaded. */
  ready: boolean;
  /** This device can't run the Schmegettes voices, so it can't host. */
  unavailable: boolean;
}

/**
 * The picked voice and how far along it is. The lobby's Start waits for `ready`. Rules:
 * docs/product-docs/features/lobby/feature-brief.md, "The lobby".
 */
export function useNarratorStatus(): NarratorStatus {
  const [, setTick] = useState(0);
  const { id } = narratorChoice();
  const status = useVoiceStatus(id);
  // Re-read the choice when the picker saves a new one.
  useEffect(() => {
    const onPick = () => setTick((n) => n + 1);
    window.addEventListener(PICKED, onPick);
    return () => window.removeEventListener(PICKED, onPick);
  }, []);
  const name = PIPER_VOICES.find((v) => v.id === id)?.name ?? "";
  const noAudio = typeof AudioContext === "undefined";
  return {
    id,
    name,
    status,
    ready: status.state === "ready" && !noAudio,
    unavailable: status.state === "unavailable" || noAudio,
  };
}

/**
 * The lobby's 🔊 button and its picker: the three Schmegettes voices. Tapping one
 * saves it on this device, downloads it if needed, and says the sample line on the TV once
 * it's ready. Hidden on a device that can't run them. Rules:
 * docs/product-docs/features/lobby/interaction-design.md.
 */
export function NarratorVoicePicker() {
  const narrator = useNarratorStatus();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  // The picked voice downloads in the background as soon as the lobby opens.
  useEffect(() => {
    void prepareVoice(narrator.id);
  }, [narrator.id]);

  if (narrator.unavailable) return null;

  // An icon only (lobby interaction design): the voice's name is in the accessible name and
  // the tooltip, and a download shows as a ring filling around the icon.
  const percent = narrator.status.state === "downloading" ? Math.floor(narrator.status.fraction * 100) : null;
  const label = `Narrator voice: ${narrator.name}${percent === null ? "" : ` · ${percent}%`}`;

  function pick(id: PiperVoiceId) {
    const value = piperChoiceValue(id);
    saveVoice(value);
    window.dispatchEvent(new Event(PICKED));
    void prepareVoice(id).then((ready) => {
      // Skip the sample if the host picked something else meanwhile.
      if (ready && getSavedVoice() === value) void narrate(VOICE_SAMPLE);
    });
  }

  return (
    <>
      <Tooltip label={label}>
        <ActionIcon
          variant="subtle"
          color="mauve.1"
          size={44}
          aria-label={label}
          onClick={() => setOpen(true)}
          style={{ fontSize: 20 }}
        >
          {percent === null ? (
            "🔊"
          ) : (
            <RingProgress
              size={44}
              thickness={3}
              roundCaps
              sections={[{ value: percent, color: "green.4" }]}
              label={<span style={{ display: "block", textAlign: "center", fontSize: 18 }}>🔊</span>}
              aria-hidden
            />
          )}
        </ActionIcon>
      </Tooltip>
      <Sheet opened={open} onClose={close} label="Narrator voice">
        <Text fw={700} mb="xs">
          Narrator voice
        </Text>
        <Stack gap={2}>
          {PIPER_VOICES.map((v) => (
            <VoiceRow key={v.id} voice={v} selected={narrator.id === v.id} onPick={() => pick(v.id)} />
          ))}
        </Stack>
        <Group justify="flex-end" mt="sm">
          <Button onClick={close}>Done</Button>
        </Group>
      </Sheet>
    </>
  );
}

function VoiceRow({ voice, selected, onPick }: { voice: PiperVoice; selected: boolean; onPick: () => void }) {
  const status = useVoiceStatus(voice.id);
  const text = statusText(status);
  return (
    <Group gap={6} wrap="nowrap">
      <UnstyledButton
        aria-pressed={selected}
        onClick={onPick}
        style={{
          flex: 1,
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
        <span>{voice.name}</span>
      </UnstyledButton>
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
