// Every narrated line goes through narrate(), in the host's Schmegettes voice. The device's
// built-in voices are never used. Rules: docs/product-docs/features/gameplay/feature-brief.md,
// "The narrator's voice".
//
// - prepareNarration() may generate the first bounded chunk during a silent lead-in. narrate()
//   is the only function that can play it, and generates later chunks while earlier ones play.
// - A line whose first audio hasn't started PIPER_START_TIMEOUT_MS after playback was requested,
//   or that fails, is skipped: the text stays on screen and the server's timer moves on.
// - A voice that becomes ready mid-game (after a reload) is used from the next line on.

import { narratorChoice } from "./narratorVoice";
import { audioContext, narratorOutput } from "./piper/audio";
import { type Audio, type PiperEngine, readyEngine } from "./piper/engine";
import { narrationChunks } from "./piper/sentences";
import type { PiperVoiceId } from "./piper/voices";
import { spokenText } from "./speech";

/**
 * How a line went. Only "ended" means the room heard all of it. "failed": sound is blocked
 * (iOS before a tap). "skipped": the voice wasn't ready in time or broke; nothing more was
 * said. "stopped": cut off on purpose (stopNarration).
 */
export type NarrateResult = "ended" | "failed" | "skipped" | "stopped";

export const PIPER_START_TIMEOUT_MS = 1500;
/** How long to wait for iOS to resume audio before treating sound as blocked. */
const RESUME_TIMEOUT_MS = 500;

interface Run {
  stopped: boolean;
  sources: AudioBufferSourceNode[];
}
let current: Run | null = null;

interface PreparedLine {
  voiceId: PiperVoiceId;
  engine: PiperEngine;
  text: string;
  chunks: string[];
  first: Promise<Audio | null>;
}
let prepared: PreparedLine | null = null;

const TIMEOUT = Symbol("timeout");
function within<T>(promise: Promise<T>, ms: number): Promise<T | typeof TIMEOUT> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(TIMEOUT), Math.max(0, ms));
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

const synthesize = (engine: PiperEngine, text: string): Promise<Audio | null> =>
  engine.synthesize(text).catch(() => null);

/** Starts generating a line's first chunk without touching the audio session or playing it. */
export function prepareNarration(text: string): void {
  const line = spokenText(text);
  const chunks = narrationChunks(line);
  const { id } = narratorChoice();
  const engine = readyEngine(id);
  if (!engine || chunks.length === 0) {
    prepared = null;
    return;
  }
  if (prepared?.voiceId === id && prepared.engine === engine && prepared.text === line) return;
  prepared = { voiceId: id, engine, text: line, chunks, first: synthesize(engine, chunks[0] ?? line) };
}

async function narratePiper(
  engine: PiperEngine,
  chunks: string[],
  startedAt: number,
  firstPrepared: Promise<Audio | null> | null,
): Promise<NarrateResult> {
  const run: Run = { stopped: false, sources: [] };
  current = run;
  const ctx = audioContext();
  if (!ctx) {
    if (current === run) current = null;
    return "skipped";
  }
  if (ctx.state !== "running") {
    const resumed = ctx.resume().catch(() => undefined); // inside the tap, when there is one
    await within(resumed, RESUME_TIMEOUT_MS);
    if (run.stopped) return "stopped";
    if ((ctx.state as AudioContextState) !== "running") {
      if (current === run) current = null;
      return "failed";
    }
  }

  let at = 0;
  const play = (audio: Audio): Promise<void> => {
    const buffer = ctx.createBuffer(1, audio.samples.length, audio.sampleRate);
    buffer.getChannelData(0).set(audio.samples);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(narratorOutput(ctx));
    const start = Math.max(at, ctx.currentTime);
    source.start(start);
    at = start + buffer.duration;
    run.sources.push(source);
    return new Promise((resolve) => {
      source.onended = () => resolve();
    });
  };

  let first: Audio | typeof TIMEOUT | null;
  try {
    first = await within(
      firstPrepared ?? synthesize(engine, chunks[0] ?? ""),
      PIPER_START_TIMEOUT_MS - (performance.now() - startedAt),
    );
  } catch {
    if (current === run) current = null;
    return "skipped";
  }
  if (run.stopped) return "stopped";
  if (first === TIMEOUT || first === null) {
    if (current === run) current = null;
    return "skipped";
  }

  // Play each bounded chunk while the next one is generated, back to back.
  let ended = play(first);
  for (let i = 1; i < chunks.length; i++) {
    const next = await synthesize(engine, chunks[i] ?? "");
    if (!next) {
      await ended;
      if (current === run) current = null;
      return run.stopped ? "stopped" : "skipped";
    }
    if (run.stopped) return "stopped";
    ended = play(next);
  }
  await ended;
  if (current === run) current = null;
  return run.stopped ? "stopped" : "ended";
}

function stopPiper(): void {
  if (!current) return;
  current.stopped = true;
  for (const s of current.sources) {
    try {
      s.stop();
    } catch {
      // not started yet, or already ended
    }
  }
  current = null;
}

/** Reads a line aloud. Resolves "ended" only when the room heard all of it. */
export async function narrate(text: string): Promise<NarrateResult> {
  const startedAt = performance.now();
  stopPiper();
  const line = spokenText(text);
  const chunks = narrationChunks(line);
  const { id } = narratorChoice();
  const engine = readyEngine(id);
  if (!engine || chunks.length === 0) return "skipped";
  const match = prepared?.voiceId === id && prepared.engine === engine && prepared.text === line ? prepared : null;
  prepared = null;
  return narratePiper(engine, match?.chunks ?? chunks, startedAt, match?.first ?? null);
}

/** Stops whatever the narrator is saying and forgets silent work for a screen that went away. */
export function stopNarration(): void {
  prepared = null;
  stopPiper();
}
