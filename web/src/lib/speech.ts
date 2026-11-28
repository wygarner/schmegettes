// Browser speech: players answer out loud (SpeechRecognition), and the lines the narrator
// says. Recognition runs on the device; only text is sent to the server. The narrator itself
// is in narrator.ts (Schmegettes voices only; the device's speech synthesis is never used).

import { restorePlaybackSession } from "./piper/audio";

export { spokenText } from "./spokenText";

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

/**
 * A listener: interim text while the player talks, then one final result when stop() is
 * called. A pause doesn't end it: when the browser stops listening on its own, it starts
 * again and keeps what was heard (lenient-judging).
 */
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
  /** The browser started listening: every permission it needed was granted. */
  onStart?: () => void;
  /** The browser refused: the microphone or speech recognition is blocked for this site. */
  onDenied?: () => void;
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
  onstart: (() => void) | null;
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

/** How many times a recognizer starts again after the browser stops it on its own. */
export const MAX_RESTARTS = 8;

const join = (a: string, b: string) => [a, b].filter(Boolean).join(" ");

function createBrowserRecognizer(): Recognizer | null {
  const Recognition = browserRecognition();
  if (!Recognition) return null;
  const rec = new Recognition();
  rec.lang = "en-US";
  rec.continuous = true; // keep listening through a pause; stop() ends it
  rec.interimResults = true;
  rec.maxAlternatives = MAX_ALTERNATIVES + 1;

  // heard: what earlier listening sessions heard, before the browser stopped on its own.
  let heard = "";
  let transcript = "";
  let alternatives: string[] = [];
  let stopping = false;
  let denied = false;
  let started = false;
  let restarts = 0;
  let done = false;
  const recognizer: Recognizer = {
    start: () => rec.start(),
    stop: () => {
      stopping = true;
      rec.stop();
    },
    abort: () => {
      done = true;
      rec.abort();
      restorePlaybackSession();
    },
  };
  rec.onresult = (e) => {
    const now = transcripts(e.results);
    transcript = join(heard, now.text);
    alternatives = now.alternatives.map((a) => join(heard, a));
    recognizer.onInterim?.(transcript);
  };
  const finish = () => {
    if (done) return;
    done = true;
    // Listening switched iOS to play-and-record; the narrator needs playback again.
    restorePlaybackSession();
    recognizer.onFinal?.(transcript, alternatives);
  };
  rec.onstart = () => {
    if (started) return; // a restart: the player already knows we're listening
    started = true;
    recognizer.onStart?.();
  };
  rec.onend = () => {
    // The browser stopped on its own (a pause, or its own time limit): listen again.
    if (!stopping && !denied && !done && restarts < MAX_RESTARTS) {
      restarts++;
      heard = transcript;
      try {
        rec.start();
        return;
      } catch {
        // can't start again: finish with what was heard
      }
    }
    finish();
  };
  rec.onerror = (e) => {
    if (e.error === "not-allowed" || e.error === "service-not-allowed") {
      denied = true;
      recognizer.onDenied?.();
    }
    // onend follows and decides whether to listen again.
  };
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

export type MicState = "granted" | "denied" | "unsupported";

/** How long to wait for the browser's answer before taking the microphone as allowed. */
const PERMISSION_WAIT_MS = 15_000;

/**
 * Asks for everything answering needs, from one tap (iOS only prompts from a user gesture):
 * starting a recognizer makes the browser ask for the microphone and, on iPhone, for speech
 * recognition too, so neither prompt can appear mid-game. Listening stops at once.
 */
export function requestAnswerPermissions(): Promise<MicState> {
  const rec = createRecognizer();
  if (!rec) return Promise.resolve("unsupported");
  return new Promise((resolve) => {
    let settled = false;
    const done = (state: MicState) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      rec.onStart = rec.onDenied = rec.onFinal = undefined;
      try {
        rec.abort();
      } catch {
        // already stopped
      }
      resolve(state);
    };
    const timer = setTimeout(() => done("granted"), PERMISSION_WAIT_MS);
    rec.onStart = () => done("granted");
    rec.onDenied = () => done("denied");
    // Ended without a refusal (nothing heard, a network hiccup): the permissions are there.
    rec.onFinal = () => done("granted");
    try {
      rec.start();
    } catch {
      done("denied");
    }
  });
}

/** What the browser says about the microphone without asking: "ask" when it can't tell. */
export async function micPermission(): Promise<"granted" | "denied" | "ask"> {
  try {
    const status = await navigator.permissions?.query({ name: "microphone" as PermissionName });
    if (status?.state === "granted" || status?.state === "denied") return status.state;
  } catch {
    // Not supported for the microphone here.
  }
  return "ask";
}

/** Calls back when the microphone permission changes (turned off in settings mid-game). */
export function onMicPermissionChange(cb: (state: "granted" | "denied" | "ask") => void): () => void {
  let status: PermissionStatus | undefined;
  let stopped = false;
  const handler = () => {
    if (status) cb(status.state === "prompt" ? "ask" : status.state);
  };
  void navigator.permissions
    ?.query({ name: "microphone" as PermissionName })
    .then((s) => {
      if (stopped) return;
      status = s;
      s.addEventListener("change", handler);
    })
    .catch(() => undefined);
  return () => {
    stopped = true;
    status?.removeEventListener("change", handler);
  };
}
