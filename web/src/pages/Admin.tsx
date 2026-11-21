import { Stack } from "@mantine/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { currentAccount } from "../lib/account";
import {
  environmentName,
  formatCode,
  type HostCodeState,
  hostCode,
  localTime,
  msUntilRotation,
  rotateHostCode,
} from "../lib/admin";
import { Callout, EmptyState, MenuButton, MenuScreen, MenuSheet, numbers, SectionLabel, Spinner } from "../ui/menu";
import { Toast } from "../ui/Toast";
import { AMBER, QUIET, RED, SOFT, SURFACE } from "../ui/tokens";

type Load =
  | { kind: "loading" }
  | { kind: "ready"; state: HostCodeState }
  | { kind: "error"; reason: "rate-limited" | "unreachable" };

const ERROR_TEXT = {
  "rate-limited": "Too many tries. Wait a minute and try again.",
  unreachable: "Check your connection, then try again.",
} as const;

/**
 * /admin: the current host code and Rotate now, for accounts on the admin list only (private
 * access feature brief, "Admin screen in the app"). Anyone else is sent Home before any admin
 * call. The code stays masked until Show, because this phone may be the host device mirrored
 * to the TV; it masks again when the screen is left or the phone is locked.
 */
export function Admin() {
  const navigate = useNavigate();
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [shown, setShown] = useState(false);
  const [asking, setAsking] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const environment = environmentName(window.location.hostname);

  const fetchCode = useCallback(async () => {
    const result = await hostCode();
    if (result.ok) {
      setShown(false);
      setLoad({ kind: "ready", state: result.data });
    } else if (result.reason === "gone") navigate("/", { replace: true });
    else setLoad({ kind: "error", reason: result.reason });
  }, [navigate]);

  // Admins only: anyone else goes Home without touching the admin api.
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void currentAccount().then((a) => {
      if (a?.kind !== "signed-in" || !a.isAdmin) navigate("/", { replace: true });
      else void fetchCode();
    });
  }, [navigate, fetchCode]);

  // One fetch just after each rotation: no polling (the admin api allows 5 calls a minute).
  const state = load.kind === "ready" ? load.state : null;
  useEffect(() => {
    if (!state) return;
    const ms = msUntilRotation(state);
    if (ms === null) return;
    const id = setTimeout(() => void fetchCode(), ms + 1500);
    return () => clearTimeout(id);
  }, [state, fetchCode]);

  // Locking the phone or switching apps masks the code again.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") setShown(false);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  async function copy(code: string) {
    try {
      await navigator.clipboard.writeText(formatCode(code));
      setToast("Copied");
    } catch {
      setShown(true);
    }
  }

  async function rotate(expected: string) {
    setRotating(true);
    const result = await rotateHostCode(expected);
    setRotating(false);
    setAsking(false);
    if (result.ok) {
      setShown(false);
      setLoad({ kind: "ready", state: result.data });
    } else if (result.reason === "gone") navigate("/", { replace: true });
    else setToast(ERROR_TEXT[result.reason]);
  }

  let body: React.ReactNode;
  if (load.kind === "loading") {
    body = (
      <div style={{ display: "grid", placeItems: "center", padding: 48, color: QUIET }}>
        <Spinner size={24} />
      </div>
    );
  } else if (load.kind === "error") {
    body = (
      <EmptyState
        icon="warn"
        tint={AMBER}
        title="Couldn't load the host code"
        action={
          <MenuButton kind="secondary" onClick={() => void fetchCode()}>
            Try again
          </MenuButton>
        }
      >
        {ERROR_TEXT[load.reason]}
      </EmptyState>
    );
  } else {
    const s = load.state;
    const rotatesOnItsOwn = msUntilRotation(s) !== null;
    body = (
      <Stack gap={14} style={{ padding: "0 16px" }}>
        <div style={{ borderRadius: 22, padding: "16px 18px", ...SURFACE }}>
          <SectionLabel>Host code</SectionLabel>
          <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "10px 0 14px" }}>
            <output
              aria-label="Host code"
              style={numbers(34, { flex: 1, letterSpacing: ".08em", color: shown ? "#fff" : SOFT })}
            >
              {shown ? formatCode(s.code) : "••••-••••"}
            </output>
            <MenuButton kind="ghost" size="sm" onClick={() => setShown((v) => !v)}>
              {shown ? "Hide" : "Show"}
            </MenuButton>
          </div>
          <MenuButton full kind="secondary" onClick={() => void copy(s.code)}>
            Copy code
          </MenuButton>
          <p style={{ color: SOFT, fontSize: 14, margin: "12px 0 0" }}>
            {rotatesOnItsOwn ? `Changes at ${localTime(s.rotatesAt)}` : "Doesn't change on its own here"}
          </p>
          {s.previousValidUntil && (
            <p style={{ color: QUIET, fontSize: 14, margin: "4px 0 0" }}>
              Previous code works until {localTime(s.previousValidUntil)}
            </p>
          )}
        </div>
        <MenuButton full kind="danger" onClick={() => setAsking(true)}>
          Rotate now
        </MenuButton>
        <Callout tone="info">Hosts and notes are on the devtools admin page.</Callout>
        <MenuSheet
          opened={asking}
          onClose={() => setAsking(false)}
          title={`Retire ${formatCode(s.code)} now?`}
          description="Anyone who hasn't used it yet will need the new code."
          centered={{ icon: "key", danger: true }}
        >
          <Stack gap={10}>
            <MenuButton full kind="danger-solid" loading={rotating} onClick={() => void rotate(s.code)}>
              Rotate
            </MenuButton>
            <MenuButton full kind="ghost" onClick={() => setAsking(false)}>
              Cancel
            </MenuButton>
          </Stack>
        </MenuSheet>
      </Stack>
    );
  }

  return (
    <MenuScreen title="Admin" back={{ label: "Home", to: "/" }}>
      <p
        style={{
          margin: "-10px 20px 16px",
          fontWeight: 700,
          fontSize: 14,
          color: environment === "Production" ? RED : SOFT,
        }}
      >
        {environment}
      </p>
      {body}
      <Toast message={toast} onClose={() => setToast(null)} />
    </MenuScreen>
  );
}
