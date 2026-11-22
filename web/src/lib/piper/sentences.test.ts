import { expect, test } from "vitest";
import { narrationChunks, splitSentences } from "./sentences";

test("splitSentences preserves announcements, initials, and titles", () => {
  expect(splitSentences("Here's NAVY for 200. The U.S. Navy was founded in 1775.")).toEqual([
    "Here's NAVY for 200.",
    "The U.S. Navy was founded in 1775.",
  ]);
  expect(splitSentences("Dr. Seuss wrote it. Mt. Fuji is in Japan.")).toEqual([
    "Dr. Seuss wrote it.",
    "Mt. Fuji is in Japan.",
  ]);
  expect(splitSentences('He said "Go." Then he left.')).toEqual(['He said "Go."', "Then he left."]);
  expect(splitSentences("  ")).toEqual([]);
});

test("piece one uses the first punctuation within ten words", () => {
  expect(narrationChunks("One two three four five six seven eight nine ten, eleven twelve.")).toEqual([
    "One two three four five six seven eight nine ten,",
    "eleven twelve.",
  ]);
  expect(narrationChunks("One two three, four five six seven eight nine ten eleven.")).toEqual([
    "One two three,",
    "four five six seven eight nine ten eleven.",
  ]);
});

test("piece one alone may fall back to seven words without punctuation", () => {
  const line = "One two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen";
  expect(narrationChunks(line)).toEqual([
    "One two three four five six seven",
    "eight nine ten eleven twelve thirteen fourteen fifteen",
  ]);
});

test("later pieces grow toward twice the previous piece and cut at the closest clause", () => {
  const line =
    "One two three, four five six seven, eight nine ten eleven twelve, thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty.";
  expect(narrationChunks(line)).toEqual([
    "One two three,",
    "four five six seven,",
    "eight nine ten eleven twelve,",
    "thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty.",
  ]);
});

test("later pieces are never cut without punctuation", () => {
  const words = Array.from({ length: 30 }, (_, i) => `word${i + 1}`);
  const chunks = narrationChunks(words.join(" "));
  expect(chunks).toEqual([words.slice(0, 7).join(" "), words.slice(7).join(" ")]);
  expect(chunks.join(" ")).toBe(words.join(" "));
});

test("sentence endings remain natural later boundaries", () => {
  expect(narrationChunks("One two three four five. Six seven eight nine. Ten eleven twelve.")).toEqual([
    "One two three four five.",
    "Six seven eight nine.",
    "Ten eleven twelve.",
  ]);
  expect(narrationChunks("   ")).toEqual([]);
});
