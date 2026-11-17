import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  fetchVoice,
  keepOnly,
  markDeviceUnavailable,
  PIPER_VOICES,
  piperVoice,
  resetVoicesForTest,
  voiceStatus,
} from "./voices";

const kristin = piperVoice("kristin");
const norman = piperVoice("norman");
const CONFIG = { audio: { sample_rate: 22050 }, espeak: { voice: "en" } };

const hexToBytes = (hex: string) => Uint8Array.from(hex.match(/../g) ?? [], (b) => Number.parseInt(b, 16));

/** A Cache Storage stand-in: one cache, keyed by URL. */
function fakeCaches() {
  const store = new Map<string, Response>();
  const cache = {
    match: vi.fn(async (url: string) => store.get(url)?.clone()),
    put: vi.fn(async (url: string, res: Response) => {
      store.set(url, res);
    }),
    delete: vi.fn(async (url: string) => store.delete(url)),
  };
  vi.stubGlobal("caches", { open: async () => cache });
  return { store, cache };
}

/** fetch that serves a voice's config and a model of the right size, in two chunks. */
function fakeFetch({ hold = false } = {}) {
  const calls: string[] = [];
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push(url);
    if (url.endsWith(".json")) return new Response(JSON.stringify(CONFIG));
    const size = PIPER_VOICES[0]?.bytes ?? 0;
    const half = Math.floor(size / 2);
    let sent = 0;
    const body = new ReadableStream<Uint8Array>({
      async pull(controller) {
        if (hold)
          await new Promise<void>((_, reject) =>
            init?.signal?.addEventListener("abort", () => reject(new Error("aborted"))),
          );
        const n = sent === 0 ? half : size - half;
        if (n <= 0 || sent >= size) return controller.close();
        controller.enqueue(new Uint8Array(n));
        sent += n;
      },
    });
    return new Response(body);
  });
  vi.stubGlobal("fetch", fn);
  return { fn, calls };
}

/** crypto.subtle.digest answers with `voice`'s checksum (or a wrong one). */
function fakeDigest(sha256: string) {
  vi.spyOn(crypto.subtle, "digest").mockResolvedValue(hexToBytes(sha256).buffer);
}

beforeEach(() => {
  resetVoicesForTest();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test("downloads with progress, checks the checksum, and keeps the voice", async () => {
  const { store } = fakeCaches();
  fakeFetch();
  fakeDigest(kristin.sha256);
  const files = await fetchVoice("kristin");
  expect(files?.config).toEqual(CONFIG);
  expect(files?.model.byteLength).toBe(kristin.bytes);
  expect(store.has(kristin.modelUrl)).toBe(true);
  expect(store.has(kristin.configUrl)).toBe(true);
  expect(voiceStatus("kristin")).toEqual({ state: "downloading", fraction: 1 }); // "preparing" is the engine's
});

test("a checksum mismatch fails and keeps nothing", async () => {
  const { store } = fakeCaches();
  fakeFetch();
  fakeDigest(norman.sha256); // wrong for Kristin
  expect(await fetchVoice("kristin")).toBeNull();
  expect(voiceStatus("kristin")).toEqual({ state: "failed" });
  expect(store.size).toBe(0);
});

test("a voice already on the device isn't downloaded again", async () => {
  const { store } = fakeCaches();
  store.set(kristin.modelUrl, new Response(new Uint8Array(4)));
  store.set(kristin.configUrl, new Response(JSON.stringify(CONFIG)));
  const { fn } = fakeFetch();
  const files = await fetchVoice("kristin");
  expect(fn).not.toHaveBeenCalled();
  expect(files?.model.byteLength).toBe(4);
});

test("picking another voice stops the download in progress", async () => {
  fakeCaches();
  fakeFetch({ hold: true });
  fakeDigest(norman.sha256);
  const first = fetchVoice("kristin");
  await vi.waitFor(() => expect(voiceStatus("kristin").state).toBe("downloading"));
  const second = fetchVoice("norman");
  expect(await first).toBeNull();
  expect(voiceStatus("kristin")).toEqual({ state: "absent" });
  void second;
});

test("keepOnly removes the other voices from the device", async () => {
  const { store } = fakeCaches();
  for (const v of PIPER_VOICES) {
    store.set(v.modelUrl, new Response("m"));
    store.set(v.configUrl, new Response("{}"));
  }
  await keepOnly("norman");
  expect([...store.keys()]).toEqual([norman.modelUrl, norman.configUrl]);
});

test("without Cache Storage the voice is kept in memory for this visit", async () => {
  const { fn } = fakeFetch();
  fakeDigest(kristin.sha256);
  expect(await fetchVoice("kristin")).not.toBeNull();
  expect(await fetchVoice("kristin")).not.toBeNull();
  expect(fn).toHaveBeenCalledTimes(2); // config + model, once
});

test("a device that's too slow makes every voice unavailable", () => {
  markDeviceUnavailable();
  for (const v of PIPER_VOICES) expect(voiceStatus(v.id)).toEqual({ state: "unavailable" });
});
