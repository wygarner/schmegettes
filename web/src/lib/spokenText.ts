// Text shown on the TV stays untouched. This module only rewrites the copy sent to Piper so
// punctuation, numbers, and symbols sound the way a host would read them.

const ONES = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
] as const;
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"] as const;
const ORDINAL_ONES: Record<number, string> = {
  1: "first",
  2: "second",
  3: "third",
  4: "fourth",
  5: "fifth",
  6: "sixth",
  7: "seventh",
  8: "eighth",
  9: "ninth",
  10: "tenth",
  11: "eleventh",
  12: "twelfth",
  13: "thirteenth",
  14: "fourteenth",
  15: "fifteenth",
  16: "sixteenth",
  17: "seventeenth",
  18: "eighteenth",
  19: "nineteenth",
};
const ORDINAL_TENS: Record<number, string> = {
  20: "twentieth",
  30: "thirtieth",
  40: "fortieth",
  50: "fiftieth",
  60: "sixtieth",
  70: "seventieth",
  80: "eightieth",
  90: "ninetieth",
};

function cardinal(n: number): string {
  if (n < 20) return ONES[n] ?? String(n);
  if (n < 100) {
    const ten = TENS[Math.floor(n / 10)] ?? "";
    const one = n % 10;
    return one ? `${ten}-${ONES[one]}` : ten;
  }
  if (n < 1000) {
    const rest = n % 100;
    return `${ONES[Math.floor(n / 100)]} hundred${rest ? ` ${cardinal(rest)}` : ""}`;
  }
  if (n < 1_000_000) {
    const rest = n % 1000;
    return `${cardinal(Math.floor(n / 1000))} thousand${rest ? ` ${cardinal(rest)}` : ""}`;
  }
  return String(n);
}

function ordinal(n: number): string {
  if (ORDINAL_ONES[n]) return ORDINAL_ONES[n];
  if (ORDINAL_TENS[n]) return ORDINAL_TENS[n];
  if (n < 100) return `${TENS[Math.floor(n / 10)]}-${ORDINAL_ONES[n % 10]}`;
  if (n % 100 === 0) return `${cardinal(n / 100)} hundredth`;
  return `${cardinal(n - (n % 100))} ${ordinal(n % 100)}`;
}

function blanks(text: string): string {
  return text.replace(/_{2,}/g, "blank");
}

function fractionWords(numerator: number, denominator: number): string {
  if (denominator === 2) return numerator === 1 ? "one half" : `${cardinal(numerator)} halves`;
  if (denominator === 4) return numerator === 1 ? "one quarter" : `${cardinal(numerator)} quarters`;
  const unit = ordinal(denominator);
  return `${cardinal(numerator)} ${unit}${numerator === 1 ? "" : "s"}`;
}

function fractions(text: string): string {
  let out = text.replace(/\b24\/7\b/g, "twenty-four seven");
  out = out.replace(/\b(\d+)\s+(\d{1,2})\/(\d{1,2})\b/g, (match, whole, numerator, denominator) => {
    const a = Number(numerator);
    const b = Number(denominator);
    if (a > 16 || b > 16 || b < 2) return match;
    const part = a === 1 && b === 2 ? "a half" : a === 1 && b === 4 ? "a quarter" : fractionWords(a, b);
    return `${cardinal(Number(whole))} and ${part}`;
  });
  return out.replace(/\b(\d{1,2})\/(\d{1,2})\b/g, (match, numerator, denominator) => {
    const a = Number(numerator);
    const b = Number(denominator);
    return a <= 16 && b <= 16 && b >= 2 ? fractionWords(a, b) : match;
  });
}

function wordSlashes(text: string): string {
  return text.replace(/\b([A-Za-z]+)\/([A-Za-z]+)\b/g, "$1, $2");
}

function dashes(text: string): string {
  return text.replace(/\s*(?:—|–|--)\s*|\s+-\s+/g, ", ");
}

function ellipses(text: string): string {
  return text.replace(/(?:\.{3,}|…)(?=\s*$)/g, ".").replace(/(?:\.{3,}|…)/g, ", ");
}

function decimalCardinal(raw: string): string {
  const clean = raw.replace(/,/g, "");
  const [whole = "0", decimal] = clean.split(".");
  const spokenWhole = cardinal(Number(whole));
  return decimal ? `${spokenWhole} point ${[...decimal].map((digit) => ONES[Number(digit)]).join(" ")}` : spokenWhole;
}

function money(text: string): string {
  return text.replace(
    /\$\s*(\d[\d,]*(?:\.\d+)?)(?:\s+(thousand|million|billion|trillion))?/gi,
    (_match, amount, scale) => `${decimalCardinal(amount)}${scale ? ` ${String(scale).toLowerCase()}` : ""} dollars`,
  );
}

