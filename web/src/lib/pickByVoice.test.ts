import { describe, expect, test } from "vitest";
import { matchPick, spokenValue } from "./pickByVoice";
import type { BoardClue } from "./room";

const clue = (clueId: string, category: string, value: number, state: BoardClue["state"] = "unplayed"): BoardClue => ({
  clueId,
  category,
  value,
  state,
});
const board = [
  clue("s2", "SCIENCE", 200),
  clue("s4", "SCIENCE", 400, "answered"),
  clue("r2", "RHYME TIME", 200),
  clue("r10", "RHYME TIME", 1000),
  clue("o2", "WORLD CAPITALS", 200),
  clue("o4", "WORLD CAPITALS", 400),
  clue("p4", "POTENT POTABLES", 400),
];

test.each([
  ["Science for 200", "s2"],
  ["I'll take science for $200", "s2"],
  ["rhyme time for 1000", "r10"],
  ["rhyme time for 1,000", "r10"],
  ["rhymetime a thousand", "r10"],
  ["world capitals four hundred", "o4"],
  ["capitals for 200", "o2"], // part of the name
  ["potent potables 400", "p4"],
  ["sciense for two hundred", "s2"], // a transcription slip
  ["potent potables", "p4"], // only one clue left in it
])("%s → %s", (said, id) => {
  expect(matchPick(said, board)).toEqual({ clueId: id });
});

test("problems", () => {
  expect(matchPick("opera for 200", board)).toEqual({ problem: "no-category" });
  expect(matchPick("world capitals", board)).toEqual({ problem: "no-value" });
  expect(matchPick("science for 800", board)).toEqual({ problem: "no-value" });
  expect(matchPick("science for 400", board)).toEqual({ problem: "taken" });
});

describe("Quick picks: just the category picks the lowest clue left", () => {
  const quick = { quickPicks: true };
  const opera = [
    clue("op2", "OPERA", 200, "answered"),
    clue("op4", "OPERA", 400),
    clue("op6", "OPERA", 600),
    clue("op8", "OPERA", 800),
  ];
  test("the lowest one left", () => {
    expect(matchPick("opera", opera, quick)).toEqual({ clueId: "op4" });
    expect(matchPick("world capitals", board, quick)).toEqual({ clueId: "o2" });
  });
  test("on a Double board, whatever its values", () => {
    const double = [clue("d8", "OPERA", 800), clue("d16", "OPERA", 1600), clue("d12", "OPERA", 1200)];
    expect(matchPick("I'll take opera", double, quick)).toEqual({ clueId: "d8" });
  });
  test("the lowest left may be the Daily Double: it's picked like any other", () => {
    // Phones can't tell a Daily Double from the board; it's just the lowest unplayed clue.
    expect(matchPick("opera", [clue("dd4", "OPERA", 400), clue("op6", "OPERA", 600)], quick)).toEqual({
      clueId: "dd4",
    });
  });
  test("nothing left in the category: already played", () => {
    expect(matchPick("science", [clue("s2", "SCIENCE", 200, "answered")], quick)).toEqual({ problem: "taken" });
  });
  test("an amount that was heard always wins, and never falls back", () => {
    expect(matchPick("opera for 600", opera, quick)).toEqual({ clueId: "op6" });
    expect(matchPick("opera for 200", opera, quick)).toEqual({ problem: "taken" });
    expect(matchPick("opera for 1000", opera, quick)).toEqual({ problem: "no-value" });
  });
  test("off: unchanged", () => {
    expect(matchPick("opera", opera)).toEqual({ problem: "no-value" });
    expect(matchPick("opera", opera, { quickPicks: false })).toEqual({ problem: "no-value" });
  });
});

test("spoken values", () => {
  expect(spokenValue("for $1,600")).toBe(1600);
  expect(spokenValue("two thousand")).toBe(2000);
  expect(spokenValue("eight hundred")).toBe(800);
  expect(spokenValue("science")).toBeNull();
});
