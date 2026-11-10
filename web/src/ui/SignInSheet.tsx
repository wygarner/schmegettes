import { Alert, Button, Group, Modal, Stack, Text } from "@mantine/core";
import { useState } from "react";
import { isEmbeddedBrowser, type Provider, startSignIn } from "../lib/account";
import { SOFT } from "./tokens";

const COPY = {
  "sign-in": { title: "Keep your games", lead: "Your history, stats, and hosting, on any phone." },
  save: {
    title: "Save your games",
    lead: "Tonight's scores are only on this phone. Sign in to keep them on any phone.",
  },
};

/**
 * Apple and Google sign-in (accounts/interaction-design.md, "Sign in"). Never shown in a room
 * or on a hosting device.
 */
export function SignInSheet({
  opened,
  onClose,
  variant = "sign-in",
  userAgent = navigator.userAgent,
}: {
  opened: boolean;
  onClose: () => void;
  variant?: keyof typeof COPY;
  userAgent?: string;
}) {
  const [busy, setBusy] = useState<Provider | null>(null);
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState(false);
  const embedded = isEmbeddedBrowser(userAgent);

  async function go(provider: Provider) {
    if (busy) return;
    setBusy(provider);
    setFailed(false);
    const started = await startSignIn(provider);
    // On success the page is already leaving for Apple or Google.
    if (!started) {
      setBusy(null);
      setFailed(true);
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
    } catch {
      // Nothing to do; the message still says what to do.
    }
  }

  return (
    <Modal opened={opened} onClose={onClose} title={COPY[variant].title} centered>
      <Stack>
        <Text>{COPY[variant].lead}</Text>
        {failed && <Alert color="red">Couldn't sign in. Try again.</Alert>}
        <Button size="lg" color="gray.0" autoContrast loading={busy === "apple"} onClick={() => void go("apple")}>
          Continue with Apple
        </Button>
        {embedded ? (
          <Stack gap="xs">
            <Text size="sm">Google sign-in doesn't work in this app. Open Schmegettes in Safari or Chrome.</Text>
            <Button variant="light" onClick={() => void copyLink()}>
              {copied ? "Link copied" : "Copy link"}
            </Button>
          </Stack>
        ) : (
          <Button size="lg" variant="default" loading={busy === "google"} onClick={() => void go("google")}>
            Continue with Google
          </Button>
        )}
        <Group justify="space-between" align="center" wrap="nowrap">
          <Text size="xs" c={SOFT}>
            We never email you or show your email to anyone.
          </Text>
          <Button variant="subtle" color="gray" onClick={onClose}>
            Not now
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
