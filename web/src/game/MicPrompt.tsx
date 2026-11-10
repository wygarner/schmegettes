import { Button, Stack, Text } from "@mantine/core";
import type { ReactNode } from "react";
import { useState } from "react";
import { type MicState, recognitionSupported, requestMicrophone } from "../lib/speech";
import { Meter } from "../ui/Meter";

function Card({ tone, children }: { tone: "info" | "ok" | "bad"; children: ReactNode }) {
  const colors = {
    info: ["rgba(255,255,255,.05)", "rgba(255,255,255,.1)"],
    ok: ["rgba(56,217,169,.10)", "rgba(56,217,169,.35)"],
    bad: ["rgba(240,62,62,.12)", "rgba(240,62,62,.45)"],
  }[tone];
  return (
    <div
      style={{
        width: "100%",
        padding: 14,
        borderRadius: 14,
        background: colors[0],
        border: `1px solid ${colors[1]}`,
        textAlign: "left",
      }}
    >
      {children}
    </div>
  );
}

/**
 * Asks for the microphone in the lobby, so answering mid-game doesn't stall on a prompt.
 * `compact` (the host lobby's stage) shows only the button or a one-line warning.
 */
export function MicPrompt({ compact = false }: { compact?: boolean }) {
  const [mic, setMic] = useState<MicState>("unknown");
  if (compact) {
    if (!recognitionSupported())
      return (
        <Text size="xs" c="red.3">
          This browser can't hear answers. Try Chrome or Safari.
        </Text>
      );
    if (mic === "granted") return null;
    if (mic === "denied" || mic === "unsupported")
      return (
        <Text size="xs" c="red.3">
          Turn on the microphone to answer.
        </Text>
      );
    return (
      <Button size="xs" variant="light" onClick={async () => setMic(await requestMicrophone())}>
        Allow the microphone so you can answer
      </Button>
    );
  }
  if (!recognitionSupported()) {
    return (
      <Card tone="bad">
        <Text fw={700} size="sm" c="red.3">
          This browser can't hear answers
        </Text>
        <Text size="xs" c="mauve.1">
          Try Chrome or Safari.
        </Text>
      </Card>
    );
  }
  if (mic === "granted") {
    return (
      <Card tone="ok">
        <Stack gap={2}>
          <Text fw={700} size="sm">
            <Meter color="var(--mantine-color-teal-5)" height={14} /> Microphone ready
          </Text>
        </Stack>
      </Card>
    );
  }
  if (mic === "denied" || mic === "unsupported") {
    return (
      <Card tone="bad">
        <Text fw={700} size="sm" c="red.3">
          Turn on the microphone to answer
        </Text>
        <Text size="xs" c="mauve.1">
          Allow it for this site in your browser settings, then reload. Without it, a buzz counts as no answer.
        </Text>
      </Card>
    );
  }
  return (
    <Card tone="info">
      <Stack gap="xs">
        <Text fw={700} size="sm">
          🎤 Allow the microphone so you can answer
        </Text>
        <Text size="xs" c="mauve.1">
          You'll say your answers out loud. Asking now means no pop-up mid-game.
        </Text>
        <Button variant="light" onClick={async () => setMic(await requestMicrophone())}>
          Allow microphone
        </Button>
      </Stack>
    </Card>
  );
}
