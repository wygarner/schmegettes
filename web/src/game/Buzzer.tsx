import { Button } from "@mantine/core";

/**
 * idle: no clue in play (lobby, board, between clues); a tap only animates.
 * dim: the clue is being read; a tap is an early buzz.
 * lit: buzzing is open. early: just locked out. answering: this player won the buzz.
 * locked: this player already tried this clue.
 */
export type BuzzerState = "idle" | "dim" | "lit" | "early" | "answering" | "locked";

const LABEL: Record<BuzzerState, string> = {
  idle: "BUZZ",
  dim: "BUZZ",
  lit: "BUZZ",
  early: "Too early",
  answering: "Answer now",
  locked: "You've answered this one",
};

const COLOR: Record<BuzzerState, string> = {
  idle: "gray",
  dim: "gray",
  lit: "yellow",
  early: "red",
  answering: "green",
  locked: "gray",
};

/** The one buzzer, on phones and on the host device. Full width; at least 64 px tall. */
export function Buzzer({ state, onBuzz, height = 64 }: { state: BuzzerState; onBuzz: () => void; height?: number }) {
  const filled = state === "lit" || state === "early" || state === "answering";
  return (
    <Button
      fullWidth
      h={Math.max(height, 64)}
      size="xl"
      color={COLOR[state]}
      variant={filled ? "filled" : "light"}
      disabled={state === "locked"}
      // idle and answering taps do nothing but the press animation; dim taps are early buzzes
      onClick={state === "dim" || state === "lit" ? onBuzz : undefined}
      aria-label="Buzz"
      data-state={state}
      style={{ flexShrink: 0 }}
    >
      {LABEL[state]}
    </Button>
  );
}
