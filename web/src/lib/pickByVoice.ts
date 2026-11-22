import type { BoardClue } from "./room";

// Picking a clue by voice is relative to the open board: "tennis" is enough when only one
// category contains it, while "history" is ambiguous when two open categories do.

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
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};

const ORDINAL_WORDS: Record<string, number> = {
  first: 1,
  second: 2,
  third: 3,
  fourth: 4,
  fifth: 5,
  sixth: 6,
  seventh: 7,
  eighth: 8,
  ninth: 9,
  tenth: 10,
  eleventh: 11,
  twelfth: 12,
  thirteenth: 13,
  fourteenth: 14,
  fifteenth: 15,
  sixteenth: 16,
  seventeenth: 17,
  eighteenth: 18,
  nineteenth: 19,
  twentieth: 20,
  thirtieth: 30,
  fortieth: 40,
  fiftieth: 50,
  sixtieth: 60,
  seventieth: 70,
  eightieth: 80,
  ninetieth: 90,
};

const DECADES: Record<string, string> = {
  twenties: "20s",
  thirties: "30s",
  forties: "40s",
  fifties: "50s",
  sixties: "60s",
  seventies: "70s",
  eighties: "80s",
  nineties: "90s",
};

const ROMAN: Record<string, number> = {
  ii: 2,
  iii: 3,
  iv: 4,
  v: 5,
  vi: 6,
  vii: 7,
  viii: 8,
  ix: 9,
  x: 10,
  xi: 11,
  xii: 12,
  xiii: 13,
  xiv: 14,
  xv: 15,
  xvi: 16,
  xvii: 17,
  xviii: 18,
  xix: 19,
  xx: 20,
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
  "give",
  "me",
  "please",
  "for",
  "the",
  "a",
  "an",
  "dollars",
  "dollar",
  "bucks",
  "and",
  "hundred",
  "hundreds",
  "thousand",
]);

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

function canonicalToken(token: string, category: boolean): string {
  const lower = token.toLowerCase();
  if (DECADES[lower]) return DECADES[lower] ?? lower;
  const decade = lower.match(/^(?:19)?(\d0)s$/)?.[1];
  if (decade) return `${decade}s`;
  const ordinalDigits = lower.match(/^(\d+)(?:st|nd|rd|th)$/)?.[1];
  if (ordinalDigits) return String(Number(ordinalDigits));
  if (ORDINAL_WORDS[lower]) return String(ORDINAL_WORDS[lower]);
  if (NUMBER_WORDS[lower]) return String(NUMBER_WORDS[lower]);
  if (category && ROMAN[lower]) return String(ROMAN[lower]);
  return lower;
}

