import { Container, Stack } from "@mantine/core";
import type { ClientMessage } from "@schmegettes/shared";
import type { RoomState } from "../lib/room";
import { PlayerControls } from "./PlayerControls";

/** A phone during a game. It never shows clue text or the correct response. */
export function PlayerGame({
  state,
  userId,
  send,
}: {
  state: RoomState;
  userId: string;
  send: (m: ClientMessage) => void;
}) {
  return (
    <Container size="xs" py="xl">
      <Stack mih="70vh" justify="center">
        <PlayerControls state={state} userId={userId} send={send} />
      </Stack>
    </Container>
  );
}
