import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { announcement, SPEECH_START_TIMEOUT_MS, speak, unlockSpeech } from "./speech";

test("the pick announcement speaks the value as a plain number", () => {
  expect(announcement("VOLCANOES", 400)).toBe("Here's VOLCANOES for 400.");
  expect(announcement("OPERA", 1200)).toBe("Here's OPERA for 1200.");
});

class FakeUtterance {
  onstart?: () => void;
  onend?: () => void;
  onerror?: () => void;
  volume = 1;
  rate = 1;
  constructor(public text: string) {}
}

let spoken: FakeUtterance[];
let cancel: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.useFakeTimers();
  spoken = [];
  cancel = vi.fn();
  vi.stubGlobal("SpeechSynthesisUtterance", FakeUtterance);
  Object.defineProperty(window, "speechSynthesis", {
    configurable: true,
    value: { cancel, speak: (u: FakeUtterance) => spoken.push(u) },
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
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