function numberedLabels(text: string): string {
  return text.replace(/#\s*(\d+)/g, "number $1").replace(/\bNo\.\s*(\d+)/gi, "number $1");
}

function abbreviations(text: string): string {
  return text.replace(/\bvs\./gi, "versus").replace(/\bMt\./g, "Mount");
}

const COUNT_WORDS = new Set([
  "people",
  "persons",
  "miles",
  "feet",
  "inches",
  "pounds",
  "years",
  "times",
  "copies",
  "votes",
  "points",
  "dollars",
  "percent",
  "items",
  "soldiers",
  "men",
  "women",
  "residents",
  "acres",
]);

function yearWords(year: number): string {
  if (year >= 2000 && year <= 2009) return year === 2000 ? "two thousand" : `two thousand ${cardinal(year - 2000)}`;
  const first = Math.floor(year / 100);
  const last = year % 100;
  if (last === 0) return `${cardinal(first)} hundred`;
  if (last < 10) return `${cardinal(first)} oh ${cardinal(last)}`;
  return `${cardinal(first)} ${cardinal(last)}`;
}

function yearsAndDecades(text: string): string {
  let out = text.replace(/\b(1\d{3}|20\d{2})s\b/g, (_match, raw) => {
    const year = Number(raw);
    const last = year % 100;
    if (last === 0) return `${cardinal(Math.floor(year / 100))} hundreds`;
    if (last % 10 === 0) return `${cardinal(Math.floor(year / 100))} ${cardinal(last).replace(/y$/, "ies")}`;
    return `${yearWords(year)}s`;
  });
  out = out.replace(/(?:'|’)?\b(\d{2})s\b/g, (_match, raw) => {
    const n = Number(raw);
    return n % 10 === 0 ? cardinal(n).replace(/y$/, "ies") : `${cardinal(n)}s`;
  });
  return out.replace(/\b(1\d{3}|20\d{2})\b/g, (match, raw, offset: number, source: string) => {
    const before = source.slice(0, offset);
    if (before.endsWith("$") || /\d,\d*$/.test(before)) return match;
    const after = source.slice(offset + match.length);
    if (/^\s*%/.test(after)) return match;
    const next = after.match(/^\s+([A-Za-z]+)/)?.[1]?.toLowerCase();
    if (next && COUNT_WORDS.has(next)) return match;
    return yearWords(Number(raw));
  });
}

const NUMBERED_THINGS = new Set(
  "War Bowl Part Chapter Act Scene Book Volume Episode Phase Title Apollo Rocky Saw Jaws Psalm Grade Level Stage Section Article Class Type Vatican Gemini Mercury"
    .toLowerCase()
    .split(" "),
);
const REGNAL_NAMES = new Set(
  "Henry Edward George William Richard Charles James John Elizabeth Mary Louis Philip Frederick Ferdinand Peter Catherine Alexander Nicholas Napoleon Pius Leo Gregory Benedict Innocent Clement Paul Ramses Amenhotep Thutmose Henri Carlos Juan Gustav Victor Emmanuel Wilhelm Otto Constantine Justinian"
    .toLowerCase()
    .split(" "),
);
const ROMAN_EXCLUSIONS = new Set(["DC", "CD", "DVD", "MIX", "CIVIL", "MD", "LCD"]);
const ROMAN_PATTERN = /^M{0,2}(?:CM|CD|D?C{0,3})(?:XC|XL|L?X{0,3})(?:IX|IV|V?I{0,3})$/;

function romanValue(roman: string): number {
  const values: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
  let total = 0;
  for (let i = 0; i < roman.length; i++) {
    const value = values[roman[i] ?? ""] ?? 0;
    const next = values[roman[i + 1] ?? ""] ?? 0;
    total += value < next ? -value : value;
  }
  return total;
}

function romanNumerals(text: string): string {
  return text.replace(/\b[IVXLCDM]+\b/g, (token, offset: number, source: string) => {
    if (!ROMAN_PATTERN.test(token) || ROMAN_EXCLUSIONS.has(token)) return token;
    const previous = source.slice(0, offset).match(/([A-Za-z]+)\W*$/)?.[1];
    if (!previous) return token;
    const context = previous.toLowerCase();
    const value = romanValue(token);
    if (value > 2030) return token;
    if (token.length === 1) {
      if (context === "war" && token === "I") return "One";
      return REGNAL_NAMES.has(context) ? `the ${ordinal(value)}` : token;
    }
    if (NUMBERED_THINGS.has(context)) return cardinal(value);
    return /^[A-Z][A-Za-z'-]*$/.test(previous) ? `the ${ordinal(value)}` : token;
  });
}

function ampersands(text: string): string {
  return text.replace(/\s*&(?:amp;)?\s*/gi, " and ");
}

function parentheses(text: string): string {
  return text
    .replace(/\(\s*/g, ", ")
    .replace(/\s*\)(?=[.,;:!?])/g, "")
    .replace(/\s*\)/g, ",");
}

function cleanUp(text: string): string {
  return text
    .replace(/[\\*~^|<>]/g, " ")
    .replace(/[\p{Extended_Pictographic}\p{So}\p{Sk}]/gu, " ")
    .replace(/(?:\s*,){2,}/g, ",")
    .replace(/,\s*,+/g, ",")
    .replace(/[ \t]+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
}

/** Rewrites a displayed line into the words and pauses Piper should speak. */
export function spokenText(text: string): string {
  let spoken = blanks(text);
  spoken = fractions(spoken);
  spoken = wordSlashes(spoken);
  spoken = dashes(spoken);
  spoken = ellipses(spoken);
  spoken = money(spoken);
  spoken = numberedLabels(spoken);
  spoken = abbreviations(spoken);
  spoken = yearsAndDecades(spoken);
  spoken = romanNumerals(spoken);
  spoken = ampersands(spoken);
  spoken = parentheses(spoken);
  return cleanUp(spoken);
}
