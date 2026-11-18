import { Stack } from "@mantine/core";
import { useEffect, useState } from "react";
import { formatHostCode, isCompleteHostCode, redeemHostCode } from "../lib/hostAccess";
import { Callout, Field, Hint, MenuButton, MenuSheet } from "../ui/menu";
import { DISPLAY, FAINT } from "../ui/tokens";

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
    <MenuSheet
      opened={opened}
      onClose={onClose}
      title="Schmegettes is invite-only"
      description="Enter the host code you were given."
    >
      <form onSubmit={submit}>
        <Stack gap={18}>
          <Field
            label="Host code"
            icon="key"
            placeholder="K7RX-M2PQ"
            autoFocus
            autoComplete="off"
            inputProps={{ autoCapitalize: "characters", autoCorrect: "off", spellCheck: false }}
            inputStyle={{ fontFamily: DISPLAY, fontWeight: 700, letterSpacing: ".2em", fontSize: 20 }}
            value={code}
            error={problem ? MESSAGES[problem] : undefined}
            onChange={(v) => {
              setCode(formatHostCode(v));
              if (problem !== "rate-limited") setProblem(null);
            }}
          />
          {waitSeconds > 0 && (
            <Hint icon="info" color={FAINT}>
              Try again in {waitSeconds} s.
            </Hint>
          )}
          <MenuButton type="submit" full loading={busy} disabled={!isCompleteHostCode(code) || waitSeconds > 0}>
            Continue
          </MenuButton>
          <MenuButton kind="ghost" full onClick={onClose}>
            Cancel
          </MenuButton>
          {onSignIn && (
            <Callout
              tone="info"
              action={
                <MenuButton kind="secondary" size="sm" onClick={onSignIn}>
                  Sign in
                </MenuButton>
              }
            >
              Sign in first so you can host from any device.
            </Callout>
          )}
        </Stack>
      </form>
    </MenuSheet>
  );
}
