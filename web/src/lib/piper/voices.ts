// The Schmegettes voices: free Piper voices the host device downloads once and keeps.
// Rules: docs/product-docs/features/gameplay/feature-brief.md, "The narrator's voice".
//
// Every voice here is public domain per its model card. Never add a voice whose card says
// non-commercial (NC), points to the lessac license, or is fine-tuned from lessac or Ryan.

import { useSyncExternalStore } from "react";

export type PiperVoiceId = "kristin" | "norman" | "john";

export interface PiperVoice {
  id: PiperVoiceId;
  name: string;
  modelUrl: string;
  configUrl: string;
  /** SHA-256 of the .onnx file, from the Hugging Face LFS pointer at PIPER_COMMIT. */
  sha256: string;
  bytes: number;
}

/** rhasspy/piper-voices, pinned so a changed upstream file can't change what hosts download. */
export const PIPER_COMMIT = "0ca208afc2a2ee102b1e961e72e0a7e4907be3d0";
const BASE = `https://huggingface.co/rhasspy/piper-voices/resolve/${PIPER_COMMIT}/en/en_US`;

function voice(id: PiperVoiceId, name: string, sha256: string): PiperVoice {
  const file = `${BASE}/${id}/medium/en_US-${id}-medium.onnx`;
  return { id, name, modelUrl: file, configUrl: `${file}.json`, sha256, bytes: 63_531_379 };
}

export const PIPER_VOICES: readonly PiperVoice[] = [
  voice("kristin", "Kristin", "5849957f929cbf720c258f8458692d6103fff2f0e3d3b19c8259474bb06a18d4"),
  voice("norman", "Norman", "b9739443232a80a59c7d18810dd856899bf16a7964725f5ab81ea49b1351cb71"),
  voice("john", "John", "789c6c875726e627ddee93d51d8727859abe9c091c3d141591f4b83c2072e988"),
];

export const DEFAULT_PIPER_VOICE: PiperVoiceId = "kristin";

export function isPiperVoiceId(id: string): id is PiperVoiceId {
  return PIPER_VOICES.some((v) => v.id === id);
}

export function piperVoice(id: PiperVoiceId): PiperVoice {
  const found = PIPER_VOICES.find((v) => v.id === id);
  if (!found) throw new Error(`unknown voice ${id}`);
  return found;
}

// --- Status: what the lobby shows for each voice ------------------------------------------

export type VoiceStatus =
  | { state: "absent" }
  | { state: "downloading"; fraction: number }
  | { state: "preparing" }
  | { state: "ready" }
  | { state: "failed" }
  | { state: "unavailable" };

const ABSENT: VoiceStatus = { state: "absent" };
const UNAVAILABLE: VoiceStatus = { state: "unavailable" };
const statuses = new Map<PiperVoiceId, VoiceStatus>();
const listeners = new Set<() => void>();
/** This device can't generate speech fast enough: every Schmegettes voice is unavailable. */
let deviceUnavailable = false;

export function voiceStatus(id: PiperVoiceId): VoiceStatus {
  return deviceUnavailable ? UNAVAILABLE : (statuses.get(id) ?? ABSENT);
}

export function setVoiceStatus(id: PiperVoiceId, status: VoiceStatus): void {
  statuses.set(id, status);
  for (const l of listeners) l();
}

