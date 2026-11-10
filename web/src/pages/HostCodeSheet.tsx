import { Button, Group, Modal, Stack, Text, TextInput } from "@mantine/core";
import { useEffect, useState } from "react";
import { formatHostCode, isCompleteHostCode, redeemHostCode } from "../lib/hostAccess";
import { GoldButton } from "../ui/GoldButton";
import { DISPLAY, SOFT } from "../ui/tokens";

const MESSAGES = {
  invalid: "That code didn't work.",
  "rate-limited": "Too many tries. Wait a minute and try again.",
  error: "Something went wrong. Try again.",
} as const;

/**
 * Asks a device without host access for its one-use host code
 * (docs/product-docs/features/private-access/interaction-design.md).
 */
export function HostCodeSheet({
  opened,
  onClose,
  onUnlocked,
  onSignIn,
}: {
  opened: boolean;
  onClose: () => void;
  onUnlocked: () => void;
  /** For a guest: sign in first, so host access follows them to any device. */
  onSignIn?: () => void;
}) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<keyof typeof MESSAGES | null>(null);
  const [waitSeconds, setWaitSeconds] = useState(0);

  useEffect(() => {
    if (opened) {
      setCode("");
      setProblem(null);
    }
  }, [opened]);

  // After too many tries, Continue stays off until the server's Retry-After has passed.
  useEffect(() => {
    if (waitSeconds <= 0) return;
    const timer = setTimeout(() => setWaitSeconds((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [waitSeconds]);

  async function submit(event: { preventDefault(): void }) {
    event.preventDefault();
    if (busy || waitSeconds > 0 || !isCompleteHostCode(code)) return;
    setBusy(true);
    const result = await redeemHostCode(code);
    setBusy(false);
    if (result.kind === "ok") {
      onUnlocked();
      return;
    }
    setProblem(result.kind);
    if (result.kind === "rate-limited") setWaitSeconds(result.retryAfterSeconds);
  }

  return (
    <Modal opened={opened} onClose={onClose} title="Schmegettes is invite-only" centered>
      <form onSubmit={submit}>
        <Stack>
          <TextInput
            label="Host code"
            description="Enter the host code you were given."
            placeholder="K7RX-M2PQ"
            data-autofocus
            autoCapitalize="characters"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            size="lg"
            styles={{ input: { fontFamily: DISPLAY, fontWeight: 700, letterSpacing: ".2em", textAlign: "center" } }}
            value={code}
            error={problem ? MESSAGES[problem] : undefined}
            onChange={(e) => {
              setCode(formatHostCode(e.currentTarget.value));
              if (problem !== "rate-limited") setProblem(null);
            }}
          />
          <Group justify="space-between">
            <GoldButton type="submit" loading={busy} disabled={!isCompleteHostCode(code) || waitSeconds > 0}>
              Continue
            </GoldButton>
            <Button variant="subtle" color="gray" onClick={onClose}>
              Cancel
            </Button>
          </Group>
          {waitSeconds > 0 && (
            <Text size="xs" c={SOFT}>
              Try again in {waitSeconds} s.
            </Text>
          )}
          {onSignIn && (
            <Group justify="space-between" wrap="nowrap">
              <Text size="xs" c={SOFT}>
                Sign in first so you can host from any device.
              </Text>
              <Button variant="subtle" size="compact-sm" onClick={onSignIn}>
                Sign in
              </Button>
            </Group>
          )}
        </Stack>
      </form>
    </Modal>
  );
}
