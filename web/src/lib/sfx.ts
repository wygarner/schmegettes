// Sound effects, made in the browser with Web Audio: no audio files, nothing to download or
// fail to load, and original by construction. They share the narrator's AudioContext, so the
// same tap unlocks them. Rules: docs/product-docs/features/sound-effects/feature-brief.md.
//
// Every play*() resolves when its sound ends, or at once when sound isn't running (blocked
// before a tap, no Web Audio): it never rejects, and no game timer waits on it.

import { audioContext, narratorOutput } from "./piper/audio";

/** Effects sit a little under the narrator, so the narrator stays the loudest thing. */
const EFFECTS_GAIN = 0.55;

interface Playing {
  stop: () => void;
}
const playing = new Set<Playing>();

/** How long a sound waits for the context to resume (a phone's first press unlocks it). */
const RESUME_WAIT_MS = 150;

async function running(): Promise<AudioContext | null> {
  const ctx = audioContext();
  if (!ctx) return null;
  if (ctx.state !== "running") {
    const resumed = ctx.resume().catch(() => undefined);
    await Promise.race([resumed, new Promise((r) => setTimeout(r, RESUME_WAIT_MS))]);
  }
  return (ctx.state as AudioContextState) === "running" ? ctx : null;
}

/** An envelope: silence, a quick rise to `peak`, then an exponential fall to near silence. */
function envelope(ctx: AudioContext, out: AudioNode, at: number, attack: number, length: number, peak: number) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(peak, at + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, at + length);
  g.connect(out);
  return g;
}

function tone(
  ctx: AudioContext,
  out: AudioNode,
  o: {
    type: OscillatorType;
    freq: number;
    to?: number;
    at: number;
    attack: number;
    length: number;
    peak: number;
    detune?: number;
  },
): AudioScheduledSourceNode {
  const osc = ctx.createOscillator();
  osc.type = o.type;
  osc.frequency.setValueAtTime(o.freq, o.at);
  if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, o.at + o.length);
  if (o.detune) osc.detune.setValueAtTime(o.detune, o.at);
  osc.connect(envelope(ctx, out, o.at, o.attack, o.length, o.peak));
  osc.start(o.at);
  osc.stop(o.at + o.length + 0.02);
  return osc;
}

function noise(ctx: AudioContext, out: AudioNode, at: number, length: number, peak: number, highpass: number) {
  const buffer = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * length)), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.setValueAtTime(highpass, at);
  src.connect(filter);
  filter.connect(envelope(ctx, out, at, 0.005, length, peak));
  src.start(at);
  src.stop(at + length + 0.02);
  return src;
}

/** Schedules a sound (`build` adds its nodes) and resolves after `length` seconds. */
async function play(
  length: number,
  build: (ctx: AudioContext, out: AudioNode, at: number) => AudioScheduledSourceNode[],
): Promise<void> {
  const ctx = await running();
  if (!ctx) return;
  return new Promise<void>((resolve) => {
    const out = ctx.createGain();
    out.gain.value = EFFECTS_GAIN;
    out.connect(narratorOutput(ctx)); // the narrator's output: plays through the iPhone silent switch
    let nodes: AudioScheduledSourceNode[] = [];
    try {
      nodes = build(ctx, out, ctx.currentTime + 0.01);
    } catch {
      resolve(); // a sound that can't be made is skipped
      return;
    }
    const entry: Playing = {
      stop: () => {
        for (const n of nodes) {
          try {
            n.stop();
          } catch {
            // already stopped
          }
        }
        finish();
      },
    };
    const timer = setTimeout(() => finish(), Math.ceil(length * 1000));
    function finish() {
      clearTimeout(timer);
      playing.delete(entry);
      resolve();
    }
    playing.add(entry);
  });
}

const NOTE = { G4: 392, C5: 523.25, E5: 659.25, G5: 783.99, B5: 987.77, C6: 1046.5, E6: 1318.51 };

/** Before "Correct, …": a bright two-note chime, a fifth apart. */
export function playCorrect(): Promise<void> {
  return play(0.7, (ctx, out, at) => [
    tone(ctx, out, { type: "triangle", freq: NOTE.E5, at, attack: 0.01, length: 0.3, peak: 0.6 }),
    tone(ctx, out, { type: "sine", freq: NOTE.E5 * 2, at, attack: 0.01, length: 0.2, peak: 0.15 }),
    tone(ctx, out, { type: "triangle", freq: NOTE.B5, at: at + 0.15, attack: 0.01, length: 0.5, peak: 0.6 }),
    tone(ctx, out, { type: "sine", freq: NOTE.B5 * 2, at: at + 0.15, attack: 0.01, length: 0.3, peak: 0.12 }),
  ]);
}

/** Before "Sorry, we were looking for …": a low, soft tone that sinks. */
export function playTimesUp(): Promise<void> {
  return play(0.75, (ctx, out, at) => [
    tone(ctx, out, { type: "triangle", freq: 220, to: 160, at, attack: 0.06, length: 0.7, peak: 0.55 }),
    tone(ctx, out, { type: "sine", freq: 110, to: 80, at, attack: 0.06, length: 0.7, peak: 0.35 }),
  ]);
}

/** With "DAILY DOUBLE": a rising arpeggio over a shimmer. */
export function playDailyDouble(): Promise<void> {
  const notes = [NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6, NOTE.E6];
  return play(1.4, (ctx, out, at) => [
    ...notes.map((freq, i) =>
      tone(ctx, out, { type: "triangle", freq, at: at + i * 0.1, attack: 0.01, length: 0.5 + i * 0.12, peak: 0.45 }),
    ),
    noise(ctx, out, at + 0.35, 1.0, 0.08, 6000),
  ]);
}

/** With "Double Schmegettes!": a short brassy fanfare. */
export function playDoubleRound(): Promise<void> {
  const notes: Array<[number, number, number]> = [
    [NOTE.G4, 0, 0.22],
    [NOTE.C5, 0.24, 0.22],
    [NOTE.E5, 0.48, 1.1],
  ];
  return play(1.65, (ctx, out, at) => {
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(2200, at);
    filter.connect(out);
    return notes.flatMap(([freq, start, length]) =>
      [-8, 8].map((detune) =>
        tone(ctx, filter, { type: "sawtooth", freq, at: at + start, attack: 0.03, length, peak: 0.28, detune }),
      ),
    );
  });
}

/** A buzzer press: a short, solid thunk on the pressing device. */
export function playBuzz(): Promise<void> {
  return play(0.18, (ctx, out, at) => [
    tone(ctx, out, { type: "sine", freq: 140, to: 55, at, attack: 0.004, length: 0.16, peak: 0.9 }),
    noise(ctx, out, at, 0.03, 0.25, 1500),
  ]);
}

/** Stops every effect that's playing (the host device paused). */
export function stopEffects(): void {
  for (const p of [...playing]) p.stop();
}
