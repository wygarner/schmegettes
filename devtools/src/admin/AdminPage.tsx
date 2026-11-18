// Admin page: the current host code and the hosts of one environment. Local only, never
// deployed. Rules and copy: docs/product-docs/features/private-access/interaction-design.md.
import {
  Alert,
  Badge,
  Button,
  CopyButton,
  Group,
  Modal,
  Paper,
  PasswordInput,
  Radio,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type AdminApi,
  AdminApiError,
  type AdminHost,
  type AdminHostCode,
  createAdminApi,
  SignInError,
  UnreachableError,
} from "./client";
import { configured, type EnvironmentConfig, type EnvironmentName, environments as realEnvironments } from "./env";
import { formatCode, hostLabel, maxTimerMs, rotatesOnItsOwn, shortDate, timeLeft, utcTime } from "./format";

const notAdmin = "Can't sign in as an admin here.";
const environmentKey = "schmegettes-admin-environment";
const order: EnvironmentName[] = ["local", "staging", "production"];

type Phase = "checking" | "signed-out" | "loading" | "ready" | "unreachable";
type Confirm = { kind: "rotate"; code: string } | { kind: "remove"; host: AdminHost } | null;

function savedEnvironment(): EnvironmentName {
  try {
    const saved = localStorage.getItem(environmentKey);
    if (saved === "local" || saved === "staging" || saved === "production") return saved;
  } catch {}
  return "local";
}

export interface AdminPageProps {
  environments?: Record<EnvironmentName, EnvironmentConfig>;
  createApi?: (config: EnvironmentConfig) => AdminApi;
}

