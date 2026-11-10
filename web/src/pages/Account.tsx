import { Alert, Anchor, Button, Container, Group, Loader, Modal, Stack, Text, Title } from "@mantine/core";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import {
  type Account as AccountState,
  type AuthError,
  connectedProviders,
  connectProvider,
  currentAccount,
  deleteAccount,
  disconnectProvider,
  type Provider,
  signOut,
  takeAuthError,
} from "../lib/account";
import { AccountNameSheet } from "../ui/AccountNameSheet";
import { SignInSheet } from "../ui/SignInSheet";
import { DISPLAY, PHONE_BG, SOFT } from "../ui/tokens";

const PROVIDERS: { id: Provider; label: string }[] = [
  { id: "apple", label: "Apple" },
  { id: "google", label: "Google" },
];

const AUTH_ERRORS: Record<AuthError, string> = {
  "identity-taken": "That account is already used by another Schmegettes account.",
  failed: "Couldn't connect. Try again.",
};

/** /account: name, sign-in methods, sign out, delete (accounts/interaction-design.md). */
export function Account() {
  const navigate = useNavigate();
  const [account, setAccount] = useState<AccountState | null | "loading">("loading");
  const [providers, setProviders] = useState<Provider[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [confirm, setConfirm] = useState<"sign-out" | "delete" | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const a = await currentAccount();
    setAccount(a);
    if (a?.kind === "signed-in") setProviders(await connectedProviders().catch(() => []));
  }, []);

  useEffect(() => {
    const e = takeAuthError();
    if (e) setError(AUTH_ERRORS[e]);
    void load();
  }, [load]);

  async function connect(p: Provider) {
    setError(null);
    if (!(await connectProvider(p))) setError(AUTH_ERRORS.failed);
  }

  async function disconnect(p: Provider) {
    setError(null);
    if (await disconnectProvider(p)) setProviders((ps) => ps.filter((x) => x !== p));
    else setError("Couldn't disconnect. Try again.");
  }

  async function doSignOut() {
    setBusy(true);
    await signOut();
    setBusy(false);
    navigate("/");
  }

  async function doDelete() {
    setBusy(true);
    const result = await deleteAccount();
    setBusy(false);
    if (result === "ok") return navigate("/");
    setConfirm(null);
    setError(result === "in-game" ? "Finish or leave your game first." : "Couldn't delete your account. Try again.");
  }

  let body: React.ReactNode;
  if (account === "loading") {
    body = (
      <Group justify="center" mt="xl">
        <Loader color="green.4" />
      </Group>
    );
  } else if (account === null) {
    body = (
      <Stack align="center" mt="xl" gap="sm">
        <Text>Couldn't load your account. Try again.</Text>
        <Button variant="light" onClick={() => void load()}>
          Try again
        </Button>
      </Stack>
    );
  } else if (account.kind === "guest") {
    body = (
      <Stack align="center" mt="xl" gap="sm" ta="center">
        <Text>You're playing as a guest.</Text>
        <Button onClick={() => setSigningIn(true)}>Sign in</Button>
      </Stack>
    );
  } else {
    body = (
      <Stack gap="lg" mt="md">
        {error && <Alert color="red">{error}</Alert>}
        <Group justify="space-between">
          <Text c={SOFT}>Name</Text>
          <Group gap="xs">
            <Text fw={600}>{account.name ?? "—"}</Text>
            <Button variant="subtle" size="compact-sm" onClick={() => setEditing(true)}>
              Edit
            </Button>
          </Group>
        </Group>

        <Stack gap="xs">
          <Text c={SOFT}>Sign-in</Text>
          {PROVIDERS.map(({ id, label }) => {
            const connected = providers.includes(id);
            return (
              <Group key={id} justify="space-between">
                <Text>{label}</Text>
                {connected ? (
                  providers.length > 1 ? (
                    <Button variant="subtle" size="compact-sm" color="gray" onClick={() => void disconnect(id)}>
                      Disconnect
                    </Button>
                  ) : (
                    <Text size="sm" c="dimmed">
                      Connected
                    </Text>
                  )
                ) : (
                  <Button variant="light" size="compact-sm" onClick={() => void connect(id)}>
                    Connect
                  </Button>
                )}
              </Group>
            );
          })}
        </Stack>

        <Button variant="light" onClick={() => setConfirm("sign-out")}>
          Sign out
        </Button>
        <Anchor component="button" c="red.4" ta="center" onClick={() => setConfirm("delete")}>
          Delete account
        </Anchor>
      </Stack>
    );
  }

  return (
    <div style={{ minHeight: "100dvh", background: PHONE_BG, color: "#fff" }}>
      <Container size="xs" py="md">
        <Group justify="space-between" align="center">
          <Anchor component={Link} to="/" c="mauve.2">
            ‹ Home
          </Anchor>
          <Title order={2} ff={DISPLAY} fw={600}>
            Account
          </Title>
          <span style={{ width: 48 }} />
        </Group>
        {body}
      </Container>

      <SignInSheet opened={signingIn} onClose={() => setSigningIn(false)} />
      <AccountNameSheet
        opened={editing}
        title="Your name"
        initial={account !== "loading" && account?.kind === "signed-in" ? (account.name ?? "") : ""}
        onSaved={(name) => {
          setEditing(false);
          setAccount({ kind: "signed-in", name });
        }}
        onClose={() => setEditing(false)}
      />
      <Modal opened={confirm === "sign-out"} onClose={() => setConfirm(null)} title="Sign out?" centered>
        <Stack>
          <Text>Your games stay in your account. This phone starts fresh as a guest.</Text>
          <Group justify="flex-end">
            <Button variant="subtle" color="gray" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button loading={busy} onClick={() => void doSignOut()}>
              Sign out
            </Button>
          </Group>
        </Stack>
      </Modal>
      <Modal opened={confirm === "delete"} onClose={() => setConfirm(null)} title="Delete your account?" centered>
        <Stack>
          <Text>
            Your stats and leaderboard spot are deleted. Past scoreboards will show you as Former player. This can't be
            undone.
          </Text>
          <Group justify="flex-end">
            <Button variant="subtle" color="gray" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button color="red" loading={busy} onClick={() => void doDelete()}>
              Delete
            </Button>
          </Group>
        </Stack>
      </Modal>
    </div>
  );
}
