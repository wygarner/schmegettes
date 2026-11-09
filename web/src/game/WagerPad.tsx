import { Button, Group, SimpleGrid, Stack, Text } from "@mantine/core";
import { useState } from "react";
import { money } from "../lib/money";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "Min", "0", "⌫"];

/**
 * A number pad for a wager: digits, backspace, Min and Max. Confirm is disabled until the
 * amount is in range. `masked` hides the amount (the host's Final wager, on the TV): digits
 * show as dots and the hint doesn't name the limits.
 */
export function WagerPad({
  min,
  max,
  masked = false,
  compact = false,
  confirmLabel,
  onWager,
}: {
  min: number;
  max: number;
  masked?: boolean;
  compact?: boolean;
  confirmLabel: string;
  onWager: (amount: number) => void;
}) {
  const [digits, setDigits] = useState("");
  const amount = digits === "" ? undefined : Number(digits);
  const inRange = amount !== undefined && amount >= min && amount <= max;

  const press = (key: string) => {
    if (key === "⌫") setDigits((d) => d.slice(0, -1));
    else if (key === "Min") setDigits(String(min));
    else setDigits((d) => String(Number(d + key))); // drops leading zeros
  };

  let hint = masked ? "" : `${money(min)} – ${money(max)}`;
  if (amount !== undefined && !inRange) {
    if (masked) hint = "Out of range";
    else hint = amount > max ? `At most ${money(max)}` : `At least ${money(min)}`;
  }

  const size = compact ? "compact-xs" : "md";
  return (
    <Stack gap={compact ? 4 : "xs"} aria-label="Wager">
      <Text ta="center" fw={800} size={compact ? "md" : "xl"} aria-label="Wager amount">
        {masked ? (amount === undefined ? "$" : "$ •••••") : amount === undefined ? "$" : money(amount)}
      </Text>
      {hint && (
        <Text ta="center" size="xs" c={amount !== undefined && !inRange ? "red.4" : "dimmed"}>
          {hint}
        </Text>
      )}
      <SimpleGrid cols={3} spacing={compact ? 2 : 6} verticalSpacing={compact ? 2 : 6}>
        {KEYS.map((k) => (
          <Button key={k} size={size} variant="default" onClick={() => press(k)} aria-label={k === "⌫" ? "Delete" : k}>
            {k}
          </Button>
        ))}
      </SimpleGrid>
      <Group grow gap={compact ? 2 : 6}>
        <Button size={size} variant="default" onClick={() => setDigits(String(max))}>
          Max
        </Button>
        <Button size={size} disabled={!inRange} onClick={() => amount !== undefined && onWager(amount)}>
          {confirmLabel}
        </Button>
      </Group>
    </Stack>
  );
}
