// Browser speech: the TV reads clues aloud (speechSynthesis) and players answer out loud
// (SpeechRecognition). Recognition runs on the device; only text is sent to the server.

import { chooseVoice, currentVoices, getSavedVoice } from "./narratorVoice";
import { unlockAudio } from "./piper/audio";

/** How a reading went. Only "ended" means the room heard the clue. */
export type SpeakResult = "ended" | "failed" | "unavailable";

/** How long speech may take to start before it counts as blocked. */
export const SPEECH_START_TIMEOUT_MS = 2500;

/**
 * Reads text aloud. "failed" usually means the browser blocked sound because the page
 * hasn't been tapped since it loaded; a tap (speak again from the click) fixes it. iOS
 * Safari blocks it silently (no error, no end), so speech that still hasn't started after
 * SPEECH_START_TIMEOUT_MS counts as "failed" too. Safari doesn't always fire `start`, so
 * speech also counts as started once a word boundary fires or the browser says it's
 * speaking; speech that is playing is never cut off.
 *
 * The narrator's voice is `voice` (the lobby's sample) or the one chosen for this device,
 * looked up on every call so a late voice list or a reload picks it up. With no voices yet,
 * it speaks at once with the browser default; it never waits for the list.
 */
export function speak(text: string, voice?: SpeechSynthesisVoice): Promise<SpeakResult> {
  return new Promise((resolve) => {
    const synth = typeof window !== "undefined" ? window.speechSynthesis : undefined;
    if (!synth || typeof SpeechSynthesisUtterance === "undefined") {
      resolve("unavailable");
      return;
    }
    // Cancelling right before speaking makes Safari drop the new utterance's events, so only
    // cancel when something is actually playing or queued.
    if (synth.speaking || synth.pending) synth.cancel();
    let started = false;
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const done = (result: SpeakResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1; // every voice at its normal pace: the server's reading estimate assumes it
    const narrator = voice ?? chooseVoice(currentVoices(), getSavedVoice());
    if (narrator) {
      utterance.voice = narrator;
      utterance.lang = narrator.lang;
    }
    utterance.onstart = () => {
      started = true;
    };
    utterance.onboundary = () => {
      started = true;
    };
    utterance.onend = () => done("ended");
    utterance.onerror = () => done("failed");
    synth.speak(utterance);
    timer = setTimeout(() => {
      if (started || synth.speaking) return;
      synth.cancel();
      done("failed");
    }, SPEECH_START_TIMEOUT_MS);
  });
}

let unlocked = false;

/**
 * Call from a tap. iOS only lets a page speak once speech has been started inside a user
 * gesture; a silent utterance from the first tap unlocks narration for the rest of the visit.
 */
export function unlockSpeech() {
  unlockAudio(); // the Schmegettes voices play through Web Audio, which iOS also unlocks on a tap
  if (unlocked || typeof window === "undefined" || !window.speechSynthesis) return;
  if (typeof SpeechSynthesisUtterance === "undefined") return;
  try {
    const silent = new SpeechSynthesisUtterance(" ");
    silent.volume = 0;
    window.speechSynthesis.speak(silent);
    unlocked = true;
  } catch {
    // try again on the next tap
  }
}

/**
 * Said on the correct-response screen. After a clue someone got right: "Correct, …"; after
 * one nobody got: "Sorry, we were looking for …". Final is neutral, because finalists can
 * be split.
 */
export function correctResponseAnnouncement(response: string, outcome: "right" | "missed" | "final"): string {
  if (outcome === "right") return `Correct, ${response} is the right answer.`;
  if (outcome === "missed") return `Sorry, we were looking for ${response}.`;
  return `The correct response is ${response}.`;
}

/** Said when a Daily Double is revealed. */
export const DAILY_DOUBLE_INTRO = "It's a Daily Double.";

/** Said before a Daily Double clue: "For 1000, here's the clue." Keep in sync with
 * play.DailyDoubleAnnouncement in game/internal/play/wager.go. */
export function dailyDoubleAnnouncement(wager: number): string {
  return `For ${wager}, here's the clue.`;
}

/** Said when the Final category appears. Keep in sync with play.FinalAnnouncement. */
export function finalAnnouncement(category: string): string {
  return `The Final Schmegettes category is: ${category}.`;
}

export function stopSpeaking() {
  try {
    window.speechSynthesis?.cancel();
  } catch {
    // nothing to stop
  }
}

/** A one-shot listener: interim text while the player talks, then one final result. */
export interface Recognizer {
  start(): void;
  stop(): void;
  abort(): void;
  onInterim?: (text: string) => void;
  /**
   * Called once, with the best transcript ("" when nothing was heard) and the recognizer's
   * other guesses, most likely first (at most MAX_ALTERNATIVES, none equal to text).
   */
  onFinal?: (text: string, alternatives?: string[]) => void;
}

/** How many other guesses an answer carries (SubmitAnswer.alternatives). */
export const MAX_ALTERNATIVES = 4;

/**
 * The best transcript and the other guesses. Guess k joins each result's k-th alternative,
 * or its best one when that result has fewer.
 */
export function transcripts(results: RecognitionResultList): { text: string; alternatives: string[] } {
  const list = Array.from(results);
  const guess = (k: number) =>
    list
      .map((r) => r[k]?.transcript ?? r[0]?.transcript ?? "")
      .join("")
      .trim();
  const text = guess(0);
  const most = Math.max(0, ...list.map((r) => r.length));
  const alternatives: string[] = [];
  for (let k = 1; k < most && alternatives.length < MAX_ALTERNATIVES; k++) {
    const g = guess(k);
    if (g && g !== text && !alternatives.includes(g)) alternatives.push(g);
  }
  return { text, alternatives };
}

export type RecognitionResultList = ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;

interface BrowserRecognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: { results: RecognitionResultList }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
}

