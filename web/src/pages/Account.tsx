import { Stack } from "@mantine/core";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import {
  type Account as AccountState,
  accountEmail,
  changePassword,
  currentAccount,
  deleteAccount,
  MIN_PASSWORD,
  type PasswordChange,
  signOut,
} from "../lib/account";
import { AccountNameSheet } from "../ui/AccountNameSheet";
import {
  Avatar,
  Callout,
  display,
  EmptyState,
  Field,
  GroupList,
  MenuButton,
  MenuScreen,
  MenuSheet,
  Row,
  SectionLabel,
  Strength,
} from "../ui/menu";
import { SignInSheet } from "../ui/SignInSheet";
import { Toast } from "../ui/Toast";
import { AMBER, FAINT, QUIET, SURFACE } from "../ui/tokens";

const PASSWORD_ERRORS: Record<Exclude<PasswordChange, "ok">, string> = {
  "wrong-password": "That password isn't right.",
  "weak-password": `Passwords are at least ${MIN_PASSWORD} characters.`,
  "rate-limited": "Too many tries. Wait a few minutes and try again.",
  error: "Couldn't change your password. Try again.",
};

/** /account: name, email, password, sign out, delete (accounts/interaction-design.md). */
export function Account() {
  const navigate = useNavigate();
  const [account, setAccount] = useState<AccountState | null | "loading">("loading");
  const [email, setEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [changing, setChanging] = useState(false);
  const [signingIn, setSigningIn] = useState<"sign-in" | "create" | null>(null);
  const [confirm, setConfirm] = useState<"sign-out" | "delete" | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    const a = await currentAccount();
    setAccount(a);
    if (a?.kind === "signed-in") setEmail(await accountEmail().catch(() => null));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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

  const closeToast = useCallback(() => setToast(null), []);

  let body: React.ReactNode;
  if (account === "loading") {
    body = (
      <div role="status" aria-busy="true" aria-label="Loading your account" style={{ padding: "0 16px" }}>
        <div className="mn-skel" style={{ height: 100, borderRadius: 26, marginBottom: 24 }} />
        <div className="mn-skel" style={{ height: 116, borderRadius: 22 }} />
      </div>
    );
  } else if (account === null) {
    body = (
      <EmptyState
        icon="warn"
        tint={AMBER}
        title="Couldn't load your account"
        action={
          <MenuButton kind="secondary" onClick={() => void load()}>
            Try again
          </MenuButton>
        }
      >
        Check your connection, then try again.
      </EmptyState>
    );
  } else if (account.kind === "guest") {
    body = (
      <EmptyState
        icon="user"
        tint="#c9b3f9"
        title="You're playing as a guest"
        action={
          <Stack gap={10} maw={340} mx="auto">
            <MenuButton full onClick={() => setSigningIn("create")}>
              Create account
            </MenuButton>
            <MenuButton full kind="ghost" onClick={() => setSigningIn("sign-in")}>
              I have an account
            </MenuButton>
          </Stack>
        }
      >
        An account keeps your games and host access on any phone. Playing stays free of sign-ups.
      </EmptyState>
    );
  } else {
    body = (
      <>
        <div
          className="sg-in"
          style={{
            ...SURFACE,
            margin: "0 16px 24px",
            padding: 18,
            borderRadius: 26,
            display: "flex",
            gap: 16,
            alignItems: "center",
            background:
              "radial-gradient(120% 120% at 0% 0%, rgba(145,97,242,.35), transparent 60%), rgba(255,255,255,.04)",
          }}
        >
          <Avatar name={account.name} size={64} />
          <div style={{ minWidth: 0 }}>
            <div style={display(26)}>{account.name ?? "—"}</div>
            <div
              style={{
                fontSize: 14,
                color: QUIET,
                marginTop: 6,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {email ?? "—"}
            </div>
          </div>
        </div>

        {error && (
          <div style={{ margin: "0 16px 18px" }}>
            <Callout tone="danger" onClose={() => setError(null)}>
              {error}
            </Callout>
          </div>
        )}

        <SectionLabel>Profile</SectionLabel>
        <GroupList>
          <Row icon="user" title="Name" value={account.name ?? "—"} onClick={() => setEditing(true)} />
          <Row icon="mail" title="Email" value={email ?? "—"} />
        </GroupList>
        <p className="mn-pretty" style={{ fontSize: 13, color: FAINT, margin: "8px 28px 24px", lineHeight: 1.4 }}>
          Your email is your username. It can't be changed.
        </p>

        <SectionLabel>Security</SectionLabel>
        <GroupList>
          <Row icon="lock" title="Change password" onClick={() => setChanging(true)} />
          <Row
            icon="out"
            title="Sign out"
            sub="Your games stay in your account"
            onClick={() => setConfirm("sign-out")}
          />
        </GroupList>

        <div style={{ height: 32 }} />
        <GroupList>
          <Row icon="trash" danger title="Delete account" onClick={() => setConfirm("delete")} />
        </GroupList>
      </>
    );
  }

  return (
    <MenuScreen title="Account" back={{ label: "Home", to: "/" }}>
      {body}

      <SignInSheet
        opened={signingIn !== null}
        variant={signingIn ?? "sign-in"}
        onClose={() => setSigningIn(null)}
        onSignedIn={() => {
          setSigningIn(null);
          void load();
        }}
      />
      <AccountNameSheet
        opened={editing}
        title="Your name"
        initial={account !== "loading" && account?.kind === "signed-in" ? (account.name ?? "") : ""}
        onSaved={(name) => {
          setEditing(false);
          setAccount({ kind: "signed-in", name });
          setToast("Name saved.");
        }}
        onClose={() => setEditing(false)}
      />
      <ChangePasswordSheet
        opened={changing}
        onClose={() => setChanging(false)}
        onChanged={() => {
          setChanging(false);
          setToast("Password changed.");
        }}
      />
      <MenuSheet
        opened={confirm === "sign-out"}
        onClose={() => setConfirm(null)}
        title="Sign out?"
        description="Your games stay in your account. This phone starts fresh as a guest."
        centered={{ icon: "out" }}
      >
        <Stack gap={10}>
          <MenuButton full loading={busy} onClick={() => void doSignOut()}>
            Sign out
          </MenuButton>
          <MenuButton full kind="ghost" onClick={() => setConfirm(null)}>
            Cancel
          </MenuButton>
        </Stack>
      </MenuSheet>
      <MenuSheet
        opened={confirm === "delete"}
        onClose={() => setConfirm(null)}
        title="Delete your account?"
        description="Your stats and leaderboard spot are deleted. Past scoreboards will show you as Former player. This can't be undone."
        centered={{ icon: "trash", danger: true }}
      >
        <Stack gap={10}>
          <MenuButton full kind="danger-solid" loading={busy} onClick={() => void doDelete()}>
            Delete account
          </MenuButton>
          <MenuButton full kind="ghost" onClick={() => setConfirm(null)}>
            Cancel
          </MenuButton>
        </Stack>
      </MenuSheet>
      <Toast message={toast} onClose={closeToast} />
    </MenuScreen>
  );
}

function ChangePasswordSheet({
  opened,
  onClose,
  onChanged,
}: {
  opened: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Exclude<PasswordChange, "ok"> | null>(null);

  useEffect(() => {
    if (!opened) return;
    setCurrent("");
    setNext("");
    setProblem(null);
  }, [opened]);

  async function save(event: { preventDefault(): void }) {
    event.preventDefault();
    if (busy || !current || next.length < MIN_PASSWORD) return;
    setBusy(true);
    const r = await changePassword(current, next);
    setBusy(false);
    if (r === "ok") return onChanged();
    setProblem(r);
    if (r === "wrong-password") setCurrent("");
  }

  return (
    <MenuSheet opened={opened} onClose={onClose} title="Change password">
      <form onSubmit={save}>
        <Stack gap={16}>
          {problem && problem !== "wrong-password" && <Callout tone="danger">{PASSWORD_ERRORS[problem]}</Callout>}
          <Field
            label="Current password"
            type="password"
            autoComplete="current-password"
            autoFocus
            error={problem === "wrong-password" ? PASSWORD_ERRORS[problem] : null}
            value={current}
            onChange={(v) => {
              setCurrent(v);
              if (problem === "wrong-password") setProblem(null);
            }}
          />
          <div>
            <Field label="New password" type="password" autoComplete="new-password" value={next} onChange={setNext} />
            <Strength value={next} min={MIN_PASSWORD} />
          </div>
          <MenuButton type="submit" full loading={busy} disabled={!current || next.length < MIN_PASSWORD}>
            Save
          </MenuButton>
        </Stack>
      </form>
    </MenuSheet>
  );
}
