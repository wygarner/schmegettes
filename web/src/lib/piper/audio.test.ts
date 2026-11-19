import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  audioContext,
  isIOS,
  narratorOutput,
  restorePlaybackSession,
  setAudioContextForTest,
  unlockAudio,
} from "./audio";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Safari/604.1";
const IPAD = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.5 Safari/605.1.15";
const CHROME = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36";

function setNavigator(ua: string, touch: number, session?: { type: string }) {
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue(ua);
  Object.defineProperty(navigator, "maxTouchPoints", { value: touch, configurable: true });
  Object.defineProperty(navigator, "audioSession", { value: session, configurable: true });
}

function fakeContext() {
  const streamNode = { stream: {} };
  return {
    state: "suspended" as AudioContextState,
    destination: { kind: "speakers" },
    resume: vi.fn(async () => undefined),
    createMediaStreamDestination: vi.fn(() => streamNode),
    streamNode,
  };
}

let constructed: string[] = [];
let session: { type: string };
const play = vi.fn(async () => undefined);

beforeEach(() => {
  constructed = [];
  session = { type: "auto" };
  // The session must be set before the context exists, or iOS keeps the ambient category.
  vi.stubGlobal(
    "AudioContext",
    class {
      constructor() {
        constructed.push(session.type);
        // biome-ignore lint/correctness/noConstructorReturn: a fake context for the test
        return fakeContext();
      }
    },
  );
  vi.stubGlobal(
    "Audio",
    class {
      srcObject: unknown = null;
      play = play;
    },
  );
  play.mockClear();
  setAudioContextForTest(null);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  Object.defineProperty(navigator, "audioSession", { value: undefined, configurable: true });
  setAudioContextForTest(null);
});

describe("isIOS", () => {
  it("knows iPhones and iPads that report themselves as Macs", () => {
    expect(isIOS({ userAgent: IPHONE, maxTouchPoints: 5 })).toBe(true);
    expect(isIOS({ userAgent: IPAD, maxTouchPoints: 5 })).toBe(true);
    expect(isIOS({ userAgent: IPAD, maxTouchPoints: 0 })).toBe(false); // a real Mac
    expect(isIOS({ userAgent: CHROME, maxTouchPoints: 0 })).toBe(false);
  });
});

describe("the playback audio session", () => {
  it("is set before the audio context is made", () => {
    setNavigator(IPHONE, 5, session);
    audioContext();
    expect(constructed).toEqual(["playback"]);
  });

  it("is set again on a tap and after the microphone", () => {
    setNavigator(IPHONE, 5, session);
    audioContext();
    session.type = "play-and-record"; // what listening does
    unlockAudio();
    expect(session.type).toBe("playback");
    session.type = "play-and-record";
    restorePlaybackSession();
    expect(session.type).toBe("playback");
  });

  it("does nothing where the browser has no audio session", () => {
    setNavigator(CHROME, 0, undefined);
    expect(() => unlockAudio()).not.toThrow();
  });
});

describe("narratorOutput", () => {
  it("is the speakers with an audio session, or off iOS", () => {
    setNavigator(IPHONE, 5, session);
    const c = audioContext() as unknown as ReturnType<typeof fakeContext>;
    expect(narratorOutput(c as unknown as AudioContext)).toBe(c.destination);

    setAudioContextForTest(null);
    setNavigator(CHROME, 0, undefined);
    const d = audioContext() as unknown as ReturnType<typeof fakeContext>;
    expect(narratorOutput(d as unknown as AudioContext)).toBe(d.destination);
    expect(d.createMediaStreamDestination).not.toHaveBeenCalled();
  });

  it("goes through one <audio> element on iOS without an audio session, played on a tap", () => {
    setNavigator(IPHONE, 5, undefined);
    const c = audioContext() as unknown as ReturnType<typeof fakeContext>;
    const out = narratorOutput(c as unknown as AudioContext);
    expect(out).toBe(c.streamNode);
    expect(narratorOutput(c as unknown as AudioContext)).toBe(out);
    expect(c.createMediaStreamDestination).toHaveBeenCalledTimes(1);
    unlockAudio();
    expect(play).toHaveBeenCalledTimes(1);
  });
});
