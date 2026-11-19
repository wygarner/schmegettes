// The lobby's game options: seasons, timer pace, Double Schmegettes. The host device keeps the
// last ones for its next room. Rules: docs/product-docs/features/lobby/feature-brief.md,
// "Game options".

import type { ApiComponents } from "@schmegettes/shared";

export type TimerPace = ApiComponents["schemas"]["Room"]["timers"];

export interface GameOptions {
  /** First and last season, inclusive; null is every season. */
  seasons: [number, number] | null;
  timers: TimerPace;
  doubleRound: boolean;
}

export const FIRST_SEASON = 1;
export const LAST_SEASON = 40;

export const DEFAULT_OPTIONS: GameOptions = { seasons: null, timers: "standard", doubleRound: true };

export const PACES: Record<TimerPace, { label: string; buzz: number; answer: number }> = {
  relaxed: { label: "Relaxed", buzz: 15, answer: 12 },
  standard: { label: "Standard", buzz: 9, answer: 9 },
  fast: { label: "Fast", buzz: 5, answer: 7 },
};

/** The room's options as the API returns them (seasons as a list). */
export function fromRoom(room: { seasons: number[] | null; timers: TimerPace; doubleRound: boolean }): GameOptions {
  const s = room.seasons;
  const seasons: [number, number] | null =
    s && s.length > 0 && !(Math.min(...s) === FIRST_SEASON && Math.max(...s) === LAST_SEASON)
      ? [Math.min(...s), Math.max(...s)]
      : null;
  return { seasons, timers: room.timers, doubleRound: room.doubleRound };
}

/** Every season in the range, as the API takes them; null for all. */
export function seasonList(range: [number, number] | null): number[] | null {
  if (!range) return null;
  const [a, b] = range;
  return Array.from({ length: b - a + 1 }, (_, i) => a + i);
}

export function isDefault(o: GameOptions): boolean {
  return o.seasons === null && o.timers === "standard" && o.doubleRound;
}

/** The line under the room code: only what isn't the default ("" with the defaults). */
export function summary(o: GameOptions): string {
  const parts: string[] = [];
  if (o.seasons)
    parts.push(o.seasons[0] === o.seasons[1] ? `Season ${o.seasons[0]}` : `Seasons ${o.seasons[0]}–${o.seasons[1]}`);
  if (o.timers !== "standard") parts.push(`${PACES[o.timers].label} timers`);
  if (!o.doubleRound) parts.push("No Double Schmegettes");
  return parts.join(" · ");
}

// Kept on this device. Storage can be missing or blocked, so every access is guarded.
const KEY = "schmegettes.gameOptions";

export function savedOptions(): GameOptions {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT_OPTIONS;
    const o = JSON.parse(raw) as Partial<GameOptions>;
    const seasons =
      Array.isArray(o.seasons) &&
      o.seasons.length === 2 &&
      o.seasons.every((n) => Number.isInteger(n) && n >= FIRST_SEASON && n <= LAST_SEASON) &&
      o.seasons[0] <= o.seasons[1]
        ? ([o.seasons[0], o.seasons[1]] as [number, number])
        : null;
    const timers = o.timers && o.timers in PACES ? o.timers : "standard";
    return { seasons, timers, doubleRound: o.doubleRound !== false };
  } catch {
    return DEFAULT_OPTIONS;
  }
}

export function saveOptions(o: GameOptions): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(o));
  } catch {
    // Not remembered: the next room starts with the defaults.
  }
}
