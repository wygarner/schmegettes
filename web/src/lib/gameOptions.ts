// The lobby's game options: seasons, Double Schmegettes, Quick picks. The host device keeps the
// last ones for its next room. There's no timer option: every game is 9 s to buzz in, 9 s to
// answer. Rules: docs/product-docs/features/lobby/feature-brief.md, "Game options".

export interface GameOptions {
  /** First and last season, inclusive; null is every season. */
  seasons: [number, number] | null;
  doubleRound: boolean;
  /** A spoken pick of just a category picks the lowest clue left in it. */
  quickPicks: boolean;
}

export const FIRST_SEASON = 1;
export const LAST_SEASON = 40;

export const DEFAULT_OPTIONS: GameOptions = { seasons: null, doubleRound: true, quickPicks: false };

/** The room's options as the API returns them (seasons as a list). The room's timer pace is
 * always Standard now and isn't an option. */
export function fromRoom(room: { seasons: number[] | null; doubleRound: boolean; quickPicks: boolean }): GameOptions {
  const s = room.seasons;
  const seasons: [number, number] | null =
    s && s.length > 0 && !(Math.min(...s) === FIRST_SEASON && Math.max(...s) === LAST_SEASON)
      ? [Math.min(...s), Math.max(...s)]
      : null;
  return { seasons, doubleRound: room.doubleRound, quickPicks: room.quickPicks };
}

/** Every season in the range, as the API takes them; null for all. */
export function seasonList(range: [number, number] | null): number[] | null {
  if (!range) return null;
  const [a, b] = range;
  return Array.from({ length: b - a + 1 }, (_, i) => a + i);
}

export function isDefault(o: GameOptions): boolean {
  return o.seasons === null && o.doubleRound && !o.quickPicks;
}

/** The line under the room code: only what isn't the default ("" with the defaults). */
export function summary(o: GameOptions): string {
  const parts: string[] = [];
  if (o.seasons)
    parts.push(o.seasons[0] === o.seasons[1] ? `Season ${o.seasons[0]}` : `Seasons ${o.seasons[0]}–${o.seasons[1]}`);
  if (!o.doubleRound) parts.push("No Double Schmegettes");
  if (o.quickPicks) parts.push("Quick picks");
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
    // Options saved before the timer option was removed may still have "timers": ignored.
    return { seasons, doubleRound: o.doubleRound !== false, quickPicks: o.quickPicks === true };
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