export function markDeviceUnavailable(): void {
  deviceUnavailable = true;
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useVoiceStatus(id: PiperVoiceId): VoiceStatus {
  return useSyncExternalStore(subscribe, () => voiceStatus(id));
}

// --- Download, verify, keep one ------------------------------------------------------------

const CACHE = "schmegettes-voices-v1";

/** A downloaded voice: the model bytes and its config. */
export interface VoiceFiles {
  model: ArrayBuffer;
  config: unknown;
}

/** When the browser has no Cache Storage (an insecure page), the voice lives in memory for this visit. */
const inMemory = new Map<PiperVoiceId, VoiceFiles>();
let active: { id: PiperVoiceId; controller: AbortController; done: Promise<VoiceFiles | null> } | null = null;
let askedToPersist = false;

async function openCache(): Promise<Cache | null> {
  try {
    return typeof caches === "undefined" ? null : await caches.open(CACHE);
  } catch {
    return null;
  }
}

async function cached(cache: Cache | null, v: PiperVoice): Promise<VoiceFiles | null> {
  const memory = inMemory.get(v.id);
  if (memory) return memory;
  if (!cache) return null;
  const [model, config] = await Promise.all([cache.match(v.modelUrl), cache.match(v.configUrl)]);
  if (!model || !config) return null;
  return { model: await model.arrayBuffer(), config: await config.json() };
}

function hex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function download(v: PiperVoice, signal: AbortSignal): Promise<VoiceFiles> {
  const configResponse = await fetch(v.configUrl, { signal });
  if (!configResponse.ok) throw new Error(`config ${configResponse.status}`);
  const configText = await configResponse.text();

  const response = await fetch(v.modelUrl, { signal });
  if (!response.ok || !response.body) throw new Error(`model ${response.status}`);
  const bytes = new Uint8Array(v.bytes);
  const reader = response.body.getReader();
  let received = 0;
  let lastReported = -1;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (received + value.length > bytes.length) throw new Error("model larger than expected");
    bytes.set(value, received);
    received += value.length;
    const percent = Math.floor((received / v.bytes) * 100);
    if (percent !== lastReported) {
      lastReported = percent;
      setVoiceStatus(v.id, { state: "downloading", fraction: received / v.bytes });
    }
  }
  if (received !== v.bytes) throw new Error("model shorter than expected");
  // subtle.digest runs off the main thread.
  if (hex(await crypto.subtle.digest("SHA-256", bytes)) !== v.sha256) throw new Error("model checksum mismatch");

  const cache = await openCache();
  const files = { model: bytes.buffer, config: JSON.parse(configText) as unknown };
  if (cache) {
    try {
      await cache.put(v.modelUrl, new Response(bytes, { headers: { "content-type": "application/octet-stream" } }));
      await cache.put(v.configUrl, new Response(configText, { headers: { "content-type": "application/json" } }));
    } catch {
      inMemory.set(v.id, files); // out of space: keep it for this visit only
    }
  } else {
    inMemory.set(v.id, files);
  }
  return files;
}

/** Removes every voice but `keep` from the device: only one Schmegettes voice is kept. */
async function forgetOthers(keep: PiperVoiceId): Promise<void> {
  const cache = await openCache();
  for (const v of PIPER_VOICES) {
    if (v.id === keep) continue;
    inMemory.delete(v.id);
    if (cache) await Promise.all([cache.delete(v.modelUrl), cache.delete(v.configUrl)]);
  }
}

/**
 * The voice's files: from the device when they're there, else downloaded (with progress)
 * and verified. A new call for another voice stops the one in progress. Null when the
 * download failed or was replaced; the status says which.
 */
export function fetchVoice(id: PiperVoiceId): Promise<VoiceFiles | null> {
  if (active?.id === id) return active.done;
  if (active) {
    active.controller.abort();
    if (voiceStatus(active.id).state === "downloading") setVoiceStatus(active.id, ABSENT);
  }
  const v = piperVoice(id);
  const controller = new AbortController();
  const done = (async (): Promise<VoiceFiles | null> => {
    try {
      const have = await cached(await openCache(), v);
      if (have) return have;
      setVoiceStatus(id, { state: "downloading", fraction: 0 });
      return await download(v, controller.signal);
    } catch {
      if (!controller.signal.aborted) setVoiceStatus(id, { state: "failed" });
      return null;
    } finally {
      if (active?.controller === controller) active = null;
    }
  })();
  active = { id, controller, done };
  if (!askedToPersist) {
    askedToPersist = true;
    void navigator.storage?.persist?.().catch(() => false);
  }
  return done;
}

/** Called once a voice is ready to speak: the device keeps only that one. */
export function keepOnly(id: PiperVoiceId): Promise<void> {
  return forgetOthers(id).catch(() => undefined);
}

/** Tests only. */
export function resetVoicesForTest(): void {
  statuses.clear();
  inMemory.clear();
  active = null;
  deviceUnavailable = false;
  askedToPersist = false;
}