type RecognitionConstructor = new () => BrowserRecognition;

function browserRecognition(): RecognitionConstructor | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

function createBrowserRecognizer(): Recognizer | null {
  const Recognition = browserRecognition();
  if (!Recognition) return null;
  const rec = new Recognition();
  rec.lang = "en-US";
  rec.continuous = false; // ends on its own when the player goes quiet
  rec.interimResults = true;
  rec.maxAlternatives = MAX_ALTERNATIVES + 1;

  let transcript = "";
  let alternatives: string[] = [];
  let done = false;
  const recognizer: Recognizer = {
    start: () => rec.start(),
    stop: () => rec.stop(),
    abort: () => {
      done = true;
      rec.abort();
    },
  };
  rec.onresult = (e) => {
    ({ text: transcript, alternatives } = transcripts(e.results));
    recognizer.onInterim?.(transcript);
  };
  const finish = () => {
    if (done) return;
    done = true;
    recognizer.onFinal?.(transcript, alternatives);
  };
  rec.onend = finish;
  rec.onerror = finish;
  return recognizer;
}

let factory: () => Recognizer | null = createBrowserRecognizer;

/** Makes a recognizer, or null when this browser can't recognize speech. */
export function createRecognizer(): Recognizer | null {
  return factory();
}

export function recognitionSupported(): boolean {
  return factory === createBrowserRecognizer ? browserRecognition() !== undefined : true;
}

/** Tests swap in a fake recognizer. */
export function setRecognizerFactory(make: (() => Recognizer | null) | null) {
  factory = make ?? createBrowserRecognizer;
}

export type MicState = "unknown" | "granted" | "denied" | "unsupported";

/** Asks for the microphone. Call from a tap: iOS only prompts from a user gesture. */
export async function requestMicrophone(): Promise<MicState> {
  if (!navigator.mediaDevices?.getUserMedia) return "unsupported";
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    for (const track of stream.getTracks()) track.stop();
    return "granted";
  } catch {
    return "denied";
  }
}

/** Clue text as it should sound: "&" is read as "and" (the dataset writes "Lewis & Clark"). */
export function spokenText(text: string): string {
  return text.replace(/\s*&(?:amp;)?\s*/g, " and ");
}
