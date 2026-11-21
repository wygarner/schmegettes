// Turns E2E mode on for this tab. See e2eFlag.ts for when it's allowed.
import { e2eAllowed, setE2EActive } from "./e2eFlag";
import { type Recognizer, setRecognizerFactory } from "./speech";

const KEY = "schmegettes.e2e";

/** E2E mode is on when allowed and the tab was opened with ?e2e=1 (kept across reloads). */
export function e2eEnabled(): boolean {
  if (!e2eAllowed()) return false;
  try {
    if (new URLSearchParams(window.location.search).get("e2e") === "1") sessionStorage.setItem(KEY, "1");
    return sessionStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

let listening: ScriptedRecognizer | null = null;

/** A recognizer the test drives: say(text) ends the current listen with that transcript. */
class ScriptedRecognizer implements Recognizer {
  onInterim?: (text: string) => void;
  onFinal?: (text: string, alternatives?: string[]) => void;
  onStart?: () => void;
  onDenied?: () => void;

  start(): void {
    listening = this;
    queueMicrotask(() => this.onStart?.());
  }

  stop(): void {
    // Stopped before anything was said: the browser ends with an empty transcript.
    if (listening !== this) return;
    listening = null;
    this.onFinal?.("", []);
  }

  abort(): void {
    if (listening === this) listening = null;
  }
}

/** Ends the current listen with `text`. False when nothing is listening. */
export function say(text: string): boolean {
  const rec = listening;
  if (!rec) return false;
  listening = null;
  rec.onInterim?.(text);
  rec.onFinal?.(text, []);
  return true;
}

/** Installs E2E mode if this tab asked for it. Call once, before the app renders. */
export function installE2E(): boolean {
  if (!e2eEnabled()) return false;
  setE2EActive(true);
  setRecognizerFactory(() => new ScriptedRecognizer());
  window.__e2e = { say, listening: () => listening !== null };
  return true;
}

/** Undoes installE2E (tests). */
export function resetE2EForTest(): void {
  setE2EActive(false);
  setRecognizerFactory(null);
  listening = null;
  delete window.__e2e;
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // no storage
  }
}

declare global {
  interface Window {
    __e2e?: { say: (text: string) => boolean; listening: () => boolean };
  }
}
