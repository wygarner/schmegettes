import { describe, expect, test } from "vitest";
import { matchPick, matchPickAny, spokenValue } from "./pickByVoice";
import type { BoardClue } from "./room";

const clue = (clueId: string, category: string, value: number, state: BoardClue["state"] = "unplayed"): BoardClue => ({
  clueId,
  category,
  value,
  state,
});

const categories = [
  "SCIENCE",
  "U.S. PRESIDENTS",
  "'80S MUSIC",
  "4-LETTER WORDS",
  "BEFORE & AFTER",
  "THE BIBLE",
  "WORLD CAPITALS",
  "POTENT POTABLES",
  "& THE BEST SUPPORTING ACTOR OSCAR GOES TO...",
  "SOUNDS LIKE TENNIS",
  "THE 20TH CENTURY",
  "WORLD WAR II",
  "ST. LOUIS BLUES",
  '"P" IN THE U.S.A.',
];
const board = categories.flatMap((category, column) =>
  [200, 400, 600, 800, 1000].map((value) => clue(`${column}-${value}`, category, value)),
);
const id = (category: string, value: number) => `${categories.indexOf(category)}-${value}`;

test.each([
  ["tennis for 200", "SOUNDS LIKE TENNIS", 200],
  ["supporting actor for 400", "& THE BEST SUPPORTING ACTOR OSCAR GOES TO...", 400],
  ["Oscar for 400", "& THE BEST SUPPORTING ACTOR OSCAR GOES TO...", 400],
  ["capitals for one thousand", "WORLD CAPITALS", 1000],
  ["twentieth century for 800", "THE 20TH CENTURY", 800],
  ["eighties music for 600", "'80S MUSIC", 600],
  ["Science 4400", "SCIENCE", 400],
  ["Science for 4:00", "SCIENCE", 400],
  ["science for 4 hundred", "SCIENCE", 400],
  ["Science for 400", "SCIENCE", 400],
  ["science for $400", "SCIENCE", 400],
  ["sciences for 400", "SCIENCE", 400],
  ["U.S. presidents for $200", "U.S. PRESIDENTS", 200],
  ["presidents for 200", "U.S. PRESIDENTS", 200],
  ["4 letter words for 800", "4-LETTER WORDS", 800],
  ["before and after for 200", "BEFORE & AFTER", 200],
  ["St. Louis Blues for 400", "ST. LOUIS BLUES", 400],
  ["Saint Louis Blues for 400", "ST. LOUIS BLUES", 400],
  ["P in the USA for 600", '"P" IN THE U.S.A.', 600],
  ["World War 2 for 800", "WORLD WAR II", 800],
  ["World War two for 800", "WORLD WAR II", 800],
])("%s picks %s for %s", (said, category, value) => {
  expect(matchPick(said, board)).toEqual({ clueId: id(category, value) });
});

test("ties fail until a competing category is cleared", () => {
  const american = clue("american", "AMERICAN HISTORY", 200);
  const art = clue("art", "HISTORY OF ART", 200);
  const history = [american, art];
  expect(matchPick("history for 200", history)).toEqual({ problem: "ambiguous" });
  expect(matchPick("history for 200", [{ ...american, state: "answered" }, art])).toEqual({
    clueId: "art",
  });
});

test("other hearings are tried in order, while total failure keeps the top problem", () => {
  expect(matchPickAny(["signs for 400", "science for 400"], board)).toEqual({ clueId: id("SCIENCE", 400) });
  expect(matchPickAny(["opera for 400", "still opera"], board)).toEqual({ problem: "no-category" });
});

test("the last amount wins", () => {
  expect(matchPick("science for 400, no, 600", board)).toEqual({ clueId: id("SCIENCE", 600) });
});

test("amount problems remain conservative", () => {
  const played = board.map((entry) =>
    entry.category === "SCIENCE" && entry.value === 400 ? { ...entry, state: "answered" as const } : entry,
  );
  expect(matchPick("science for 400", played)).toEqual({ problem: "taken" });
  expect(matchPick("science for 1400", board)).toEqual({ problem: "no-value" });
  expect(matchPick("science", board)).toEqual({ problem: "no-value" });
});

describe("Quick picks", () => {
  const opera = [clue("op2", "OPERA", 200, "answered"), clue("op4", "OPERA", 400), clue("op6", "OPERA", 600)];
  test("no amount picks the lowest open clue", () => {
    expect(matchPick("opera", opera, { quickPicks: true })).toEqual({ clueId: "op4" });
  });
  test("an amount that was heard never falls back", () => {
    expect(matchPick("opera for 200", opera, { quickPicks: true })).toEqual({ problem: "taken" });
    expect(matchPick("opera for 1000", opera, { quickPicks: true })).toEqual({ problem: "no-value" });
  });
  test("off is unchanged", () => {
    expect(matchPick("opera", opera)).toEqual({ problem: "no-value" });
  });
});

test("spoken values are board-aware and accept recognizer forms", () => {
  const values = [200, 400, 600, 800, 1000, 1400, 2000];
  expect(spokenValue("for $1,000", values)).toBe(1000);
  expect(spokenValue("41000", values)).toBe(1000);
  expect(spokenValue("10:00", values)).toBe(1000);
  expect(spokenValue("two thousand", values)).toBe(2000);
  expect(spokenValue("fourteen hundred", values)).toBe(1400);
  expect(spokenValue("four hundreds", values)).toBe(400);
  expect(spokenValue("science", values)).toBeNull();
});
