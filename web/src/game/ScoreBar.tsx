import { Badge, Group } from "@mantine/core";
import type { RoomState } from "../lib/room";

function money(n: number): string {
  return `${n < 0 ? "−" : ""}$${Math.abs(n).toLocaleString("en-US")}`;
}

export { money };

/** Every contestant's score; marks who has control. */
export function ScoreBar({ state }: { state: RoomState }) {
  const players = state.players.filter((p) => p.role === "contestant" || p.role === "host");
  return (
    <Group justify="center" gap="md" aria-label="Scores">
      {players.map((p) => (
        <Badge
          key={p.userId}
          size="xl"
          variant={p.connected ? "filled" : "light"}
          color={p.connected ? undefined : "gray"}
          rightSection={state.controllingUserId === p.userId ? "◀ picking" : undefined}
        >
          {p.displayName} {money(state.scores[p.userId] ?? 0)}
        </Badge>
      ))}
    </Group>
  );
}
