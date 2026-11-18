import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { type PiperEngine, prepareVoice, readyEngine, resetEngineForTest, setEngineFactory } from "./engine";
import { fetchVoice, keepOnly, resetVoicesForTest, voiceStatus } from "./voices";

vi.mock("./voices", async (importActual) => ({
  ...(await importActual<typeof import("./voices")>()),
  fetchVoice: vi.fn(),
  keepOnly: vi.fn(async () => undefined),
}));

const CONFIG = { audio: { sample_rate: 22050 }, espeak: { voice: "en" }, inference: {} };
const files = () => ({ model: new ArrayBuffer(8), config: CONFIG });
/** One second of audio at 22,050 Hz. */
const ONE_SECOND = { samples: new Float32Array(22050), sampleRate: 22050 };

function fakeEngine(synthMs = 100) {
  let clock = 0;
  vi.spyOn(performance, "now").mockImplementation(() => clock);
  const engine: PiperEngine & { disposed: boolean } = {
    disposed: false,
    load: vi.fn(async () => undefined),
    synthesize: vi.fn(async () => {
      clock += synthMs;
      return ONE_SECOND;
    }),
    dispose: vi.fn(() => {
      engine.disposed = true;
    }),
  };
  return engine;
}

beforeEach(() => {
  resetVoicesForTest();
  vi.mocked(fetchVoice).mockReset();
  vi.mocked(keepOnly).mockClear();
});
afterEach(() => {
  resetEngineForTest();
  vi.restoreAllMocks();
});

test("a voice gets ready: loaded, warmed up, measured, and the only one kept", async () => {
  const engine = fakeEngine(100); // 0.1 s per second of audio
  setEngineFactory(() => engine);
  vi.mocked(fetchVoice).mockResolvedValue(files());
  expect(await prepareVoice("kristin")).toBe(true);
  expect(voiceStatus("kristin")).toEqual({ state: "ready" });
  expect(readyEngine("kristin")).toBe(engine);
  expect(engine.synthesize).toHaveBeenCalledTimes(2); // warm-up, then the measured run
  expect(keepOnly).toHaveBeenCalledWith("kristin");
});

test("a device too slow to keep ahead of playback can't use the Schmegettes voices", async () => {
  const engine = fakeEngine(800); // 0.8 s per second of audio
  setEngineFactory(() => engine);
  vi.mocked(fetchVoice).mockResolvedValue(files());
  expect(await prepareVoice("kristin")).toBe(false);
  expect(voiceStatus("kristin")).toEqual({ state: "unavailable" });
  expect(voiceStatus("john")).toEqual({ state: "unavailable" });
  expect(readyEngine("kristin")).toBeNull();
  expect(engine.disposed).toBe(true);
});

test("a failed download leaves the voice not ready", async () => {
  setEngineFactory(() => fakeEngine());
  vi.mocked(fetchVoice).mockResolvedValue(null);
  expect(await prepareVoice("norman")).toBe(false);
  expect(readyEngine("norman")).toBeNull();
});

test("a load error marks the voice failed", async () => {
  const engine = fakeEngine();
  vi.mocked(engine.load).mockRejectedValue(new Error("bad model"));
  setEngineFactory(() => engine);
  vi.mocked(fetchVoice).mockResolvedValue(files());
  expect(await prepareVoice("kristin")).toBe(false);
  expect(voiceStatus("kristin")).toEqual({ state: "failed" });
});

test("the voice already loaded keeps reading until the new one is ready", async () => {
  const first = fakeEngine();
  setEngineFactory(() => first);
  vi.mocked(fetchVoice).mockResolvedValue(files());
  await prepareVoice("kristin");

  const second = fakeEngine();
  setEngineFactory(() => second);
  let deliver: (f: ReturnType<typeof files>) => void = () => {};
  vi.mocked(fetchVoice).mockReturnValue(new Promise((r) => (deliver = r)));
  const switching = prepareVoice("norman");
  expect(readyEngine("kristin")).toBe(first); // still reading
  deliver(files());
  expect(await switching).toBe(true);
  expect(readyEngine("kristin")).toBeNull();
  expect(readyEngine("norman")).toBe(second);
  expect(first.disposed).toBe(true);
});

test("picking another voice while one is getting ready drops the first", async () => {
  const engines = [fakeEngine(), fakeEngine()];
  let made = 0;
  setEngineFactory(() => engines[made++] ?? fakeEngine());
  let deliverKristin: (f: ReturnType<typeof files>) => void = () => {};
  vi.mocked(fetchVoice)
    .mockReturnValueOnce(new Promise((r) => (deliverKristin = r)))
    .mockResolvedValueOnce(files());
  const kristin = prepareVoice("kristin");
  const john = prepareVoice("john");
  deliverKristin(files());
  expect(await kristin).toBe(false);
  expect(await john).toBe(true);
  expect(readyEngine("john")).not.toBeNull();
});

test("going back to the voice already loaded drops the one getting ready", async () => {
  const first = fakeEngine();
  setEngineFactory(() => first);
  vi.mocked(fetchVoice).mockResolvedValue(files());
  await prepareVoice("kristin");

  let deliver: (f: ReturnType<typeof files>) => void = () => {};
  vi.mocked(fetchVoice).mockReturnValue(new Promise((r) => (deliver = r)));
  setEngineFactory(() => fakeEngine());
  const norman = prepareVoice("norman");
  expect(await prepareVoice("kristin")).toBe(true);
  deliver(files());
  expect(await norman).toBe(false);
  expect(readyEngine("kristin")).toBe(first);
  expect(readyEngine("norman")).toBeNull();
  expect(voiceStatus("norman")).toEqual({ state: "absent" });
});
