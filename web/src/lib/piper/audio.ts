// One AudioContext for the narrator. iOS starts it suspended until a tap resumes it, so the
// host screen's first tap (unlockSpeech) resumes it along with speech synthesis.
//
// The silent switch: iOS plays Web Audio as "ambient" sound, which the ring/silent switch
// mutes. The narrator must be heard anyway (gameplay feature brief, "Plays through the
// silent switch"), so the page asks for the "playback" audio session, as a video would.
// Safari before 16.4 has no navigator.audioSession; there the narrator's output goes through
// an <audio> element instead, because media elements play through the switch.

let ctx: AudioContext | null = null;
let bridge: { node: MediaStreamAudioDestinationNode; element: HTMLAudioElement } | null = null;

/** Asks iOS for media playback, so the silent switch doesn't mute the narrator. */
export function ensurePlaybackSession(): void {
  try {
    const session = typeof navigator === "undefined" ? undefined : navigator.audioSession;
    if (session && session.type !== "playback") session.type = "playback";
  } catch {
    // Not allowed right now: the next tap tries again.
  }
}

/**
 * Call after the microphone stops. Recognition switches the session to play-and-record;
 * this puts it back to playback. Never call it while a recognizer is listening.
 */
export function restorePlaybackSession(): void {
  ensurePlaybackSession();
}

export function audioContext(): AudioContext | null {
  if (ctx) return ctx;
  if (typeof AudioContext === "undefined") return null;
  ensurePlaybackSession();
  try {
    ctx = new AudioContext();
  } catch {
    return null;
  }
  return ctx;
}

/** iPhone, iPod, or an iPad (which reports itself as a Mac with a touch screen). */
export function isIOS(nav: Pick<Navigator, "userAgent" | "maxTouchPoints"> = navigator): boolean {
  return /iPad|iPhone|iPod/.test(nav.userAgent) || (/Macintosh/.test(nav.userAgent) && nav.maxTouchPoints > 1);
}

function needsBridge(): boolean {
  return typeof navigator !== "undefined" && !navigator.audioSession && isIOS();
}

/** Where narrated audio goes: the speakers, or the <audio> bridge on older iOS. */
export function narratorOutput(c: AudioContext): AudioNode {
  if (!needsBridge() || typeof c.createMediaStreamDestination !== "function") return c.destination;
  if (!bridge) {
    try {
      const node = c.createMediaStreamDestination();
      const element = new Audio();
      element.srcObject = node.stream;
      bridge = { node, element };
    } catch {
      return c.destination;
    }
  }
  return bridge.node;
}

/** Call from a tap. */
export function unlockAudio(): void {
  ensurePlaybackSession();
  const c = audioContext();
  if (c && c.state !== "running") void c.resume().catch(() => undefined);
  if (c && needsBridge()) {
    narratorOutput(c);
    void bridge?.element.play().catch(() => undefined);
  }
}

/** Tests only. */
export function setAudioContextForTest(c: AudioContext | null): void {
  ctx = c;
  bridge = null;
}
