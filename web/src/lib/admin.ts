// The web app's Admin screen: the current host code and Rotate now, for admins only
// (docs/product-docs/features/private-access/feature-brief.md, "Admin screen in the app").
// The same api routes as the devtools admin page. They answer 404 to anyone who isn't an
// admin and share a 5-a-minute limit per user, so this never polls.
import type { ApiComponents } from "@schmegettes/shared";
import { api } from "./api";

export type HostCodeState = ApiComponents["schemas"]["AdminHostCode"];

/** What a call gave back: the state, or why not. `gone`: not (or no longer) an admin. */
export type HostCodeResult =
  | { ok: true; data: HostCodeState }
  | { ok: false; reason: "gone" | "rate-limited" | "unreachable" };

function failure(status: number | undefined): HostCodeResult {
  if (status === 404) return { ok: false, reason: "gone" };
  if (status === 429) return { ok: false, reason: "rate-limited" };
  return { ok: false, reason: "unreachable" };
}

export async function hostCode(): Promise<HostCodeResult> {
  try {
    const { data, response } = await api.GET("/v1/admin/host-code");
    return data ? { ok: true, data } : failure(response.status);
  } catch {
    return { ok: false, reason: "unreachable" };
  }
}

/** Retires `expectedCode` now. A stale request gets the code that already replaced it. */
export async function rotateHostCode(expectedCode: string): Promise<HostCodeResult> {
  try {
    const { data, response } = await api.POST("/v1/admin/host-code/rotate", { body: { expectedCode } });
    return data ? { ok: true, data } : failure(response.status);
  } catch {
    return { ok: false, reason: "unreachable" };
  }
}

/** K7RXM2PQ → K7RX-M2PQ, as hosts type it. */
export function formatCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

/** Which environment this app talks to, named for the admin (Production in red). */
export function environmentName(hostname: string): "Local" | "Staging" | "Production" {
  if (hostname === "localhost" || hostname.startsWith("127.") || hostname === "[::1]") return "Local";
  if (hostname.startsWith("staging.")) return "Staging";
  return "Production";
}

/** 1:30 PM, in this device's time zone. */
export function localTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

/**
 * How long until the next code, measured on the server's clock, or null when it won't rotate
 * on its own any time soon (the local seed sets its rotation years ahead, and setTimeout
 * overflows past about 24.8 days).
 */
export function msUntilRotation(state: HostCodeState): number | null {
  const ms = Date.parse(state.rotatesAt) - Date.parse(state.serverTime);
  return ms > 24 * 60 * 60 * 1000 ? null : Math.max(0, ms);
}
