import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { type NarrateResult, narrate, PIPER_START_TIMEOUT_MS, prepareNarration, stopNarration } from "./narrator";
import { saveVoice } from "./narratorVoice";
import { setAudioContextForTest } from "./piper/audio";
import { type Audio, type PiperEngine, readyEngine } from "./piper/engine";

vi.mock("./piper/engine", () => ({ readyEngine: vi.fn() }));

/** An AudioContext stand-in: buffers and sources the test can end by hand. */
class FakeSource {
  buffer: unknown = null;
  onended: (() => void) | null = null;
  started = false;
  connectedTo: unknown = null;
  connect(node: unknown) {
    this.connectedTo = node;
  }
  start() {
    this.started = true;
  }
  stop() {
    this.onended?.();
  }
}
function fakeAudio(state: AudioContextState = "running") {
  const sources: FakeSource[] = [];
  const ctx = {
    state,
    currentTime: 0,
    destination: {},
    resume: vi.fn(() => new Promise<void>(() => {})), // iOS before a tap: never resumes
    createBuffer: (_ch: number, length: number, rate: number) => ({
      duration: length / rate,
      getChannelData: () => new Float32Array(length),
    }),
    createBufferSource: () => {
      const s = new FakeSource();
      sources.push(s);
      return s;
    },
  };
  setAudioContextForTest(ctx as unknown as AudioContext);
  return sources;
}

const CLIP: Audio = { samples: new Float32Array(2205), sampleRate: 22050 };
function fakeEngine(): PiperEngine & { synthesize: ReturnType<typeof vi.fn> } {
  return { load: vi.fn(), synthesize: vi.fn(async () => CLIP), dispose: vi.fn() };
}

/** Lets pending promises (synthesis, scheduling) run. */
const flush = () => vi.advanceTimersByTimeAsync(0);

let engine: ReturnType<typeof fakeEngine>;
beforeEach(() => {
  vi.useFakeTimers();
  engine = fakeEngine();
  vi.mocked(readyEngine).mockReturnValue(engine);
  vi.mocked(readyEngine).mockClear();
});
afterEach(() => {
  stopNarration();
  vi.useRealTimers();
  setAudioContextForTest(null);
  window.localStorage.clear();
});

test("a Schmegettes voice reads each sentence in order and ends after the last", async () => {
  const sources = fakeAudio();
  const done = narrate("Here's OPERA for 200. Verdi wrote it.");
  await flush();
  expect(engine.synthesize.mock.calls.map((c) => c[0])).toEqual(["Here's OPERA for 200.", "Verdi wrote it."]);
  expect(sources).toHaveLength(2);
  for (const s of sources) s.onended?.();
  await expect(done).resolves.toBe("ended");
});

test("preparation is silent and its first bounded chunk is reused", async () => {
  const sources = fakeAudio();
  const line = "One two three four five six seven eight nine ten";
  prepareNarration(line);
  await flush();
  expect(engine.synthesize.mock.calls.map((c) => c[0])).toEqual(["One two three four five six seven"]);
  expect(sources).toHaveLength(0);

  const done = narrate(line);
  await flush();
  expect(engine.synthesize.mock.calls.map((c) => c[0])).toEqual([
    "One two three four five six seven",
    "eight nine ten",
  ]);
  expect(sources).toHaveLength(2);
  for (const source of sources) source.onended?.();
  await expect(done).resolves.toBe("ended");
});

test("a prepared line gets the full timeout from the playback request", async () => {
  fakeAudio();
  engine.synthesize.mockReturnValue(new Promise(() => {}));
  prepareNarration("One two three");
  await vi.advanceTimersByTimeAsync(PIPER_START_TIMEOUT_MS * 2);

  const done = narrate("One two three");
  let result: NarrateResult | undefined;
  void done.then((value) => (result = value));
  await vi.advanceTimersByTimeAsync(PIPER_START_TIMEOUT_MS - 1);
  expect(result).toBeUndefined();
  await vi.advanceTimersByTimeAsync(1);
  await expect(done).resolves.toBe("skipped");
});

