import { Button, Group, Modal, Text } from "@mantine/core";
import type { ClientMessage } from "@schmegettes/shared";
import { type ReactNode, useEffect, useState } from "react";
import { money } from "../lib/money";
import type { RoomState } from "../lib/room";

/**
 * A tapped pick asks "Volcanoes for $400?" before it's sent; a spoken pick doesn't. The
 * question closes itself when this player loses control or the board goes away.
 */
export function usePickConfirm(
  state: RoomState,
  userId: string,
  send: (m: ClientMessage) => void,
): { ask: (clueId: string) => void; modal: ReactNode } {
  const [clueId, setClueId] = useState<string | null>(null);
  const canPick = state.phase === "board" && state.controllingUserId === userId && !state.paused;

  useEffect(() => {
    if (!canPick) setClueId(null);
  }, [canPick]);

  const clue = clueId ? state.board.find((c) => c.clueId === clueId) : undefined;
  const close = () => setClueId(null);
  const modal = (
    <Modal opened={Boolean(clue) && canPick} onClose={close} centered withCloseButton={false} size="xs">
      {clue && (
        <>
          <Text fw={700} size="xl" ta="center" mb="lg">
            {clue.category} for {money(clue.value)}?
          </Text>
          <Group grow>
            <Button variant="default" size="lg" onClick={close}>
              Cancel
            </Button>
            <Button
              size="lg"
              onClick={() => {
                send({ type: "select_clue", clueId: clue.clueId });
                close();
              }}
            >
              Pick
            </Button>
          </Group>
        </>
      )}
    </Modal>
  );
  return { ask: setClueId, modal };
}
