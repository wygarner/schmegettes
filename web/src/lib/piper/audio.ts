// One AudioContext for the narrator. iOS starts it suspended until a tap resumes it, so the
// host screen's first tap (unlockSpeech) resumes it along with speech synthesis.

let ctx: AudioContext | null = null;

export function audioContext(): AudioContext | null {
  if (ctx) return ctx;
  if (typeof AudioContext === "undefined") return null;
  try {
    ctx = new AudioContext();
  } catch {
    return null;
  }
  return ctx;
}

/** Call from a tap. */
export function unlockAudio(): void {
  const c = audioContext();
  if (c && c.state !== "running") void c.resume().catch(() => undefined);
}

/** Tests only. */
export function setAudioContextForTest(c: AudioContext | null): void {
  ctx = c;
}
