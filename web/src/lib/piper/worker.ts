// The Piper worker: text → espeak-ng phoneme ids → VITS model → audio, off the main thread so
// the host's screen and buzzer never wait on it. Loaded only on the host device.
//
// espeak-ng (inside piper_phonemize) is GPL-3.0; accepted for web/ on 2026-11-17. The voices
// were trained on espeak-ng phonemes, so this is what makes them pronounce words correctly.

import phonemizeDataUrl from "@diffusionstudio/piper-wasm/build/piper_phonemize.data?url";
import createPiperPhonemize from "@diffusionstudio/piper-wasm/build/piper_phonemize.js";
import phonemizeWasmUrl from "@diffusionstudio/piper-wasm/build/piper_phonemize.wasm?url";
import ortWasmUrl from "onnxruntime-web/ort-wasm-simd-threaded.wasm?url";
import * as ort from "onnxruntime-web/wasm";
import type { FromWorker, PiperConfig, ToWorker } from "./protocol";

// The plain WASM build (14.8 MB), one thread: threads need cross-origin isolation, which the
// page doesn't have, and the worker already keeps synthesis off the main thread.
ort.env.wasm.wasmPaths = { wasm: ortWasmUrl };
ort.env.wasm.numThreads = 1;

interface Scope {
  onmessage: ((e: MessageEvent<ToWorker>) => void) | null;
  postMessage(message: FromWorker, transfer?: Transferable[]): void;
}
const scope = self as unknown as Scope;

interface Phonemizer {
  callMain(args: string[]): void;
}

let session: ort.InferenceSession | null = null;
let config: PiperConfig | null = null;
let phonemizer: Phonemizer | null = null;
let printed: string[] = [];

/** One phonemizer for the visit: it keeps espeak-ng's data loaded between calls. */
async function getPhonemizer(): Promise<Phonemizer> {
  phonemizer ??= (await createPiperPhonemize({
    noInitialRun: true,
    print: (line: string) => printed.push(line),
    printErr: () => {},
    locateFile: (file: string) => (file.endsWith(".wasm") ? phonemizeWasmUrl : phonemizeDataUrl),
  })) as Phonemizer;
  return phonemizer;
}

async function phonemeIds(text: string, voice: string): Promise<number[]> {
  const run = async () => {
    const p = await getPhonemizer();
    printed = [];
    p.callMain(["-l", voice, "--input", JSON.stringify([{ text }]), "--espeak_data", "/espeak-ng-data"]);
    const ids = printed.flatMap((line) => (JSON.parse(line) as { phoneme_ids: number[] }).phoneme_ids);
    if (ids.length === 0) throw new Error("no phonemes");
    return ids;
  };
  try {
    return await run();
  } catch {
    phonemizer = null; // a fresh instance if the old one exited or broke
    return run();
  }
}

async function synthesize(text: string): Promise<Float32Array> {
  if (!session || !config) throw new Error("no voice loaded");
  const ids = await phonemeIds(text, config.espeak.voice);
  const { noise_scale, length_scale, noise_w } = config.inference;
  const feeds: Record<string, ort.Tensor> = {
    input: new ort.Tensor("int64", BigInt64Array.from(ids, BigInt), [1, ids.length]),
    input_lengths: new ort.Tensor("int64", BigInt64Array.from([BigInt(ids.length)]), [1]),
    scales: new ort.Tensor("float32", Float32Array.from([noise_scale, length_scale, noise_w]), [3]),
  };
  if ((config.num_speakers ?? 1) > 1) feeds.sid = new ort.Tensor("int64", BigInt64Array.from([0n]), [1]);
  const out = await session.run(feeds);
  const audio = out.output ?? Object.values(out)[0];
  if (!audio) throw new Error("no audio");
  return Float32Array.from(audio.data as Float32Array);
}

scope.onmessage = async (e) => {
  const msg = e.data;
  try {
    if (msg.type === "load") {
      await session?.release();
      session = null;
      config = msg.config;
      session = await ort.InferenceSession.create(new Uint8Array(msg.model), { executionProviders: ["wasm"] });
      await getPhonemizer();
      scope.postMessage({ type: "loaded", id: msg.id });
    } else {
      const samples = await synthesize(msg.text);
      scope.postMessage({ type: "audio", id: msg.id, samples, sampleRate: config?.audio.sample_rate ?? 22050 }, [
        samples.buffer,
      ]);
    }
  } catch (err) {
    scope.postMessage({ type: "error", id: msg.id, message: err instanceof Error ? err.message : String(err) });
  }
};
