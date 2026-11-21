import type { ClientMessage } from "@schmegettes/shared";
import type { ReactNode } from "react";
import type { RoomState } from "../lib/room";
import { PHONE_BG } from "../ui/tokens";
import { PlayerControls } from "./PlayerControls";

/**
 * A phone from the lobby to the end of the game: the status area on top, the buzzer pinned
 * to the bottom of the screen. It never shows clue text or the correct response.
 */
export function PlayerGame({
  state,
  userId,
  send,
  lobby,
  onLeave,
  home,
}: {
  state: RoomState;
  userId: string;
  send: (m: ClientMessage) => void;
  /** The lobby's status area ("You're in", name, Leave), shown before the game. */
  lobby?: ReactNode;
  /** Leave the room from the final scoreboard. */
  onLeave?: () => void;
  /** The Home control, in the header row. */
  home?: ReactNode;
}) {
  return (
    <div style={{ minHeight: "100dvh", background: PHONE_BG, color: "#fff" }}>
      <div
        style={{
          height: "100dvh",
          maxWidth: 480,
          margin: "0 auto",
          padding:
            "max(12px, env(safe-area-inset-top)) max(20px, env(safe-area-inset-right)) max(16px, env(safe-area-inset-bottom)) max(20px, env(safe-area-inset-left))",
        }}
      >
        <PlayerControls
          state={state}
          userId={userId}
          send={send}
          lobby={lobby}
          buzzerHeight={120}
          onLeave={onLeave}
          home={home}
        />
      </div>
    </div>
  );
}
