import { Box } from "@mantine/core";
import type { ClientMessage } from "@schmegettes/shared";
import type { ReactNode } from "react";
import type { RoomState } from "../lib/room";
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
}: {
  state: RoomState;
  userId: string;
  send: (m: ClientMessage) => void;
  /** The lobby's status area ("You're in", name, Leave), shown before the game. */
  lobby?: ReactNode;
}) {
  return (
    <Box
      h="100dvh"
      maw={480}
      mx="auto"
      style={{
        padding:
          "max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) max(16px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left))",
      }}
    >
      <PlayerControls state={state} userId={userId} send={send} lobby={lobby} buzzerHeight={140} />
    </Box>
  );
}
