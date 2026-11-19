// Safari's Audio Session API (iOS 16.4+), not yet in TypeScript's DOM types.
// https://w3c.github.io/audio-session/

type AudioSessionType = "auto" | "playback" | "transient" | "transient-solo" | "ambient" | "play-and-record";

interface AudioSession {
  type: AudioSessionType;
}

interface Navigator {
  readonly audioSession?: AudioSession;
}
