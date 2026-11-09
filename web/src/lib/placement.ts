/** 1st, 2nd, 3rd, 4th … 11th, 12th, 13th, 21st. */
export function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${n % 10 === 1 ? "st" : n % 10 === 2 ? "nd" : n % 10 === 3 ? "rd" : "th"}`;
}

/** Gold, silver, bronze for the top three places. */
export const PLACE_COLOR: Record<number, string> = { 1: "var(--mantine-color-yellow-4)", 2: "#d5d9e6", 3: "#e0a370" };

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** "Today, 8:14 PM" or "Oct 26, 8:14 PM", for the My games list. */
export function listWhen(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${sameDay(d, now) ? "Today" : d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}, ${time}`;
}

/** "Oct 26, 2026 · 8:14 PM · 41 min", for a game's scoreboard. */
export function detailWhen(startedIso: string, finishedIso?: string | null): string {
  const start = new Date(startedIso);
  const parts = [
    start.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
    start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
  ];
  if (finishedIso) {
    parts.push(`${Math.max(1, Math.round((new Date(finishedIso).getTime() - start.getTime()) / 60000))} min`);
  }
  return parts.join(" · ");
}
