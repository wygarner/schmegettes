// The main-thread side of the Piper worker, and getting a voice ready to speak: download (or
// load from the device), load it into the worker, and check this device is fast enough.

import { e2eActive } from "../e2eFlag";
import type { FromWorker, PiperConfig, ToWorker } from "./protocol";
import {
  cancelFetch,
  fetchVoice,
  keepOnly,
  markDeviceUnavailable,
  type PiperVoiceId,
  setVoiceStatus,
  voiceStatus,
} from "./voices";

export interface Audio {
  samples: Float32Array;
  sampleRate: number;
}

export interface PiperEngine {
  load(model: ArrayBuffer, config: PiperConfig): Promise<void>;
  synthesize(text: string): Promise<Audio>;
  dispose(): void;
}

/** Above this (synthesis time / audio length), a clue can't start within 1 s and stay ahead of playback. */
export const MAX_REALTIME_FACTOR = 0.5;
const WARM_UP = "Here's Volcanoes for 400.";

function workerEngine(): PiperEngine {
  const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
  let next = 1;
  const pending = new Map<number, { resolve: (m: FromWorker) => void; reject: (e: Error) => void }>();
  worker.onmessage = (e: MessageEvent<FromWorker>) => {
    const p = pending.get(e.data.id);
    if (!p) return;
    pending.delete(e.data.id);
    if (e.data.type === "error") p.reject(new Error(e.data.message));
    else p.resolve(e.data);
  };
  worker.onerror = () => {
    for (const p of pending.values()) p.reject(new Error("worker failed"));
    pending.clear();
  };
  const send = (msg: ToWorker, transfer: Transferable[] = []) =>
    new Promise<FromWorker>((resolve, reject) => {
      pending.set(msg.id, { resolve, reject });
      worker.postMessage(msg, transfer);
    });
  return {
    async load(model, config) {
      await send({ type: "load", id: next++, model, config }, [model]);
    },
    async synthesize(text) {
      const reply = await send({ type: "synthesize", id: next++, text });
      if (reply.type !== "audio") throw new Error("unexpected reply");
      return { samples: reply.samples, sampleRate: reply.sampleRate };
    },
    dispose() {
      worker.terminate();
      pending.clear();
    },
  };
}

let makeEngine: () => PiperEngine = workerEngine;
let engine: PiperEngine | null = null;
let loadedId: PiperVoiceId | null = null;
let preparing: { id: PiperVoiceId; done: Promise<boolean> } | null = null;

/** The engine when `id` is loaded and checked, else null. */
export function readyEngine(id: PiperVoiceId): PiperEngine | null {
  return loadedId === id ? engine : null;
}

/**
 * Gets a voice ready to speak, in the background: download or load from the device, load
 * into the worker, warm up, and measure. True when it's ready. The voice already loaded keeps
 * reading until this one is ready; then only this one is kept on the device.
 */
export function prepareVoice(id: PiperVoiceId): Promise<boolean> {
  // E2E mode downloads nothing: every voice is ready and narration ends at once.
  if (e2eActive()) {
    setVoiceStatus(id, { state: "ready" });
    return Promise.resolve(true);
  }
  if (loadedId === id) {
    // Back to the voice already loaded: drop whatever was getting ready instead.
    if (preparing) {
      cancelFetch();
      preparing = null;
    }
    return Promise.resolve(true);
  }
  if (preparing?.id === id) return preparing.done;
  const done = (async () => {
    const dropped = () => {
      // The host picked another voice meanwhile: this one isn't on its way any more.
      const state = voiceStatus(id).state;
      if (state === "downloading" || state === "preparing") setVoiceStatus(id, { state: "absent" });
      return false;
    };
    const files = await fetchVoice(id);
    if (!files) return false; // failed (the status says so) or replaced
    if (preparing?.id !== id) return dropped();
    setVoiceStatus(id, { state: "preparing" });
    try {
      const fresh = makeEngine();
      // The model buffer is transferred to the worker; keep the cached copy untouched.
      await fresh.load(files.model.slice(0), files.config as PiperConfig);
      await fresh.synthesize(WARM_UP); // the first run is slower; measure the second
      const t0 = performance.now();
      const warm = await fresh.synthesize(WARM_UP);
      const rtf = (performance.now() - t0) / ((warm.samples.length / warm.sampleRate) * 1000);
      if (preparing?.id !== id) {
        fresh.dispose();
        return dropped();
      }
      if (!(rtf <= MAX_REALTIME_FACTOR)) {
        fresh.dispose();
        markDeviceUnavailable();
        return false;
      }
      engine?.dispose();
      engine = fresh;
      loadedId = id;
      setVoiceStatus(id, { state: "ready" });
      await keepOnly(id);
      return true;
    } catch {
      setVoiceStatus(id, { state: "failed" });
      return false;
    }
  })();
  preparing = { id, done };
  void done.finally(() => {
    if (preparing?.done === done) preparing = null;
  });
  return done;
}

/** Tests only: swap the worker for a fake (used by the next voice that gets ready). */
export function setEngineFactory(make: (() => PiperEngine) | null): void {
  makeEngine = make ?? workerEngine;
}

/** Tests only: forget the loaded voice. */
export function resetEngineForTest(): void {
  engine?.dispose();
  engine = null;
  loadedId = null;
  preparing = null;
  makeEngine = workerEngine;
}
