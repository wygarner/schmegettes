import { Button, Group, Text } from "@mantine/core";
import type { ClientMessage } from "@schmegettes/shared";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { money } from "../lib/money";
import type { RoomState } from "../lib/room";
import { GoldButton } from "../ui/GoldButton";
import { Sheet } from "../ui/Sheet";
import { DISPLAY } from "../ui/tokens";

/**
 * A tapped pick asks "Volcanoes for $400?" before it's sent; a spoken pick doesn't. The
 * question slides up from the bottom on a phone and is centered on the host device. It
 * closes itself when this player loses control or the board goes away.
 */
export function usePickConfirm(
  state: RoomState,
  userId: string,
  send: (m: ClientMessage) => void,
  { bottom = false }: { bottom?: boolean } = {},
): { ask: (clueId: string) => void; modal: ReactNode } {
  const [clueId, setClueId] = useState<string | null>(null);
  const canPick = state.phase === "board" && state.controllingUserId === userId && !state.paused;

  useEffect(() => {
    if (!canPick) setClueId(null);
  }, [canPick]);

  const clue = clueId ? state.board.find((c) => c.clueId === clueId) : undefined;
  const close = useCallback(() => setClueId(null), []);
  const modal = (
    <Sheet opened={Boolean(clue) && canPick} onClose={close} bottom={bottom} label="Confirm your pick">
      {clue && (
        <>
          <Text ff={DISPLAY} fw={600} fz={bottom ? 32 : 26} lh={1.15} ta="center" mb="lg">
            {clue.category} for {money(clue.value)}?
          </Text>
          <Group grow>
            <Button variant="default" size="lg" onClick={close}>
              Cancel
            </Button>
            <GoldButton
              size="lg"
              onClick={() => {
                send({ type: "select_clue", clueId: clue.clueId });
                close();
              }}
            >
              Pick
            </GoldButton>
          </Group>
        </>
      )}
    </Sheet>
  );
  return { ask: setClueId, modal };
}
