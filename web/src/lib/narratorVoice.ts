// Which voice the TV narrator uses: the best English voice installed on the host device,
// or the one the host picked in the lobby (kept on this device only). Rules:
// docs/product-docs/features/gameplay/feature-brief.md, "The narrator's voice".

import { useEffect, useState } from "react";
import { DEFAULT_PIPER_VOICE, isPiperVoiceId, type PiperVoiceId } from "./piper/voices";

/** The parts of a browser voice the ranking reads. */
export type Voice = Pick<SpeechSynthesisVoice, "name" | "lang" | "voiceURI" | "default">;

export type VoiceQuality = "premium" | "enhanced" | "standard";

/**
 * Apple's novelty voices: they sing, whisper, or add effects, can't read a clue in the time
 * the server allows, and are hard to follow. Never listed or chosen.
 */
export const NOVELTY_VOICES: ReadonlySet<string> = new Set([
  "albert",
  "bad news",
  "bahh",
  "bells",
  "boing",
  "bubbles",
  "cellos",
  "good news",
  "jester",
  "organ",
  "superstar",
  "trinoids",
  "whisper",
  "wobble",
  "zarvox",
]);

const QUALITY_SUFFIX = /\s*\((premium|enhanced)\)\s*$/i;

/** The voice's name without a "(Premium)" or "(Enhanced)" suffix. */
function baseName(v: Voice): string {
  return v.name.replace(QUALITY_SUFFIX, "").trim();
}

/** "US", "GB", …, or "" when the language has no region. */
function region(v: Voice): string {
  return (v.lang.split(/[-_]/)[1] ?? "").toUpperCase();
}

/**
 * Apple puts the quality in the voice URI (com.apple.voice.premium.en-US.Ava); macOS also
 * puts it in the name ("Ava (Premium)"). The URI wins when it says.
 */
export function voiceQuality(v: Voice): VoiceQuality {
  const fromUri = /(?:^|\.)(premium|enhanced|compact)(?:\.|$)/i.exec(v.voiceURI)?.[1]?.toLowerCase();
  if (fromUri === "premium" || fromUri === "enhanced") return fromUri;
  if (fromUri === "compact") return "standard";
  const fromName = QUALITY_SUFFIX.exec(v.name)?.[1]?.toLowerCase();
  return fromName === "premium" || fromName === "enhanced" ? fromName : "standard";
}

export function isNovelty(v: Voice): boolean {
  return NOVELTY_VOICES.has(baseName(v).toLowerCase());
}

/** English voices the narrator may use: "en-US", "en_GB", …, never a novelty voice. */
export function englishVoices<V extends Voice>(voices: readonly V[]): V[] {
  return voices.filter((v) => /^en(?:[-_]|$)/i.test(v.lang) && !isNovelty(v));
}

function group(v: Voice): number {
  const quality = voiceQuality(v);
  if (quality === "premium") return 0;
  if (quality === "enhanced") return 1;
  return region(v) === "US" ? 2 : 3;
}

/** Best first: Premium, Enhanced, other US English, other English; the device default first in each. */
export function rankVoices<V extends Voice>(voices: readonly V[]): V[] {
  return englishVoices(voices).sort(
    (a, b) => group(a) - group(b) || Number(b.default) - Number(a.default) || a.name.localeCompare(b.name),
  );
}

const REGIONS: Record<string, string> = {
  GB: "UK",
  AU: "Australia",
  IE: "Ireland",
  IN: "India",
  ZA: "South Africa",
  NZ: "New Zealand",
  CA: "Canada",
  SG: "Singapore",
};

/** "Ava (Premium)", "Samantha", "Daniel (UK)", "Karen (Enhanced, Australia)". */
export function voiceLabel(v: Voice): string {
  const quality = voiceQuality(v);
  const r = region(v);
  const notes = [
    quality === "standard" ? "" : quality === "premium" ? "Premium" : "Enhanced",
    r && r !== "US" ? (REGIONS[r] ?? r) : "",
  ].filter(Boolean);
  return notes.length ? `${baseName(v)} (${notes.join(", ")})` : baseName(v);
}

/** The saved voice if it's still usable here, else the best one, else null (browser default). */
export function chooseVoice<V extends Voice>(voices: readonly V[], savedUri: string | null): V | null {
  const usable = englishVoices(voices);
  const saved = savedUri ? usable.find((v) => v.voiceURI === savedUri) : undefined;
  return saved ?? rankVoices(usable)[0] ?? null;
}

/** True when a Premium or Enhanced English voice is installed (no tip needed). */
export function hasNaturalVoice(voices: readonly Voice[]): boolean {
  return englishVoices(voices).some((v) => voiceQuality(v) !== "standard");
}

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

/** What the narrator reads with: a Schmegettes (Piper) voice, or a voice built into the device. */
export type NarratorChoice = { kind: "piper"; id: PiperVoiceId } | { kind: "device"; uri: string };

const PIPER_PREFIX = "piper:";

/** The stored value for a Schmegettes voice; built-in voices store their voiceURI. */
export function piperChoiceValue(id: PiperVoiceId): string {
  return `${PIPER_PREFIX}${id}`;
}

/**
 * The host's choice on this device. Nothing saved means the default Schmegettes voice; a
 * built-in voice saved before Schmegettes voices existed is kept.
 */
export function narratorChoice(): NarratorChoice {
  const saved = getSavedVoice();
  if (saved && !saved.startsWith(PIPER_PREFIX)) return { kind: "device", uri: saved };
  const id = saved?.slice(PIPER_PREFIX.length) ?? "";
  return { kind: "piper", id: isPiperVoiceId(id) ? id : DEFAULT_PIPER_VOICE };
}

export function saveVoice(uri: string): void {
  try {
    window.localStorage.setItem(KEY, uri);
  } catch {
    // Not remembering the voice is fine: the best one is chosen again.
  }
}

/** Where the "download a better voice" tip points, or null when there's no tip. */
export function tipPlatform(): "ios" | "mac" | null {
  if (typeof navigator === "undefined") return null;
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return "ios";
  if (/Macintosh/.test(ua)) return navigator.maxTouchPoints > 1 ? "ios" : "mac"; // iPadOS says Mac
  return null;
}

export function speechSupported(): boolean {
  return typeof window !== "undefined" && !!window.speechSynthesis && typeof SpeechSynthesisUtterance !== "undefined";
}

/** The device's voices right now; empty until the browser has loaded them. */
export function currentVoices(): SpeechSynthesisVoice[] {
  if (!speechSupported()) return [];
  const synth = window.speechSynthesis;
  return typeof synth.getVoices === "function" ? synth.getVoices() : [];
}

/**
 * The device's voices, kept current. Browsers load the list late and announce it with
 * `voiceschanged`; iOS Safari doesn't always, so the first tap reads it again.
 */
export function useNarratorVoices(): { voices: SpeechSynthesisVoice[]; supported: boolean } {
  const supported = speechSupported();
  const [voices, setVoices] = useState(currentVoices);
  useEffect(() => {
    if (!supported) return;
    const synth = window.speechSynthesis;
    const update = () => setVoices(currentVoices());
    update();
    synth.addEventListener?.("voiceschanged", update);
    document.addEventListener("click", update, { once: true });
    return () => {
      synth.removeEventListener?.("voiceschanged", update);
      document.removeEventListener("click", update);
    };
  }, [supported]);
  return { voices, supported };
}
