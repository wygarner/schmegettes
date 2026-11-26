// Every narrated line goes through narrate(), in the host's Schmegettes voice. The device's
// built-in voices are never used. Rules: docs/product-docs/features/gameplay/feature-brief.md,
// "The narrator's voice".
//
// - prepareNarration() queues every punctuation-shaped piece during the silent reveal. The one
//   Piper worker generates them sequentially; narrate() is the only function that plays them.
// - Piper's padding is trimmed between pieces. Punctuation cuts get a fixed comma-sized pause;
//   the first piece's one allowed word-boundary cut gets continuing intonation and no gap.
// - A line whose first audio hasn't started PIPER_START_TIMEOUT_MS after playback was requested,
//   or that fails, is skipped: the text stays on screen and the server's timer moves on.
// - A voice that becomes ready mid-game (after a reload) is used from the next line on.

import { e2eActive } from "./e2eFlag";
import { track } from "./faro";
import { narratorChoice } from "./narratorVoice";
import { audioContext, narratorOutput, trimSilence } from "./piper/audio";
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
  audio: Promise<Audio | null>[];
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

const ENDS_WITH_PUNCTUATION = /[,;:—–.!?…](?:["')\]]*)$/;
const PIECE_GAP_SECONDS = 0.12;

function synthesisText(chunk: string, index: number, count: number): string {
  return index === 0 && count > 1 && !ENDS_WITH_PUNCTUATION.test(chunk) ? `${chunk},` : chunk;
}

/** Queue all work immediately, while preserving the worker's required sequential order. */
function prepareChunks(engine: PiperEngine, chunks: string[]): Promise<Audio | null>[] {
  let previous = Promise.resolve<Audio | null>(null);
  return chunks.map((chunk, index) => {
    const next = previous.then(() => synthesize(engine, synthesisText(chunk, index, chunks.length)));
    previous = next;
    return next;
  });
}

/** Starts generating every line piece without touching the audio session or playing it. */
export function prepareNarration(text: string): void {
  if (e2eActive()) return;
  const line = spokenText(text);
  const chunks = narrationChunks(line);
  const { id } = narratorChoice();
  const engine = readyEngine(id);
  if (!engine || chunks.length === 0) {
    prepared = null;
    return;
  }
  if (prepared?.voiceId === id && prepared.engine === engine && prepared.text === line) return;
  prepared = { voiceId: id, engine, text: line, chunks, audio: prepareChunks(engine, chunks) };
}

/**
 * Reports a skipped line to Faro (narrator_line_skipped) and returns "skipped". Carries the
 * reason and the voice, never the line's text.
 */
function skipped(reason: string, voice: string): "skipped" {
  track("narrator_line_skipped", { reason, voice });
  return "skipped";
}

async function narratePiper(
  engine: PiperEngine,
  voice: string,
  chunks: string[],
  startedAt: number,
  preparedAudio: Promise<Audio | null>[] | null,
): Promise<NarrateResult> {
  const run: Run = { stopped: false, sources: [] };
  current = run;
  const ctx = audioContext();
  if (!ctx) {
    if (current === run) current = null;
    return skipped("no_audio_context", voice);
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
  const play = (audio: Audio, index: number): Promise<void> => {
    const isLast = index === chunks.length - 1;
    const samples = isLast ? audio.samples : trimSilence(audio.samples);
    const buffer = ctx.createBuffer(1, samples.length, audio.sampleRate);
    buffer.getChannelData(0).set(samples);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(narratorOutput(ctx));
    const start = Math.max(at, ctx.currentTime);
    source.start(start);
    const punctuationGap = !isLast && ENDS_WITH_PUNCTUATION.test(chunks[index] ?? "") ? PIECE_GAP_SECONDS : 0;
    at = start + buffer.duration + punctuationGap;
    run.sources.push(source);
    return new Promise((resolve) => {
      source.onended = () => resolve();
    });
  };

  let first: Audio | typeof TIMEOUT | null;
  const audio = preparedAudio ?? prepareChunks(engine, chunks);
  try {
    first = await within(audio[0] ?? Promise.resolve(null), PIPER_START_TIMEOUT_MS - (performance.now() - startedAt));
  } catch {
    if (current === run) current = null;
    return skipped("synthesis_failed", voice);
  }
  if (run.stopped) return "stopped";
  if (first === TIMEOUT || first === null) {
    if (current === run) current = null;
    return skipped(first === TIMEOUT ? "start_timeout" : "synthesis_failed", voice);
  }

  let ended = play(first, 0);
  for (let i = 1; i < chunks.length; i++) {
    const next = await audio[i];
    if (!next) {
      await ended;
      if (current === run) current = null;
      return run.stopped ? "stopped" : skipped("chunk_failed", voice);
    }
    if (run.stopped) return "stopped";
    ended = play(next, i);
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
  // E2E mode: the room "heard" every line at once (testing-strategy.md, End-to-end).
  if (e2eActive()) return "ended";
  const startedAt = performance.now();
  stopPiper();
  const line = spokenText(text);
  const chunks = narrationChunks(line);
  const { id } = narratorChoice();
  const engine = readyEngine(id);
  if (chunks.length === 0) return "skipped"; // nothing to say is not a failure
  if (!engine) return skipped("voice_not_ready", id);
  const match = prepared?.voiceId === id && prepared.engine === engine && prepared.text === line ? prepared : null;
  prepared = null;
  return narratePiper(engine, id, match?.chunks ?? chunks, startedAt, match?.audio ?? null);
}

/** Stops whatever the narrator is saying and forgets silent work for a screen that went away. */
export function stopNarration(): void {
  prepared = null;
  stopPiper();
}
