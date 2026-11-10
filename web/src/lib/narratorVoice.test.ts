import { afterEach, describe, expect, test, vi } from "vitest";
import {
  chooseVoice,
  getSavedVoice,
  hasNaturalVoice,
  rankVoices,
  saveVoice,
  tipPlatform,
  type Voice,
  voiceLabel,
  voiceQuality,
} from "./narratorVoice";

const voice = (name: string, lang: string, voiceURI = `x.${name}`, isDefault = false): Voice => ({
  name,
  lang,
  voiceURI,
  default: isDefault,
});

const ava = voice("Ava", "en-US", "com.apple.voice.premium.en-US.Ava");
const evan = voice("Evan", "en-US", "com.apple.voice.enhanced.en-US.Evan");
const samantha = voice("Samantha", "en-US", "com.apple.voice.compact.en-US.Samantha", true);
const fred = voice("Fred", "en-US", "com.apple.speech.synthesis.voice.Fred");
const daniel = voice("Daniel", "en-GB", "com.apple.voice.compact.en-GB.Daniel");
const karen = voice("Karen", "en-AU", "com.apple.voice.enhanced.en-AU.Karen");
const thomas = voice("Thomas", "fr-FR", "com.apple.voice.compact.fr-FR.Thomas");
const bells = voice("Bells", "en-US", "com.apple.speech.synthesis.voice.Bells");
const zarvox = voice("Zarvox", "en-US", "com.apple.speech.synthesis.voice.Zarvox");
const whisper = voice("Whisper", "en-US", "com.apple.speech.synthesis.voice.Whisper");

describe("voiceQuality", () => {
  test("reads the URI segment", () => {
    expect(voiceQuality(ava)).toBe("premium");
    expect(voiceQuality(evan)).toBe("enhanced");
    expect(voiceQuality(samantha)).toBe("standard");
  });
  test("falls back to the name suffix (macOS)", () => {
    expect(voiceQuality(voice("Ava (Premium)", "en-US", "Ava"))).toBe("premium");
    expect(voiceQuality(voice("Zoe (Enhanced)", "en-US", "Zoe"))).toBe("enhanced");
    expect(voiceQuality(voice("Google US English", "en-US", "Google US English"))).toBe("standard");
  });
  test("the URI wins over the name", () => {
    expect(voiceQuality(voice("Zoe (Enhanced)", "en-US", "com.apple.voice.compact.en-US.Zoe"))).toBe("standard");
  });
});

describe("rankVoices", () => {
  test("Premium, Enhanced, other US English, other English; no novelty or non-English", () => {
    const ranked = rankVoices([thomas, daniel, bells, fred, samantha, karen, zarvox, evan, whisper, ava]);
    expect(ranked.map((v) => v.name)).toEqual(["Ava", "Evan", "Karen", "Samantha", "Fred", "Daniel"]);
  });
  test("the device default comes first within a group", () => {
    const alex = voice("Alex", "en-US");
    expect(rankVoices([alex, samantha]).map((v) => v.name)).toEqual(["Samantha", "Alex"]);
  });
  test("accepts the underscore form of the language", () => {
    expect(rankVoices([voice("Tessa", "en_ZA")]).map((v) => v.name)).toEqual(["Tessa"]);
  });
});

describe("voiceLabel", () => {
  test("quality and region", () => {
    expect(voiceLabel(ava)).toBe("Ava (Premium)");
    expect(voiceLabel(samantha)).toBe("Samantha");
    expect(voiceLabel(daniel)).toBe("Daniel (UK)");
    expect(voiceLabel(karen)).toBe("Karen (Enhanced, Australia)");
  });
  test("doesn't double a quality already in the name", () => {
    expect(voiceLabel(voice("Ava (Premium)", "en-US", "Ava"))).toBe("Ava (Premium)");
  });
  test("an unknown region shows its code", () => {
    expect(voiceLabel(voice("Moira", "en-JM"))).toBe("Moira (JM)");
  });
});

describe("chooseVoice", () => {
  const all = [samantha, ava, daniel];
  test("the saved voice when it's still installed", () => {
    expect(chooseVoice(all, daniel.voiceURI)).toBe(daniel);
  });
  test("the best voice when nothing is saved or the saved one is gone", () => {
    expect(chooseVoice(all, null)).toBe(ava);
    expect(chooseVoice(all, "com.apple.voice.premium.en-US.Gone")).toBe(ava);
  });
  test("never a saved novelty or non-English voice", () => {
    expect(chooseVoice([...all, bells, thomas], bells.voiceURI)).toBe(ava);
    expect(chooseVoice([...all, thomas], thomas.voiceURI)).toBe(ava);
  });
  test("null with no voices (the browser default reads)", () => {
    expect(chooseVoice([], null)).toBeNull();
    expect(chooseVoice([thomas], null)).toBeNull();
  });
});

test("hasNaturalVoice", () => {
  expect(hasNaturalVoice([samantha, daniel])).toBe(false);
  expect(hasNaturalVoice([samantha, karen])).toBe(true);
});

describe("storage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });
  test("saves and reads the voice", () => {
    expect(getSavedVoice()).toBeNull();
    saveVoice(ava.voiceURI);
    expect(getSavedVoice()).toBe(ava.voiceURI);
  });
  test("blocked storage means nothing saved, and saving doesn't throw", () => {
    vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(getSavedVoice()).toBeNull();
    expect(() => saveVoice(ava.voiceURI)).not.toThrow();
  });
});

describe("tipPlatform", () => {
  afterEach(() => vi.restoreAllMocks());
  const as = (userAgent: string, maxTouchPoints = 0) => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(userAgent);
    // jsdom has no maxTouchPoints.
    Object.defineProperty(navigator, "maxTouchPoints", { configurable: true, value: maxTouchPoints });
  };
  test("iPhone", () => {
    as("Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15");
    expect(tipPlatform()).toBe("ios");
  });
  test("iPad that says it's a Mac", () => {
    as("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15", 5);
    expect(tipPlatform()).toBe("ios");
  });
  test("Mac", () => {
    as("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15");
    expect(tipPlatform()).toBe("mac");
  });
  test("Windows gets no tip", () => {
    as("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36");
    expect(tipPlatform()).toBeNull();
  });
});
