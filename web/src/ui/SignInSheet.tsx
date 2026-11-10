import {
  Alert,
  Anchor,
  Button,
  Group,
  Modal,
  PasswordInput,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { useCallback, useEffect, useState } from "react";
import {
  createAccount,
  looksLikeEmail,
  MIN_PASSWORD,
  type SignedIn,
  type SignInResult,
  signIn,
  signInMessage,
} from "../lib/account";
import { getLastName } from "../lib/displayName";
import { AccountNameSheet } from "./AccountNameSheet";
import { GoldButton } from "./GoldButton";
import { Toast } from "./Toast";
import { SOFT } from "./tokens";

type Tab = "sign-in" | "create";

const COPY = {
  "sign-in": { title: "Keep your games", lead: "Your history, stats, and hosting, on any phone.", tab: "sign-in" },
  save: {
    title: "Save your games",
    lead: "Tonight's scores are only on this phone. Create an account to keep them on any phone.",
    tab: "create",
  },
} as const;

const ERRORS: Record<Exclude<SignInResult["kind"], "ok">, string> = {
  "wrong-credentials": "That email and password don't match.",
  "email-taken": "That email already has an account. Sign in instead.",
  "weak-password": `Passwords are at least ${MIN_PASSWORD} characters.`,
  "rate-limited": "Too many tries. Wait a few minutes and try again.",
  error: "Couldn't sign in. Try again.",
};

/**
 * Email and password sign-in (accounts/interaction-design.md). Finishes the sign-in itself:
 * moves this device's games in, asks a new account for its name, and says what happened.
 * Never shown in a room or on a hosting device.
 */
export function SignInSheet({
  opened,
  onClose,
  onSignedIn,
  variant = "sign-in",
}: {
  opened: boolean;
  onClose: () => void;
  /** Called once signed in (after the name, for a new account). */
  onSignedIn?: () => void;
  variant?: keyof typeof COPY;
}) {
  const [tab, setTab] = useState<Tab>(COPY[variant].tab);
  const [forgot, setForgot] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<keyof typeof ERRORS | null>(null);
  const [naming, setNaming] = useState<{ result: SignedIn; created: boolean } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!opened) return;
    setTab(COPY[variant].tab);
    setForgot(false);
    setPassword("");
    setProblem(null);
  }, [opened, variant]);

  const ready = looksLikeEmail(email) && password.length >= MIN_PASSWORD;

  function done(result: SignedIn, created: boolean) {
    setToast(signInMessage(result, created));
    setPassword("");
    if (onSignedIn) onSignedIn();
    else onClose();
  }

  async function submit(event: { preventDefault(): void }) {
    event.preventDefault();
    if (busy || !ready) return;
    setBusy(true);
    setProblem(null);
    const created = tab === "create";
    const r = await (created ? createAccount(email, password) : signIn(email, password));
    setBusy(false);
    if (r.kind !== "ok") {
      setProblem(r.kind);
      if (r.kind === "wrong-credentials") setPassword("");
      return;
    }
    if (r.result.needsName) setNaming({ result: r.result, created });
    else done(r.result, created);
  }

  // Saved or skipped, the sign-in is done; a skipped name is asked for again next sign-in.
  function finishNaming() {
    const n = naming;
    setNaming(null);
    if (n) done(n.result, n.created);
  }

  const closeToast = useCallback(() => setToast(null), []);

  let body: React.ReactNode;
  if (forgot) {
    body = (
      <Stack>
        <Text>
          Ask the person who runs Schmegettes to reset your password. Then sign in and change it on your Account page.
        </Text>
        <Group justify="flex-start">
          <Button variant="subtle" onClick={() => setForgot(false)}>
            Back
          </Button>
        </Group>
      </Stack>
    );
  } else {
    body = (
      <form onSubmit={submit}>
        <Stack>
          <Text>{COPY[variant].lead}</Text>
          <SegmentedControl
            fullWidth
            value={tab}
            onChange={(v) => {
              setTab(v as Tab);
              setProblem(null);
            }}
            data={[
              { value: "sign-in", label: "Sign in" },
              { value: "create", label: "Create account" },
            ]}
          />
          {problem && (
            <Alert color="red">
              <Group justify="space-between" wrap="nowrap" gap="xs">
                <Text size="sm">{ERRORS[problem]}</Text>
                {problem === "email-taken" && (
                  <Button
                    size="compact-sm"
                    variant="white"
                    onClick={() => {
                      setTab("sign-in");
                      setProblem(null);
                    }}
                  >
                    Sign in
                  </Button>
                )}
              </Group>
            </Alert>
          )}
          <TextInput
            label="Email"
            type="email"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            data-autofocus
            value={email}
            onChange={(e) => setEmail(e.currentTarget.value)}
          />
          <PasswordInput
            label="Password"
            description={tab === "create" ? `At least ${MIN_PASSWORD} characters.` : undefined}
            autoComplete={tab === "create" ? "new-password" : "current-password"}
            visibilityToggleButtonProps={{ "aria-label": "Show password" }}
            value={password}
            onChange={(e) => setPassword(e.currentTarget.value)}
          />
          <GoldButton type="submit" loading={busy} disabled={!ready}>
            {tab === "create" ? "Create account" : "Sign in"}
          </GoldButton>
          {tab === "sign-in" && (
            <Anchor component="button" type="button" size="sm" ta="left" onClick={() => setForgot(true)}>
              Forgot password?
            </Anchor>
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
      </form>
    );
  }

  return (
    <>
      <Modal opened={opened && naming === null} onClose={onClose} title={COPY[variant].title} centered>
        {body}
      </Modal>
      <AccountNameSheet
        opened={naming !== null}
        initial={getLastName()}
        onSaved={finishNaming}
        onClose={finishNaming}
      />
      <Toast message={toast} onClose={closeToast} />
    </>
  );
}
