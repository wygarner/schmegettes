import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  MAX_MISSES,
  narrate,
  narrationState,
  PIPER_START_TIMEOUT_MS,
  resetNarrationForGame,
  stopNarration,
} from "./narrator";
import { saveVoice } from "./narratorVoice";
import { setAudioContextForTest } from "./piper/audio";
import { type Audio, type PiperEngine, readyEngine } from "./piper/engine";
import { speak, stopSpeaking } from "./speech";

vi.mock("./piper/engine", () => ({ readyEngine: vi.fn() }));
vi.mock("./speech", async (importActual) => ({
  ...(await importActual<typeof import("./speech")>()),
  speak: vi.fn(async () => "ended"),
  stopSpeaking: vi.fn(),
}));

/** An AudioContext stand-in: buffers and sources the test can end by hand. */
class FakeSource {
  buffer: unknown = null;
  onended: (() => void) | null = null;
  started = false;
  connect() {}
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
  vi.mocked(speak).mockClear();
  resetNarrationForGame();
});
afterEach(() => {
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
  expect(speak).not.toHaveBeenCalled();
});

test("text is cleaned up for speech first", async () => {
  const sources = fakeAudio();
  const done = narrate("Lewis & Clark");
  await flush();
  expect(engine.synthesize).toHaveBeenCalledWith("Lewis and Clark");
  for (const s of sources) s.onended?.();
  await done;
});

test("a line not started within 1.5 s is read with the built-in voice, and counts as a miss", async () => {
  fakeAudio();
  engine.synthesize.mockReturnValue(new Promise(() => {})); // never finishes
  const done = narrate("Here's OPERA for 200.");
  await vi.advanceTimersByTimeAsync(PIPER_START_TIMEOUT_MS);
  await expect(done).resolves.toBe("ended");
  expect(speak).toHaveBeenCalledWith("Here's OPERA for 200.");
  expect(narrationState()).toEqual({ misses: 1, degraded: false });
});

test("an engine error falls back to the built-in voice", async () => {
  fakeAudio();
  engine.synthesize.mockRejectedValue(new Error("boom"));
  await expect(narrate("Here's OPERA for 200.")).resolves.toBe("ended");
  expect(speak).toHaveBeenCalledWith("Here's OPERA for 200.");
});

test("2 misses in a row put the rest of the game on the built-in voice, until a new game", async () => {
  fakeAudio();
  engine.synthesize.mockRejectedValue(new Error("boom"));
  for (let i = 0; i < MAX_MISSES; i++) await narrate("x.");
  expect(narrationState().degraded).toBe(true);

  engine.synthesize.mockClear();
  engine.synthesize.mockResolvedValue(CLIP);
  await narrate("y.");
  expect(engine.synthesize).not.toHaveBeenCalled();
  expect(speak).toHaveBeenLastCalledWith("y.");

  resetNarrationForGame();
  expect(narrationState()).toEqual({ misses: 0, degraded: false });
});

test("a line that plays resets the miss count", async () => {
  const sources = fakeAudio();
  engine.synthesize.mockRejectedValueOnce(new Error("boom"));
  await narrate("x.");
  expect(narrationState().misses).toBe(1);
  const done = narrate("y.");
  await flush();
  for (const s of sources) s.onended?.();
  await done;
  expect(narrationState().misses).toBe(0);
});

test("a voice not ready yet means the built-in voice, with no miss", async () => {
  fakeAudio();
  vi.mocked(readyEngine).mockReturnValue(null);
  await narrate("x.");
  expect(speak).toHaveBeenCalledWith("x.");
  expect(narrationState().misses).toBe(0);
});

test("a host who picked a built-in voice never hears a Schmegettes voice", async () => {
  fakeAudio();
  saveVoice("com.apple.voice.premium.en-US.Ava");
  await narrate("x.");
  expect(readyEngine).not.toHaveBeenCalledWith("kristin");
  expect(engine.synthesize).not.toHaveBeenCalled();
  expect(speak).toHaveBeenCalledWith("x.");
});

test("sound blocked (iOS before a tap) reports failed, like the built-in voice", async () => {
  fakeAudio("suspended");
  const done = narrate("x.");
  await vi.advanceTimersByTimeAsync(600);
  await expect(done).resolves.toBe("failed");
  expect(engine.synthesize).not.toHaveBeenCalled();
});

test("stopNarration cuts the line off and stops both voices", async () => {
  fakeAudio();
  const done = narrate("Here's OPERA for 200. Verdi wrote it.");
  await flush();
  stopNarration();
  await expect(done).resolves.toBe("stopped");
  expect(stopSpeaking).toHaveBeenCalled();
});
