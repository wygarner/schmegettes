import { Button } from "@mantine/core";

export type BuzzerState = "dim" | "lit" | "locked" | "early";

const LABEL: Record<BuzzerState, string> = {
  dim: "BUZZ",
  lit: "BUZZ",
  locked: "You've answered this one",
  early: "Too early",
};

/** The buzzer: dim while the clue is read, lit when buzzing opens, locked once tried. */
export function Buzzer({ state, onBuzz, compact }: { state: BuzzerState; onBuzz: () => void; compact?: boolean }) {
  return (
    <Button
      fullWidth
      h={compact ? 56 : 160}
      size="xl"
      color={state === "early" ? "red" : state === "lit" ? "yellow" : "gray"}
      variant={state === "lit" || state === "early" ? "filled" : "light"}
      disabled={state === "locked"}
      onClick={onBuzz}
      aria-label="Buzz"
      data-state={state}
    >
      {LABEL[state]}
    </Button>
  );
}