function normalizedVariants(input: string, category = false): string[][] {
  const clean = input
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\b(?:[a-z]\.){2,}/g, (abbr) => abbr.replaceAll(".", ""))
    .replace(/[$,]/g, "")
    .replace(/[‘’“”".]/g, "")
    .replace(/[^a-z0-9'\s]/g, " ")
    .replace(/(^|\s)'(?=\d)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  const base = clean
    .split(" ")
    .filter(Boolean)
    .map((word) => canonicalToken(word, category));
  if (!base.includes("st")) return [base];
  return [base.map((word) => (word === "st" ? "saint" : word)), base.map((word) => (word === "st" ? "street" : word))];
}

const contentWords = (variant: string[]) =>
  variant.filter((word) => word && !FILLER.has(word) && !/^\d{3,5}$/.test(word));

function similarity(spoken: string, target: string): number {
  if (spoken === target) return 1;
  if (target.length < 4) return 0;
  const distance = levenshtein(spoken, target);
  return distance <= Math.floor(target.length / 4) ? 1 - distance / Math.max(spoken.length, target.length) : 0;
}

interface CategoryResult {
  category: string;
  score: number;
  exact: boolean;
  matched: Map<string, number>;
}

function scoreCategory(
  spoken: string[],
  target: string[],
  frequencies: Map<string, number>,
): Omit<CategoryResult, "category"> {
  const spokenPhrase = spoken.join("");
  const targetPhrase = target.join("");
  const exact = targetPhrase.length > 0 && spokenPhrase === targetPhrase;
  const phrase =
    targetPhrase.length > 0 && spokenPhrase.includes(targetPhrase)
      ? 1
      : 1 - levenshtein(spokenPhrase, targetPhrase) / Math.max(spokenPhrase.length, targetPhrase.length, 1);

  const matched = new Map<string, number>();
  let earned = 0;
  let possible = 0;
  for (const word of spoken) {
    let best = 0;
    let rarity = 1;
    for (const targetWord of target) {
      const next = similarity(word, targetWord);
      if (next > best) {
        best = next;
        rarity = 1 / (frequencies.get(targetWord) ?? 1);
      }
    }
    possible += rarity;
    if (best > 0) {
      earned += best * rarity;
      matched.set(word, best);
    }
  }
  const wordScore = possible > 0 ? earned / possible : 0;
  return { score: Math.max(wordScore, phrase >= 0.75 ? phrase : 0), exact, matched };
}

function categoryResults(spokenText: string, categories: string[]): CategoryResult[] {
  const spokenVariants = normalizedVariants(spokenText).map(contentWords);
  const targets = new Map(
    categories.map((category) => [category, normalizedVariants(category, true).map(contentWords)]),
  );
  const frequencies = new Map<string, number>();
  for (const variants of targets.values()) {
    const present = new Set(variants.flat());
    for (const word of present) frequencies.set(word, (frequencies.get(word) ?? 0) + 1);
  }

  return categories
    .map((category) => {
      let best: CategoryResult = { category, score: 0, exact: false, matched: new Map() };
      for (const spoken of spokenVariants) {
        for (const target of targets.get(category) ?? []) {
          const result = scoreCategory(spoken, target, frequencies);
          if (result.score > best.score || result.exact) best = { category, ...result };
        }
      }
      return best;
    })
    .sort((a, b) => b.score - a.score);
}

interface AmountMention {
  index: number;
  value: number;
}

/** The last amount heard, interpreted only against values that exist on this board. */
export function spokenValue(text: string, values: number[]): number | null {
  const boardValues = new Set(values);
  const mentions: AmountMention[] = [];

  for (const match of text.matchAll(/\b\d[\d,]*(?::00)?\b/g)) {
    const raw = match[0].replaceAll(",", "");
    const time = raw.match(/^(\d+):00$/)?.[1];
    const digits = time ? Number(time) * 100 : Number(raw);
    let value = digits;
    if (!time && !boardValues.has(value) && raw.startsWith("4")) {
      const joined = Number(raw.slice(1));
      if (boardValues.has(joined)) value = joined;
    }
    if (time || raw.length >= 3) mentions.push({ index: match.index, value });
  }

  const tokens = [...text.toLowerCase().matchAll(/\b(?:[a-z]+|\d+)\b/g)];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const next = tokens[i + 1]?.[0];
    if (!token || (next !== "hundred" && next !== "hundreds" && next !== "thousand")) continue;
    const amount = NUMBER_WORDS[token[0]] ?? Number(token[0]);
    if (!Number.isFinite(amount)) continue;
    mentions.push({ index: token.index, value: amount * (next === "thousand" ? 1000 : 100) });
  }

  mentions.sort((a, b) => a.index - b.index);
  return mentions.at(-1)?.value ?? null;
}

export type VoicePick = { clueId: string } | { problem: "no-category" | "ambiguous" | "no-value" | "taken" };

const CLEAR_MARGIN = 0.15;

/** Matches what a player said to an open clue on the board. */
export function matchPick(text: string, board: BoardClue[], opts: { quickPicks?: boolean } = {}): VoicePick {
  const categories = [...new Set(board.filter((clue) => clue.state === "unplayed").map((clue) => clue.category))];
  const results = categoryResults(text, categories);
  const best = results[0];
  const runner = results[1];
  if (!best || best.score === 0) return { problem: "no-category" };

  if (!best.exact) {
    const distinctive = [...best.matched].some(([word, score]) => score > (runner?.matched.get(word) ?? 0));
    if (!distinctive || (runner && best.score - runner.score < CLEAR_MARGIN)) return { problem: "ambiguous" };
  }

  const inCategory = board.filter((clue) => clue.category === best.category);
  const values = [...new Set(board.map((clue) => clue.value))];
  const value = spokenValue(text, values);
  if (value === null) {
    const open = inCategory.filter((clue) => clue.state === "unplayed");
    if (opts.quickPicks) {
      const lowest = open.reduce<BoardClue | undefined>(
        (low, clue) => (!low || clue.value < low.value ? clue : low),
        undefined,
      );
      return lowest ? { clueId: lowest.clueId } : { problem: "taken" };
    }
    return open.length === 1 && open[0] ? { clueId: open[0].clueId } : { problem: "no-value" };
  }
  const clue = inCategory.find((candidate) => candidate.value === value);
  if (!clue) return { problem: "no-value" };
  if (clue.state !== "unplayed") return { problem: "taken" };
  return { clueId: clue.clueId };
}

/** Tries recognizer hearings in order, but preserves the top hearing's failure for the UI/log. */
export function matchPickAny(hearings: string[], board: BoardClue[], opts: { quickPicks?: boolean } = {}): VoicePick {
  const first = matchPick(hearings[0] ?? "", board, opts);
  if ("clueId" in first) return first;
  for (const hearing of hearings.slice(1)) {
    const result = matchPick(hearing, board, opts);
    if ("clueId" in result) return result;
  }
  return first;
}
