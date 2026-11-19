import { afterEach, describe, expect, test, vi } from "vitest";
import {
  type RecognitionResultList,
  type Recognizer,
  requestAnswerPermissions,
  setRecognizerFactory,
  transcripts,
} from "./speech";

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

describe("requestAnswerPermissions", () => {
  const fake = () => {
    const r: Recognizer & { aborted: number } = {
      aborted: 0,
      start: vi.fn(),
      stop: vi.fn(),
      abort() {
        this.aborted++;
      },
    };
    setRecognizerFactory(() => r);
    return r;
  };
  afterEach(() => setRecognizerFactory(null));

  test("granted once the browser starts listening, which stops at once", async () => {
    const r = fake();
    const done = requestAnswerPermissions();
    expect(r.start).toHaveBeenCalled();
    r.onStart?.();
    await expect(done).resolves.toBe("granted");
    expect(r.aborted).toBe(1);
  });

  test("denied when the browser refuses (microphone or speech recognition)", async () => {
    const r = fake();
    const done = requestAnswerPermissions();
    r.onDenied?.();
    await expect(done).resolves.toBe("denied");
  });

  test("denied when it can't even start", async () => {
    const r = fake();
    vi.mocked(r.start).mockImplementation(() => {
      throw new Error("not allowed");
    });
    await expect(requestAnswerPermissions()).resolves.toBe("denied");
  });

  test("unsupported without speech recognition", async () => {
    setRecognizerFactory(() => null);
    await expect(requestAnswerPermissions()).resolves.toBe("unsupported");
  });
});
