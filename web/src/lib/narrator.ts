// Every narrated line goes through narrate(), in the host's Schmegettes voice. The device's
// built-in voices are never used. Rules: docs/product-docs/features/gameplay/feature-brief.md,
// "The narrator's voice".
//
// - A line whose first audio hasn't started PIPER_START_TIMEOUT_MS after narrate() was called,
//   or that fails, is skipped: the text stays on screen and the server's timer moves on.
//   The next line tries the voice again.
// - A voice that becomes ready mid-game (after a reload) is used from the next line on.

import { narratorChoice } from "./narratorVoice";
import { audioContext } from "./piper/audio";
import { type Audio, type PiperEngine, readyEngine } from "./piper/engine";
import { splitSentences } from "./piper/sentences";
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

async function narratePiper(engine: PiperEngine, text: string, startedAt: number): Promise<NarrateResult> {
  const ctx = audioContext();
  if (!ctx) return "skipped";
  if (ctx.state !== "running") {
    const resumed = ctx.resume().catch(() => undefined); // inside the tap, when there is one
    await within(resumed, RESUME_TIMEOUT_MS);
    if ((ctx.state as AudioContextState) !== "running") return "failed";
  }

  const run: Run = { stopped: false, sources: [] };
  current = run;
  const sentences = splitSentences(text);
  let at = 0;
  const play = (audio: Audio): Promise<void> => {
    const buffer = ctx.createBuffer(1, audio.samples.length, audio.sampleRate);
    buffer.getChannelData(0).set(audio.samples);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    const start = Math.max(at, ctx.currentTime);
    source.start(start);
    at = start + buffer.duration;
    run.sources.push(source);
    return new Promise((resolve) => {
      source.onended = () => resolve();
    });
  };

  let first: Audio | typeof TIMEOUT;
  try {
    first = await within(
      engine.synthesize(sentences[0] ?? text),
      PIPER_START_TIMEOUT_MS - (performance.now() - startedAt),
    );
  } catch {
    return "skipped";
  }
  if (run.stopped) return "stopped";
  if (first === TIMEOUT) return "skipped";

  // Play each sentence while the next one is generated, back to back.
  let ended = play(first);
  for (let i = 1; i < sentences.length; i++) {
    let next: Audio;
    try {
      next = await engine.synthesize(sentences[i] ?? "");
    } catch {
      await ended;
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
  const engine = readyEngine(narratorChoice().id);
  if (!engine) return "skipped";
  return narratePiper(engine, spokenText(text), startedAt);
}

/** Stops whatever the narrator is saying. */
export function stopNarration(): void {
  stopPiper();
}
