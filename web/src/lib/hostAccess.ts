import { api } from "./api";

/** Host codes use the room-code alphabet: no look-alikes (0 O 1 I L). */
const NOT_IN_ALPHABET = /[^23456789ABCDEFGHJKMNPQRSTUVWXYZ]/g;
export const HOST_CODE_LENGTH = 8;

/** As typed: upper case, only code characters, a dash after 4 ("k7rx m2" → "K7RX-M2"). */
export function formatHostCode(input: string): string {
  const raw = input.toUpperCase().replace(NOT_IN_ALPHABET, "").slice(0, HOST_CODE_LENGTH);
  return raw.length > 4 ? `${raw.slice(0, 4)}-${raw.slice(4)}` : raw;
}

export function isCompleteHostCode(formatted: string): boolean {
  return formatted.replace("-", "").length === HOST_CODE_LENGTH;
}

/** Whether this device can host; null when the api couldn't be reached. */
export async function getHostAccess(): Promise<boolean | null> {
  try {
    const { data } = await api.GET("/v1/host-access");
    return data ? data.canHost : null;
  } catch {
    return null;
  }
}

export type RedeemResult =
  | { kind: "ok" }
  | { kind: "invalid" }
  | { kind: "rate-limited"; retryAfterSeconds: number }
  | { kind: "error" };

export async function redeemHostCode(code: string): Promise<RedeemResult> {
  try {
    const { data, response } = await api.POST("/v1/host-access/redeem", { body: { code } });
    if (data?.canHost) return { kind: "ok" };
    if (response.status === 400) return { kind: "invalid" };
    if (response.status === 429) {
      const seconds = Number(response.headers.get("Retry-After"));
      return { kind: "rate-limited", retryAfterSeconds: seconds > 0 ? seconds : 60 };
    }
    return { kind: "error" };
  } catch {
    return { kind: "error" };
  }
}
