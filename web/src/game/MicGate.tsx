// Nobody plays without a microphone: this screen comes first, and there's no way past it but
// allowing it. Rules: docs/product-docs/features/gameplay/interaction-design.md,
// "Microphone permission".

import { Button, Stack, Text, Title } from "@mantine/core";
import { useEffect, useState } from "react";
import { type MicState, micPermission, recognitionSupported, requestAnswerPermissions } from "../lib/speech";
import { GoldButton } from "../ui/GoldButton";
import { DISPLAY, SOFT } from "../ui/tokens";

type View = "checking" | "ask" | "asking" | "denied" | "unsupported";

/** iPhone, iPad (which says it's a Mac), or iPod: Safari's steps. */
function onIOS(): boolean {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

export const BLOCKED_STEPS = {
  ios: "In Safari, tap aA in the address bar → Website Settings → Microphone → Allow. Then tap Try again.",
  other: "Tap the icon left of the address → Permissions or Site settings → Microphone → Allow. Then tap Try again.",
} as const;

/**
 * The microphone screen. Calls onGranted once answering will work (at once if it already
 * does). "leave" ends the visit (phones: Leave); the host's variant says Cancel instead and
 * stays a non-playing host.
 */
export function MicGate({
  onGranted,
  onLeave,
  host = false,
}: {
  onGranted: () => void;
  onLeave: () => void;
  host?: boolean;
}) {
  const [view, setView] = useState<View>("checking");

  useEffect(() => {
    let live = true;
    if (!recognitionSupported()) {
      setView("unsupported");
      return;
    }
    void micPermission().then((state) => {
      if (!live) return;
      if (state === "granted") onGranted();
      else setView(state === "denied" ? "denied" : "ask");
    });
    return () => {
      live = false;
    };
  }, [onGranted]);

  async function allow() {
    setView("asking");
    const result: MicState = await requestAnswerPermissions();
    if (result === "granted") onGranted();
    else setView(result === "unsupported" ? "unsupported" : "denied");
  }

  const leave = (
    <Button variant="subtle" color="mauve.1" onClick={onLeave}>
      {host ? "Cancel" : "Leave"}
    </Button>
  );

  if (view === "checking") return null;

  if (view === "unsupported") {
    return (
      <Stack align="center" ta="center" gap="sm" role="alert">
        <Title order={2} ff={DISPLAY} fw={600}>
          This browser can't hear answers.
        </Title>
        <Text c={SOFT}>Open {window.location.host} in Safari or Chrome.</Text>
        {leave}
      </Stack>
    );
  }

  if (view === "denied") {
    return (
      <Stack align="center" ta="center" gap="sm" role="alert">
        <Text fz={40} aria-hidden>
          🎤
        </Text>
        <Title order={2} ff={DISPLAY} fw={600}>
          Your microphone is blocked.
        </Title>
        <Text c={SOFT}>{onIOS() ? BLOCKED_STEPS.ios : BLOCKED_STEPS.other}</Text>
        <GoldButton size="lg" onClick={allow}>
          Try again
        </GoldButton>
        {leave}
      </Stack>
    );
  }

  return (
    <Stack align="center" ta="center" gap="sm">
      <Text fz={40} aria-hidden>
        🎤
      </Text>
      <Title order={2} ff={DISPLAY} fw={600}>
        You answer out loud, so Schmegettes needs your microphone.
      </Title>
      <GoldButton size="lg" onClick={allow} loading={view === "asking"}>
        Allow microphone
      </GoldButton>
      {leave}
    </Stack>
  );
}