test("preparation for another line is never reused", async () => {
  const sources = fakeAudio();
  prepareNarration("Old line");
  await flush();
  const done = narrate("New line");
  await flush();
  expect(engine.synthesize.mock.calls.map((c) => c[0])).toEqual(["Old line", "New line"]);
  expect(sources).toHaveLength(1);
  sources[0]?.onended?.();
  await expect(done).resolves.toBe("ended");
});

test("plays through the narrator's output (the speakers here, off iOS)", async () => {
  const sources = fakeAudio();
  const done = narrate("Verdi wrote it.");
  await flush();
  expect(sources[0]?.connectedTo).toEqual({});
  for (const s of sources) s.onended?.();
  await done;
});

test("text is cleaned up for speech first", async () => {
  const sources = fakeAudio();
  const done = narrate("Lewis & Clark");
  await flush();
  expect(engine.synthesize).toHaveBeenCalledWith("Lewis and Clark");
  for (const s of sources) s.onended?.();
  await done;
});

test("a line not started within 1.5 s is skipped", async () => {
  fakeAudio();
  engine.synthesize.mockReturnValue(new Promise(() => {})); // never finishes
  const done = narrate("Here's OPERA for 200.");
  await vi.advanceTimersByTimeAsync(PIPER_START_TIMEOUT_MS);
  await expect(done).resolves.toBe("skipped");
});

test("an engine error skips the line", async () => {
  fakeAudio();
  engine.synthesize.mockRejectedValue(new Error("boom"));
  await expect(narrate("Here's OPERA for 200.")).resolves.toBe("skipped");
});

test("a sentence that fails mid-line skips the rest, after what was already playing", async () => {
  const sources = fakeAudio();
  engine.synthesize.mockResolvedValueOnce(CLIP).mockRejectedValueOnce(new Error("boom"));
  const done = narrate("One. Two.");
  await flush();
  expect(sources).toHaveLength(1);
  sources[0]?.onended?.();
  await expect(done).resolves.toBe("skipped");
});

test("failures don't stick: the next line tries the voice again", async () => {
  const sources = fakeAudio();
  engine.synthesize.mockRejectedValueOnce(new Error("boom")).mockRejectedValueOnce(new Error("boom"));
  await narrate("x.");
  await narrate("y.");
  const done = narrate("z.");
  await flush();
  expect(engine.synthesize).toHaveBeenLastCalledWith("z.");
  for (const s of sources) s.onended?.();
  await expect(done).resolves.toBe("ended");
});

test("a voice not ready yet skips the line", async () => {
  fakeAudio();
  vi.mocked(readyEngine).mockReturnValue(null);
  await expect(narrate("x.")).resolves.toBe("skipped");
});

test("a built-in voice saved before is read as the default Schmegettes voice", async () => {
  const sources = fakeAudio();
  saveVoice("com.apple.voice.premium.en-US.Ava");
  const done = narrate("x.");
  await flush();
  expect(readyEngine).toHaveBeenCalledWith("norman");
  expect(engine.synthesize).toHaveBeenCalledWith("x.");
  for (const s of sources) s.onended?.();
  await done;
});

test("sound blocked (iOS before a tap) reports failed, like the built-in voice", async () => {
  fakeAudio("suspended");
  const done = narrate("x.");
  await vi.advanceTimersByTimeAsync(600);
  await expect(done).resolves.toBe("failed");
  expect(engine.synthesize).not.toHaveBeenCalled();
});

test("stopNarration cuts the line off", async () => {
  fakeAudio();
  const done = narrate("Here's OPERA for 200. Verdi wrote it.");
  await flush();
  stopNarration();
  await expect(done).resolves.toBe("stopped");
});

test("stopped synthesis cannot start stale audio later", async () => {
  const sources = fakeAudio();
  let deliver: (audio: Audio) => void = () => {};
  engine.synthesize.mockReturnValue(new Promise<Audio>((resolve) => (deliver = resolve)));
  const done = narrate("A line still being generated");
  stopNarration();
  deliver(CLIP);
  await flush();
  expect(sources).toHaveLength(0);
  await expect(done).resolves.toBe("stopped");
});
