import { expect, test } from "vitest";
import { MAX_NARRATION_CHUNK_WORDS, narrationChunks, splitSentences } from "./sentences";

test("the announcement and the clue are separate sentences", () => {
  expect(splitSentences("Here's VOLCANOES for 400. This one erupted in 2022. Name it!")).toEqual([
    "Here's VOLCANOES for 400.",
    "This one erupted in 2022.",
    "Name it!",
  ]);
});

test("initials and titles don't end a sentence", () => {
  expect(splitSentences("Here's NAVY for 200. The U.S. Navy was founded in 1775.")).toEqual([
    "Here's NAVY for 200.",
    "The U.S. Navy was founded in 1775.",
  ]);
  expect(splitSentences("Dr. Seuss wrote it. Mt. Fuji is in Japan.")).toEqual([
    "Dr. Seuss wrote it.",
    "Mt. Fuji is in Japan.",
  ]);
});

test("one sentence, quotes, and empty text", () => {
  expect(splitSentences("Just one")).toEqual(["Just one"]);
  expect(splitSentences('He said "Go." Then he left.')).toEqual(['He said "Go."', "Then he left."]);
  expect(splitSentences("  ")).toEqual([]);
});

test("long sentences are bounded without losing or repeating words", () => {
  const line = "One two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen";
  const chunks = narrationChunks(line);
  expect(chunks).toEqual([
    "One two three four five six seven",
    "eight nine ten eleven twelve thirteen fourteen",
    "fifteen",
  ]);
  expect(chunks.every((chunk) => chunk.split(" ").length <= MAX_NARRATION_CHUNK_WORDS)).toBe(true);
  expect(chunks.join(" ")).toBe(line);
});

test("sentence and clause boundaries win over the hard word bound", () => {
  const line = "One two three four five, six seven eight nine. Ten eleven twelve.";
  expect(narrationChunks(line)).toEqual(["One two three four five,", "six seven eight nine.", "Ten eleven twelve."]);
});

test("quotes, numbers, initials, and titles stay lossless", () => {
  const line = 'Dr. King said "Meet the U.S. team at 10:30," before everyone left for Washington.';
  const chunks = narrationChunks(line);
  expect(chunks.join(" ")).toBe(line);
  expect(chunks.every((chunk) => chunk.split(" ").length <= MAX_NARRATION_CHUNK_WORDS)).toBe(true);
  expect(narrationChunks("   ")).toEqual([]);
});
