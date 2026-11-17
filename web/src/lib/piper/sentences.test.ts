import { expect, test } from "vitest";
import { splitSentences } from "./sentences";

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
