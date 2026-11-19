// Which Schmegettes voice the TV narrator uses: the one the host picked in the lobby, kept on
// this device only. The device's built-in voices are never used. Rules:
// docs/product-docs/features/gameplay/feature-brief.md, "The narrator's voice".

import { DEFAULT_PIPER_VOICE, isPiperVoiceId, type PiperVoiceId } from "./piper/voices";

// The host's pick, kept on this device. Storage can be missing or blocked (private windows,
// previews), so every access is guarded and a blocked read means "nothing saved".
const KEY = "schmegettes.narratorVoice";

export function getSavedVoice(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/** What the narrator reads with: always a Schmegettes (Piper) voice. */
export type NarratorChoice = { kind: "piper"; id: PiperVoiceId };

const PIPER_PREFIX = "piper:";

/** The stored value for a Schmegettes voice. */
export function piperChoiceValue(id: PiperVoiceId): string {
  return `${PIPER_PREFIX}${id}`;
}

/**
 * The host's choice on this device. Nothing saved, an unknown voice, or a built-in voice
 * saved before the device voices were removed: the default Schmegettes voice, silently.
 */
export function narratorChoice(): NarratorChoice {
  const saved = getSavedVoice();
  const id = saved?.startsWith(PIPER_PREFIX) ? saved.slice(PIPER_PREFIX.length) : "";
  return { kind: "piper", id: isPiperVoiceId(id) ? id : DEFAULT_PIPER_VOICE };
}

export function saveVoice(value: string): void {
  try {
    window.localStorage.setItem(KEY, value);
  } catch {
    // Not remembering the voice is fine: the default is used next time.
  }
}
