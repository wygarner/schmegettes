import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { setAudioContextForTest } from "./piper/audio";
import { playBuzz, playBuzzIn, playCorrect, playDailyDouble, playDoubleRound, playTimesUp, stopEffects } from "./sfx";

// Just enough of an AudioContext to schedule nodes and see what was started and stopped.
function fakeContext(state: AudioContextState = "running") {
  const param = () => ({ value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() });
  const sources: Array<{ start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> }> = [];
  const source = () => {
    const s = {
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      frequency: param(),
      detune: param(),
      type: "",
      buffer: null,
    };
    sources.push(s);
    return s;
  };
  const ctx = {
    state,
    currentTime: 0,
    sampleRate: 8000,
    destination: {},
    resume: vi.fn(() => new Promise<void>(() => {})), // a phone before a tap: never resumes
    createGain: () => ({ gain: param(), connect: vi.fn() }),
    createBiquadFilter: () => ({ type: "", frequency: param(), connect: vi.fn() }),
    createOscillator: source,
    createBufferSource: source,
    createBuffer: (_c: number, length: number) => ({ getChannelData: () => new Float32Array(length) }),
  };
  setAudioContextForTest(ctx as unknown as AudioContext);
  return { ctx, sources };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  setAudioContextForTest(null);
});

describe("each sound", () => {
  test.each([
    ["correct", playCorrect, 800],
    ["time's up", playTimesUp, 800],
    ["Daily Double", playDailyDouble, 1500],
    ["Double Schmegettes", playDoubleRound, 2500],
    ["buzzer", playBuzz, 200],
    ["buzz-in", playBuzzIn, 400],
  ] as const)("%s schedules its notes and ends within %i ms", async (_name, play, limit) => {
    const { sources } = fakeContext();
    let done = false;
    const p = play().then(() => {
      done = true;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(sources.length).toBeGreaterThan(0);
    for (const s of sources) expect(s.start).toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(limit);
    await p;
    expect(done).toBe(true);
  });
});

test("blocked sound (no tap yet) skips the sound and never holds anything up", async () => {
  const { sources } = fakeContext("suspended");
  const p = playCorrect();
  await vi.advanceTimersByTimeAsync(200);
  await expect(p).resolves.toBeUndefined();
  expect(sources).toHaveLength(0);
});

test("no Web Audio at all: resolves at once", async () => {
  setAudioContextForTest(null);
  vi.stubGlobal("AudioContext", undefined);
  await expect(playBuzz()).resolves.toBeUndefined();
  vi.unstubAllGlobals();
});

test("stopEffects stops what's playing and resolves it", async () => {
  const { sources } = fakeContext();
  const p = playDailyDouble();
  await vi.advanceTimersByTimeAsync(0);
  stopEffects();
  await expect(p).resolves.toBeUndefined();
  for (const s of sources) expect(s.stop.mock.calls.length).toBeGreaterThan(1); // scheduled stop + now
});
