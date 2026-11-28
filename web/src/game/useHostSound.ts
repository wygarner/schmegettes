import type { ClientMessage } from "@schmegettes/shared";
import { useEffect, useRef, useState } from "react";
import { createHostSound, type HostSound } from "../lib/hostSound";
import { audioContext } from "../lib/piper/audio";

/**
 * The host device's sound during a game: watches it, reports host_sound, and says when to
 * show "Tap to turn on sound". `connected` going true (a fresh snapshot after a reconnect)
 * reports the state again, because the server keeps a "no sound" pause across sockets.
 */
export function useHostSound(send: (m: ClientMessage) => void, connected: boolean) {
  const [blocked, setBlocked] = useState(false);
  const sendRef = useRef(send);
  sendRef.current = send;
  const ref = useRef<HostSound | null>(null);
  if (!ref.current) {
    ref.current = createHostSound({
      context: audioContext,
      send: (on) => sendRef.current({ type: "host_sound", on }),
      onBlocked: setBlocked,
    });
  }
  const sound = ref.current;

  useEffect(() => sound.start(), [sound]);
  useEffect(() => {
    if (connected) void sound.resync();
  }, [connected, sound]);

  return { blocked, fail: () => sound.fail(), tap: () => sound.tap() };
}
