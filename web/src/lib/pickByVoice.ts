import type { BoardClue } from "./room";

// Picking a clue by voice: "Science for 400", "I'll take Potpourri for $200", "rhyme time
// four hundred". Categories and values are on the phone's board already, so matching
// happens here and the phone sends the same select_clue a tap would.

const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  twelve: 12,
  fifteen: 15,
  sixteen: 16,
  eighteen: 18,
  twenty: 20,
};

const FILLER = new Set([
  "i'll",
  "ill",
  "i",
  "will",
  "take",
  "let's",
  "lets",
  "do",
  "go",
  "with",
  "please",
  "for",
  "the",
  "a",
  "an",
  "dollars",
  "dollar",
  "bucks",
  "and",
]);

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[$,]/g, "")
    .replace(/[^a-z0-9'\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** The value spoken: "400", "1,000", "four hundred", "two thousand", "a thousand". */
export function spokenValue(text: string): number | null {
  const t = normalize(text);
  const digits = t.match(/\b(\d{3,4})\b/);
  if (digits) return Number(digits[1]);
  const words = t.split(" ");
  for (let i = 0; i < words.length; i++) {
    const w = words[i] ?? "";
    const next = words[i + 1];
    const n = NUMBER_WORDS[w] ?? (w === "a" ? 1 : undefined);
    if (n !== undefined && next === "hundred") return n * 100;
    if (n !== undefined && next === "thousand") {
      const rest = words[i + 2] && NUMBER_WORDS[words[i + 2] ?? ""];
      return n * 1000 + (rest && words[i + 3] === "hundred" ? rest * 100 : 0);
    }
  }
  return null;
}

function levenshtein(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0] ?? 0;
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const up = prev[j] ?? 0;
      prev[j] = Math.min(up + 1, (prev[j - 1] ?? 0) + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = up;
    }
  }
  return prev[b.length] ?? 0;
}

const words = (s: string) =>
  normalize(s)
    .split(" ")
    .filter((w) => w && !FILLER.has(w) && !/^\d+$/.test(w));

/** How well the spoken words match a category name, 0..1. */
function categoryScore(spoken: string[], category: string): number {
  const target = words(category);
  if (target.length === 0) return 0;
  let hits = 0;
  for (const t of target) {
    if (spoken.some((s) => s === t || (t.length >= 4 && levenshtein(s, t) <= Math.floor(t.length / 4)))) hits++;
  }
  // Also compare the whole phrase, so "rhyme time" ≈ "rhymetime" and slips still match.
  const joined = spoken.join("");
  const whole = target.join("");
  const phrase =
    whole.length > 0 && joined.includes(whole)
      ? 1
      : 1 - levenshtein(joined, whole) / Math.max(whole.length, joined.length, 1);
  return Math.max(hits / target.length, phrase);
}

export type VoicePick = { clueId: string } | { problem: "no-category" | "no-value" | "taken" };

/** Matches what a player said to an open clue on the board. */
export function matchPick(text: string, board: BoardClue[]): VoicePick {
  const spoken = words(text);
  const categories = [...new Set(board.map((c) => c.category))];
  let best = "";
  let bestScore = 0;
  for (const category of categories) {
    const score = categoryScore(spoken, category);
    if (score > bestScore) {
      best = category;
      bestScore = score;
    }
  }
  if (bestScore < 0.6) return { problem: "no-category" };

  const inCategory = board.filter((c) => c.category === best);
  const value = spokenValue(text);
  if (value === null) {
    // "Science" alone is fine when only one clue is left in it.
    const open = inCategory.filter((c) => c.state === "unplayed");
    return open.length === 1 && open[0] ? { clueId: open[0].clueId } : { problem: "no-value" };
  }
  const clue = inCategory.find((c) => c.value === value);
  if (!clue) return { problem: "no-value" };
  if (clue.state !== "unplayed") return { problem: "taken" };
  return { clueId: clue.clueId };
}
