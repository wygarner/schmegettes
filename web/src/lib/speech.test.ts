import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { saveVoice, type Voice } from "./narratorVoice";
import { type RecognitionResultList, SPEECH_START_TIMEOUT_MS, speak, transcripts, unlockSpeech } from "./speech";

class FakeUtterance {
  onstart?: () => void;
  onboundary?: () => void;
  onend?: () => void;
  onerror?: () => void;
  volume = 1;
  rate = 1;
  voice: Voice | null = null;
  lang = "";
  constructor(public text: string) {}
}

let spoken: FakeUtterance[];
let cancel: ReturnType<typeof vi.fn>;
let voices: Voice[];
let synth: {
  cancel: ReturnType<typeof vi.fn>;
  speak: (u: FakeUtterance) => void;
  getVoices: () => Voice[];
  speaking: boolean;
  pending: boolean;
};
beforeEach(() => {
  vi.useFakeTimers();
  spoken = [];
  cancel = vi.fn();
  vi.stubGlobal("SpeechSynthesisUtterance", FakeUtterance);
  voices = [];
  synth = {
    cancel,
    speak: (u: FakeUtterance) => spoken.push(u),
    getVoices: () => voices,
    speaking: false,
    pending: false,
  };
  Object.defineProperty(window, "speechSynthesis", { configurable: true, value: synth });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

test("speech that ends reports ended", async () => {
  const done = speak("Here's OPERA for 200.");
  spoken[0]?.onstart?.();
  vi.advanceTimersByTime(SPEECH_START_TIMEOUT_MS * 2); // a long clue keeps reading
  spoken[0]?.onend?.();
  await expect(done).resolves.toBe("ended");
});

test("speech the browser silently ignores (iOS before a tap) counts as blocked", async () => {
  const done = speak("Here's OPERA for 200.");
  vi.advanceTimersByTime(SPEECH_START_TIMEOUT_MS);
  await expect(done).resolves.toBe("failed");
  expect(cancel).toHaveBeenCalled();
});

test("an error counts as blocked", async () => {
  const done = speak("x");
  spoken[0]?.onerror?.();
  await expect(done).resolves.toBe("failed");
});

test("the first tap unlocks speech with a silent utterance, once", () => {
  unlockSpeech();
  unlockSpeech();
  expect(spoken).toHaveLength(1);
  expect(spoken[0]?.volume).toBe(0);
});

test("iOS speech that plays without a start event is never cut off or reported blocked", async () => {
  const done = speak("Here's OPERA for 200. This composer wrote it.");
  synth.speaking = true; // Safari is reading, but fired no start event
  vi.advanceTimersByTime(SPEECH_START_TIMEOUT_MS);
  expect(cancel).not.toHaveBeenCalled(); // not cut off
  spoken[0]?.onend?.();
  await expect(done).resolves.toBe("ended");
});

test("a word boundary counts as started", async () => {
  const done = speak("x");
  spoken[0]?.onboundary?.();
  vi.advanceTimersByTime(SPEECH_START_TIMEOUT_MS);
  spoken[0]?.onend?.();
  await expect(done).resolves.toBe("ended");
});

test("only cancels when something is playing or queued", () => {
  void speak("first");
  expect(cancel).not.toHaveBeenCalled();
  synth.speaking = true;
  void speak("second");
  expect(cancel).toHaveBeenCalledTimes(1);
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

const ava: Voice = { name: "Ava", lang: "en-US", voiceURI: "com.apple.voice.premium.en-US.Ava", default: false };
const samantha: Voice = {
  name: "Samantha",
  lang: "en-US",
  voiceURI: "com.apple.voice.compact.en-US.Samantha",
  default: true,
};
const daniel: Voice = {
  name: "Daniel",
  lang: "en-GB",
  voiceURI: "com.apple.voice.compact.en-GB.Daniel",
  default: false,
};
// speak() takes a browser voice; the fakes carry the fields it reads.
const asBrowserVoice = (v: Voice) => v as SpeechSynthesisVoice;

test("with nothing saved, the narrator uses the best installed voice at normal pace", () => {
  voices = [samantha, daniel, ava];
  void speak("x");
  expect(spoken[0]?.voice).toBe(ava);
  expect(spoken[0]?.lang).toBe("en-US");
  expect(spoken[0]?.rate).toBe(1);
});

test("the voice saved on this device wins", () => {
  voices = [samantha, daniel, ava];
  saveVoice(daniel.voiceURI);
  void speak("x");
  expect(spoken[0]?.voice).toBe(daniel);
  expect(spoken[0]?.lang).toBe("en-GB");
});

test("a sample voice passed in wins over the saved one", () => {
  voices = [samantha, daniel, ava];
  saveVoice(daniel.voiceURI);
  void speak("x", asBrowserVoice(samantha));
  expect(spoken[0]?.voice).toBe(samantha);
});

test("with no voices loaded yet, it speaks at once with the browser default", () => {
  void speak("x");
  expect(spoken).toHaveLength(1);
  expect(spoken[0]?.voice).toBeNull();
});
