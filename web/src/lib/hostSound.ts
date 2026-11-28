// Keeps the host device's sound on during a game, and tells the server when it can't
// (host_sound), so the game waits instead of playing on in silence. Rules:
// docs/product-docs/features/sound-effects/feature-brief.md ("Sound is required on the host
// device") and tasks GH-330.
//
// Sound stops when the page is hidden (another app, the lock screen) or the phone interrupts
// the AudioContext (a call, Siri, an alarm). On the way back the context is resumed at once;
// browsers often refuse that outside a tap, and then the host has to tap.

import { track } from "./faro";

/** How long to wait for the context to resume on its own before asking for a tap. */
export const RESUME_WAIT_MS = 500;

export type SoundOffCause = "hidden" | "resume_failed" | "interrupted" | "narrator_failed";

export interface HostSoundDeps {
  context: () => AudioContext | null;
  doc?: Pick<Document, "visibilityState" | "addEventListener" | "removeEventListener">;
  win?: Pick<Window, "addEventListener" | "removeEventListener">;
  /** Sends host_sound to the server. */
  send: (on: boolean) => void;
  /** Shows or hides the "Tap to turn on sound" overlay. */
  onBlocked: (blocked: boolean) => void;
  waitMs?: number;
}

export interface HostSound {
  /** Starts watching; returns the function that stops. */
  start(): () => void;
  /** Reports the current state again, even if unchanged (after a reconnect). */
  resync(): Promise<void>;
  /** A narrator line failed for lack of sound. */
  fail(cause?: SoundOffCause): void;
  /** The host tapped the overlay. Call it inside the tap handler. */
  tap(): Promise<boolean>;
}

const running = (ctx: AudioContext) => (ctx.state as string) === "running";

export function createHostSound(deps: HostSoundDeps): HostSound {
  const doc = deps.doc ?? document;
  const win = deps.win ?? window;
  const waitMs = deps.waitMs ?? RESUME_WAIT_MS;
  // A function, so a check after an await reads the state again.
  const hidden = () => doc.visibilityState === "hidden";
  let reported: boolean | undefined;
  let blocked = false;

  const setBlocked = (b: boolean) => {
    if (blocked === b) return;
    blocked = b;
    deps.onBlocked(b);
  };

  const report = (on: boolean, detail: Record<string, string>, force = false) => {
    if (reported === on && !force) return;
    reported = on;
    deps.send(on);
    track(on ? "host_sound_on" : "host_sound_off", detail);
  };

  const off = (cause: SoundOffCause, force = false) => {
    report(false, { cause }, force);
  };

  /** Brings sound back without a tap if the browser allows it, else asks for one. */
  const check = async (cause: SoundOffCause, force = false) => {
    if (hidden()) {
      off("hidden", force);
      return;
    }
    const ctx = deps.context();
    if (!ctx) {
      // No Web Audio at all: nothing to enforce, and pausing would never end.
      setBlocked(false);
      report(true, { via: "auto" }, force);
      return;
    }
    if (!running(ctx)) {
      const resumed = ctx.resume().catch(() => undefined);
      await Promise.race([resumed, new Promise((r) => setTimeout(r, waitMs))]);
    }
    if (hidden()) {
      off("hidden", force);
      return;
    }
    if (running(ctx)) {
      setBlocked(false);
      report(true, { via: "auto" }, force);
    } else {
      setBlocked(true);
      off(cause, force);
    }
  };

  return {
    start() {
      const onVisibility = () => void check("resume_failed");
      const onState = () => {
        const ctx = deps.context();
        if (ctx && !running(ctx) && !hidden()) void check("interrupted");
      };
      doc.addEventListener("visibilitychange", onVisibility);
      win.addEventListener("pageshow", onVisibility);
      const ctx = deps.context();
      ctx?.addEventListener("statechange", onState);
      void check("resume_failed");
      return () => {
        doc.removeEventListener("visibilitychange", onVisibility);
        win.removeEventListener("pageshow", onVisibility);
        ctx?.removeEventListener("statechange", onState);
      };
    },
    resync: () => check("resume_failed", true),
    fail(cause = "narrator_failed") {
      setBlocked(true);
      off(cause);
    },
    async tap() {
      const ctx = deps.context();
      if (!ctx) {
        setBlocked(false);
        report(true, { via: "tap" });
        return true;
      }
      // resume() is called synchronously inside the tap: that's what the browser needs.
      const resumed = ctx.resume().catch(() => undefined);
      await Promise.race([resumed, new Promise((r) => setTimeout(r, waitMs))]);
      if (!running(ctx)) return false;
      setBlocked(false);
      report(true, { via: "tap" });
      return true;
    },
  };
}
