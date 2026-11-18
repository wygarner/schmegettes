import type { AdminHost } from "./client";

/** K7RXM2PQ → K7RX-M2PQ, as the host types it. */
export function formatCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

/** 13:30 UTC */
export function utcTime(iso: string): string {
  return `${new Date(iso).toISOString().slice(11, 16)} UTC`;
}

/** Nov 12 */
export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/** "31 min", or "under a minute". `msLeft` is measured on the server's clock. */
export function timeLeft(msLeft: number): string {
  if (msLeft < 60_000) return "under a minute";
  return `${Math.floor(msLeft / 60_000)} min`;
}

/** Locally the seeded code never rotates on its own: its rotation is set years ahead. */
export function rotatesOnItsOwn(rotatesAt: string, serverTime: string): boolean {
  return Date.parse(rotatesAt) - Date.parse(serverTime) < 24 * 60 * 60 * 1000;
}

/** sam@example.com, or Guest · "Priya" */
export function hostLabel(host: AdminHost): string {
  if (host.kind === "account") return host.email ?? "Account";
  return host.lastPlayedAs ? `Guest · "${host.lastPlayedAs}"` : "Guest";
}

// setTimeout overflows above 2^31 - 1 ms (about 24.8 days) and would fire at once.
export const maxTimerMs = 2_147_483_647;
