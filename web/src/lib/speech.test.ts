import { expect, test } from "vitest";
import { announcement, type RecognitionResultList, transcripts } from "./speech";

test("the pick announcement speaks the value as a plain number", () => {
  expect(announcement("VOLCANOES", 400)).toBe("Here's VOLCANOES for 400.");
  expect(announcement("OPERA", 1200)).toBe("Here's OPERA for 1200.");
});

// One recognition result per inner array, its guesses most likely first.
function results(...rs: string[][]): RecognitionResultList {
  return rs.map((guesses) =>
    Object.assign(
      guesses.map((transcript) => ({ transcript })),
      { isFinal: true },
    ),
  );
}

test("transcripts: the best guess, then the others, most likely first", () => {
  expect(transcripts(results(["mona lowa", "mauna loa", "moaner lower"]))).toEqual({
    text: "mona lowa",
    alternatives: ["mauna loa", "moaner lower"],
  });
});

test("transcripts: guesses join across results, using a result's best when it has fewer", () => {
  expect(transcripts(results(["what is ", "what's "], ["sane", "seine"]))).toEqual({
    text: "what is sane",
    alternatives: ["what's seine"],
  });
  expect(transcripts(results(["what is "], ["sane", "seine"])).alternatives).toEqual(["what is seine"]);
});

test("transcripts: drops empty and repeated guesses and keeps at most 4", () => {
  expect(transcripts(results(["paris", "", "paris", "parish", "parish"])).alternatives).toEqual(["parish"]);
  expect(transcripts(results(["a", "b", "c", "d", "e", "f"])).alternatives).toEqual(["b", "c", "d", "e"]);
});

test("transcripts: one guess means no alternatives", () => {
  expect(transcripts(results(["paris"]))).toEqual({ text: "paris", alternatives: [] });
  expect(transcripts(results())).toEqual({ text: "", alternatives: [] });
});
