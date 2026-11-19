// Every narrated line goes through narrate(): it reads with the host's Schmegettes voice when
// that voice is ready, else with the best voice built into the device. Rules:
// docs/product-docs/features/gameplay/feature-brief.md, "The narrator's voice".
//
// - A line whose first audio hasn't started PIPER_START_TIMEOUT_MS after narrate() was called
//   (or that fails) is read with the built-in voice instead, and counts as a miss.
// - MAX_MISSES misses in a row: the built-in voice reads for the rest of the game, so the room
//   doesn't hear the voice switch back and forth.
// - A voice that becomes ready mid-game is used from the next line on, never mid-line.

import { narratorChoice } from "./narratorVoice";
import { audioContext, narratorOutput } from "./piper/audio";
import { type Audio, type PiperEngine, readyEngine } from "./piper/engine";
import { splitSentences } from "./piper/sentences";
import { type SpeakResult, speak, spokenText, stopSpeaking } from "./speech";

/** "stopped": the line was cut off on purpose (stopNarration); nothing to report. */
export type NarrateResult = SpeakResult | "stopped";

export const PIPER_START_TIMEOUT_MS = 1500;
export const MAX_MISSES = 2;
/** How long to wait for iOS to resume audio before treating sound as blocked. */
const RESUME_TIMEOUT_MS = 500;

let misses = 0;
let degraded = false;

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

type PiperOutcome = { kind: "done"; result: NarrateResult } | { kind: "missed"; rest: string };

async function narratePiper(engine: PiperEngine, text: string, startedAt: number): Promise<PiperOutcome> {
  const ctx = audioContext();
  if (!ctx) return { kind: "missed", rest: text };
  if (ctx.state !== "running") {
    const resumed = ctx.resume().catch(() => undefined); // inside the tap, when there is one
    await within(resumed, RESUME_TIMEOUT_MS);
    if ((ctx.state as AudioContextState) !== "running") return { kind: "done", result: "failed" };
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
    source.connect(narratorOutput(ctx));
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
    return { kind: "missed", rest: text };
  }
  if (run.stopped) return { kind: "done", result: "stopped" };
  if (first === TIMEOUT) return { kind: "missed", rest: text };

  // Play each sentence while the next one is generated, back to back.
  let ended = play(first);
  for (let i = 1; i < sentences.length; i++) {
    let next: Audio;
    try {
      next = await engine.synthesize(sentences[i] ?? "");
    } catch {
      await ended;
      if (run.stopped) return { kind: "done", result: "stopped" };
      return { kind: "missed", rest: sentences.slice(i).join(" ") };
    }
    if (run.stopped) return { kind: "done", result: "stopped" };
    ended = play(next);
  }
  await ended;
  if (current === run) current = null;
  return { kind: "done", result: run.stopped ? "stopped" : "ended" };
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
  const choice = narratorChoice();
  const engine = choice.kind === "piper" && !degraded ? readyEngine(choice.id) : null;
  if (!engine) return speak(line);

  const outcome = await narratePiper(engine, line, startedAt);
  if (outcome.kind === "done") {
    if (outcome.result === "ended") misses = 0;
    return outcome.result;
  }
  misses += 1;
  if (misses >= MAX_MISSES) degraded = true;
  return speak(outcome.rest);
}

/** Stops whatever the narrator is saying, in either voice. */
export function stopNarration(): void {
  stopPiper();
  stopSpeaking();
}

/** A new game starts with the Schmegettes voice again, if it's ready. */
export function resetNarrationForGame(): void {
  misses = 0;
  degraded = false;
}

/** Tests only. */
export function narrationState(): { misses: number; degraded: boolean } {
  return { misses, degraded };
}
