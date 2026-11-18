import { Group, SegmentedControl, Stack } from "@mantine/core";
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
import { Callout, Field, Hint, MenuButton, MenuSheet, SEGMENTED, Strength } from "./menu";
import { Toast } from "./Toast";
import { FAINT } from "./tokens";

type Tab = "sign-in" | "create";

const COPY = {
  "sign-in": { title: "Keep your games", lead: "Your history, stats, and hosting, on any phone.", tab: "sign-in" },
  create: { title: "Keep your games", lead: "Your history, stats, and hosting, on any phone.", tab: "create" },
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
      <Stack gap={18}>
        <Callout tone="info">
          Ask the person who runs Schmegettes to reset your password. Then sign in and change it on your Account page.
        </Callout>
        <MenuButton kind="secondary" full onClick={() => setForgot(false)}>
          Back
        </MenuButton>
      </Stack>
    );
  } else {
    body = (
      <form onSubmit={submit}>
        <Stack gap={16}>
          <SegmentedControl
            fullWidth
            radius="xl"
            withItemsBorders={false}
            value={tab}
            onChange={(v) => {
              setTab(v as Tab);
              setProblem(null);
            }}
            data={[
              { value: "sign-in", label: "Sign in" },
              { value: "create", label: "Create account" },
            ]}
            styles={SEGMENTED}
          />
          {problem && (
            <Callout
              tone="danger"
              action={
                problem === "email-taken" ? (
                  <MenuButton
                    kind="secondary"
                    size="sm"
                    onClick={() => {
                      setTab("sign-in");
                      setProblem(null);
                    }}
                  >
                    Sign in
                  </MenuButton>
                ) : undefined
              }
            >
              {ERRORS[problem]}
            </Callout>
          )}
          <Field
            label="Email"
            type="email"
            icon="mail"
            autoComplete="username"
            autoFocus
            inputProps={{ autoCapitalize: "none", autoCorrect: "off", spellCheck: false }}
            value={email}
            onChange={setEmail}
          />
          <div>
            <Field
              label="Password"
              type="password"
              autoComplete={tab === "create" ? "new-password" : "current-password"}
              value={password}
              onChange={setPassword}
            />
            {tab === "create" && <Strength value={password} min={MIN_PASSWORD} />}
          </div>
          <MenuButton type="submit" full loading={busy} disabled={!ready}>
            {tab === "create" ? "Create account" : "Sign in"}
          </MenuButton>
          <Group justify="space-between" align="center" wrap="nowrap">
            {tab === "sign-in" ? (
              <MenuButton kind="ghost" size="sm" onClick={() => setForgot(true)}>
                Forgot password?
              </MenuButton>
            ) : (
              <span />
            )}
            <MenuButton kind="ghost" size="sm" onClick={onClose}>
              Not now
            </MenuButton>
          </Group>
          <Hint icon="lock" color={FAINT}>
            We never email you or show your email to anyone.
          </Hint>
        </Stack>
      </form>
    );
  }

  return (
    <>
      <MenuSheet
        opened={opened && naming === null}
        onClose={onClose}
        title={COPY[variant].title}
        description={forgot ? undefined : COPY[variant].lead}
      >
        {body}
      </MenuSheet>
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
