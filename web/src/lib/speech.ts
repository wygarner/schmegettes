// Browser speech: the TV reads clues aloud (speechSynthesis) and players answer out loud
// (SpeechRecognition). Recognition runs on the device; only text is sent to the server.

/** How a reading went. Only "ended" means the room heard the clue. */
export type SpeakResult = "ended" | "failed" | "unavailable";

/** Reads text aloud. "failed" usually means the browser blocked sound because the page
 * hasn't been tapped since it loaded; a tap (speak again from the click) fixes it. */
export function speak(text: string): Promise<SpeakResult> {
  return new Promise((resolve) => {
    const synth = typeof window !== "undefined" ? window.speechSynthesis : undefined;
    if (!synth || typeof SpeechSynthesisUtterance === "undefined") {
      resolve("unavailable");
      return;
    }
    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1;
    utterance.onend = () => resolve("ended");
    utterance.onerror = () => resolve("failed");
    synth.speak(utterance);
  });
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
  /** Called once, with the best transcript ("" when nothing was heard). */
  onFinal?: (text: string) => void;
}

type RecognitionResultList = ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;

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
  rec.maxAlternatives = 1;

  let transcript = "";
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
    transcript = Array.from(e.results)
      .map((r) => r[0]?.transcript ?? "")
      .join("")
      .trim();
    recognizer.onInterim?.(transcript);
  };
  const finish = () => {
    if (done) return;
    done = true;
    recognizer.onFinal?.(transcript);
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