export function AdminPage({ environments = realEnvironments, createApi = createAdminApi }: AdminPageProps) {
  const [envName, setEnvName] = useState<EnvironmentName>(savedEnvironment);
  const config = environments[envName];
  const ready = configured(config);
  const apis = useRef(new Map<EnvironmentName, AdminApi>());
  const api = useMemo(() => {
    if (!ready) return null;
    let existing = apis.current.get(envName);
    if (!existing) {
      existing = createApi(config);
      apis.current.set(envName, existing);
    }
    return existing;
  }, [envName, ready, config, createApi]);

  const [phase, setPhase] = useState<Phase>("checking");
  const [message, setMessage] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signedInAs, setSignedInAs] = useState("");
  const [code, setCode] = useState<AdminHostCode | null>(null);
  const [hosts, setHosts] = useState<AdminHost[]>([]);
  const [offsetMs, setOffsetMs] = useState(0); // server clock minus this computer's clock
  const [now, setNow] = useState(() => Date.now());
  const [blockedUntil, setBlockedUntil] = useState(0);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [failed, setFailed] = useState(false);

  const clear = useCallback(() => {
    setCode(null);
    setHosts([]);
    setConfirm(null);
    setEditing(null);
  }, []);

  const showCode = useCallback((next: AdminHostCode) => {
    setCode(next);
    setOffsetMs(Date.parse(next.serverTime) - Date.now());
  }, []);

  // One place decides what a failure means: not an admin (or signed out), slow down, unreachable.
  const fail = useCallback(
    async (err: unknown) => {
      if (err instanceof AdminApiError && (err.status === 404 || err.status === 401)) {
        clear();
        await api?.signOut();
        setPhase("signed-out");
        setMessage(notAdmin);
      } else if (err instanceof AdminApiError && err.status === 429) {
        setNow(Date.now());
        setBlockedUntil(Date.now() + Math.max(err.retryAfterSeconds, 1) * 1000);
      } else if (err instanceof UnreachableError) {
        clear();
        setPhase("unreachable");
      } else {
        setFailed(true);
      }
    },
    [api, clear],
  );

  const load = useCallback(async () => {
    if (!api) return;
    setPhase("loading");
    try {
      const nextCode = await api.hostCode();
      const nextHosts = await api.hosts();
      showCode(nextCode);
      setHosts(nextHosts);
      setPhase("ready");
    } catch (err) {
      await fail(err);
    }
  }, [api, fail, showCode]);

  // On arrival and on each environment change: resume a saved session, or ask to sign in.
  useEffect(() => {
    let cancelled = false;
    clear();
    setMessage(null);
    if (!api) {
      setPhase("signed-out");
      return;
    }
    setPhase("checking");
    api
      .currentEmail()
      .then((current) => {
        if (cancelled) return;
        if (current) {
          setSignedInAs(current);
          void load();
        } else {
          setPhase("signed-out");
        }
      })
      .catch(() => !cancelled && setPhase("signed-out"));
    return () => {
      cancelled = true;
    };
  }, [api, clear, load]);

  // The countdown ticks every second; no requests.
  useEffect(() => {
    if (phase !== "ready") return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [phase]);

  // Fetch the code again at rotation and when the previous code's grace ends.
  useEffect(() => {
    if (phase !== "ready" || !code || !api) return;
    const serverNow = Date.now() + offsetMs;
    const timers = [code.rotatesAt, code.previousValidUntil]
      .filter((at): at is string => Boolean(at))
      .map((at) => Date.parse(at) - serverNow + 500)
      .filter((delay) => delay > 0 && delay <= maxTimerMs)
      .map((delay) =>
        setTimeout(() => {
          api.hostCode().then(showCode, fail);
        }, delay),
      );
    return () => {
      for (const id of timers) clearTimeout(id);
    };
  }, [phase, code, api, offsetMs, showCode, fail]);

  const blocked = blockedUntil > now;
  useEffect(() => {
    if (blockedUntil <= Date.now()) return;
    const id = setTimeout(() => setNow(Date.now()), blockedUntil - Date.now());
    return () => clearTimeout(id);
  }, [blockedUntil]);

  async function switchEnvironment(next: EnvironmentName) {
    if (next === envName) return;
    await api?.signOut();
    try {
      localStorage.setItem(environmentKey, next);
    } catch {}
    setEnvName(next);
  }

  async function signIn(event: FormEvent) {
    event.preventDefault();
    if (!api) return;
    setMessage(null);
    try {
      const result = await api.signIn(email, password);
      setPassword("");
      setSignedInAs(result.email);
      await load();
    } catch (err) {
      setPassword("");
      if (err instanceof SignInError) setMessage(notAdmin);
      else await fail(err);
    }
  }

  async function signOut() {
    await api?.signOut();
    clear();
    setMessage(null);
    setPhase("signed-out");
  }

  async function confirmAction() {
    if (!api || !confirm) return;
    const current = confirm;
    setConfirm(null);
    setFailed(false);
    try {
      if (current.kind === "rotate") {
        showCode(await api.rotate(current.code));
      } else {
        await api.removeHost(current.host.userId);
        setHosts((list) => list.filter((h) => h.userId !== current.host.userId));
      }
    } catch (err) {
      await fail(err);
    }
  }

  async function saveNote(userId: string) {
    if (!api) return;
    setFailed(false);
    try {
      const updated = await api.setNote(userId, draft.trim() === "" ? null : draft);
      setHosts((list) => list.map((h) => (h.userId === userId ? updated : h)));
      setEditing(null);
    } catch (err) {
      await fail(err);
    }
  }

  const production = envName === "production";
  const serverNow = now + offsetMs;
  const graceLeft = code?.previousValidUntil && Date.parse(code.previousValidUntil) > serverNow;

  return (
    <Paper
      p="lg"
      maw={760}
      withBorder
      data-environment={envName}
      style={production ? { border: "3px solid var(--mantine-color-red-6)" } : undefined}
    >
      {phase === "ready" || phase === "loading" ? (
        <Group justify="space-between" mb="md">
          <Group gap="xs">
            <Badge color={production ? "red" : "gray"} size="lg">
              {config.label.toUpperCase()}
            </Badge>
            <Text>{signedInAs}</Text>
          </Group>
          <Button variant="subtle" onClick={signOut}>
            Sign out
          </Button>
        </Group>
      ) : (
        <Title order={2} mb="md">
          Admin
        </Title>
      )}

      {phase === "signed-out" || phase === "checking" ? (
        <form onSubmit={signIn}>
          <Stack>
            <Radio.Group
              label="Environment"
              value={envName}
              onChange={(value) => void switchEnvironment(value as EnvironmentName)}
            >
              <Group>
                {order.map((name) => (
                  <Radio
                    key={name}
                    value={name}
                    label={environments[name].label}
                    color={name === "production" ? "red" : undefined}
                  />
                ))}
              </Group>
            </Radio.Group>
            {production && (
              <Badge color="red" size="lg">
                PRODUCTION
              </Badge>
            )}
            {!ready && (
              <Alert color="yellow">
                {config.label} isn't set up. Add its VITE_{envName.toUpperCase()}_* values to devtools/.env.local.
              </Alert>
            )}
            <TextInput
              label="Email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.currentTarget.value)}
            />
            <PasswordInput
              label="Password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.currentTarget.value)}
            />
            {message && <Text c="red">{message}</Text>}
            <Group>
              <Button type="submit" color={production ? "red" : undefined} disabled={!ready || !email || !password}>
                Sign in
              </Button>
            </Group>
          </Stack>
        </form>
      ) : null}

      {phase === "unreachable" && (
        <Alert color="red" title={`Can't reach ${config.label}.`}>
          <Button mt="sm" onClick={() => void load()}>
            Try again
          </Button>
        </Alert>
      )}

      {phase === "loading" && <Text c="dimmed">Loading…</Text>}

      {phase === "ready" && code && (
        <Stack gap="xl">
          {blocked && (
            <Alert color="yellow">Too many requests. Try again in {Math.ceil((blockedUntil - now) / 1000)} s.</Alert>
          )}
          {failed && <Alert color="red">Something went wrong. Try again.</Alert>}

          <Stack gap={4}>
            <Text fw={600}>Host code</Text>
            <Group>
              <Text ff="monospace" fz={32} data-testid="host-code">
                {formatCode(code.code)}
              </Text>
              <CopyButton value={formatCode(code.code)}>
                {({ copied, copy }) => (
                  <Button variant="light" onClick={copy}>
                    {copied ? "Copied" : "Copy"}
                  </Button>
                )}
              </CopyButton>
            </Group>
            <Text>
              {rotatesOnItsOwn(code.rotatesAt, code.serverTime)
                ? `Changes in ${timeLeft(Date.parse(code.rotatesAt) - serverNow)} (${utcTime(code.rotatesAt)})`
                : "Doesn't change on its own here. Use Rotate now."}
            </Text>
            {graceLeft && code.previousValidUntil && (
              <Text c="dimmed">Previous code works until {utcTime(code.previousValidUntil)}</Text>
            )}
            <Group>
              <Button
                color={production ? "red" : undefined}
                disabled={blocked}
                onClick={() => setConfirm({ kind: "rotate", code: code.code })}
              >
                Rotate now
              </Button>
            </Group>
          </Stack>

          <Stack gap="xs">
            <Text fw={600}>Hosts ({hosts.length})</Text>
            {hosts.length === 0 ? (
              <Text c="dimmed">No hosts yet.</Text>
            ) : (
              <Table>
                <Table.Tbody>
                  {hosts.map((host) => (
                    <Table.Tr key={host.userId} data-testid="host-row">
                      <Table.Td>{hostLabel(host)}</Table.Td>
                      <Table.Td>since {shortDate(host.hostSince)}</Table.Td>
                      <Table.Td>
                        {editing === host.userId ? (
                          <Group gap="xs">
                            <TextInput
                              aria-label="Note"
                              maxLength={200}
                              value={draft}
                              onChange={(e) => setDraft(e.currentTarget.value)}
                            />
                            <Button size="xs" disabled={blocked} onClick={() => void saveNote(host.userId)}>
                              Save
                            </Button>
                            <Button size="xs" variant="subtle" onClick={() => setEditing(null)}>
                              Cancel
                            </Button>
                          </Group>
                        ) : (
                          <Group gap="xs">
                            <Text>{host.note ? `"${host.note}"` : "—"}</Text>
                            <Button
                              size="xs"
                              variant="subtle"
                              aria-label={`Edit note for ${hostLabel(host)}`}
                              onClick={() => {
                                setEditing(host.userId);
                                setDraft(host.note ?? "");
                              }}
                            >
                              ✎
                            </Button>
                          </Group>
                        )}
                      </Table.Td>
                      <Table.Td>
                        <Button
                          size="xs"
                          color="red"
                          variant="light"
                          disabled={blocked}
                          onClick={() => setConfirm({ kind: "remove", host })}
                        >
                          Remove
                        </Button>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            )}
          </Stack>
        </Stack>
      )}

      <Modal opened={confirm !== null} onClose={() => setConfirm(null)} withCloseButton={false} centered>
        {confirm && (
          <Stack>
            <Text>
              {confirm.kind === "rotate"
                ? `Retire ${formatCode(confirm.code)} now? Anyone who hasn't used it yet will need the new code.`
                : `Remove host access for ${hostLabel(confirm.host)}? Their next create, Start, or Rematch will be refused.`}
            </Text>
            <Group justify="flex-end">
              <Button variant="subtle" onClick={() => setConfirm(null)}>
                Cancel
              </Button>
              <Button color="red" onClick={() => void confirmAction()}>
                {confirm.kind === "rotate" ? "Rotate" : "Remove"}
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </Paper>
  );
}
