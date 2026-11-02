import { Box, Group, Stack, Text } from "@mantine/core";
import { money } from "../lib/money";
import type { Player, RoomState } from "../lib/room";

/**
 * Every contestant's name and score, in join order, on every host screen. The player in
 * control is highlighted. Up to 4 players get two-line tiles; 5 or 6 get one-line tiles.
 * Tiles share the column's height, so 6 of them fit above the host's buzzer at 667 × 320.
 */
export function PlayerColumn({ state }: { state: RoomState }) {
  const players = state.players.filter((p) => p.role === "contestant" || p.role === "host");
  const oneLine = players.length > 4;
  return (
    <Stack gap={4} h="100%" aria-label="Scores">
      {players.map((p) => (
        <Tile
          key={p.userId}
          player={p}
          score={state.scores[p.userId] ?? 0}
          picking={state.phase !== "lobby" && state.controllingUserId === p.userId}
          oneLine={oneLine}
        />
      ))}
    </Stack>
  );
}

function Tile({
  player,
  score,
  picking,
  oneLine,
}: {
  player: Player;
  score: number;
  picking: boolean;
  oneLine: boolean;
}) {
  const name = (
    <Text fw={700} size={oneLine ? "sm" : "md"} truncate="end" style={{ minWidth: 0, flex: 1 }}>
      {player.displayName}
      {!player.connected && " (reconnecting)"}
    </Text>
  );
  const points = (
    <Text fw={800} size={oneLine ? "sm" : "md"} c={score < 0 ? "red.4" : "yellow.4"} style={{ flexShrink: 0 }}>
      {money(score)}
    </Text>
  );
  const label = picking && (
    <Text size="10px" fw={800} c="yellow.4" lh={1} style={{ flexShrink: 0 }}>
      PICKING
    </Text>
  );
  return (
    <Box
      aria-current={picking ? "true" : undefined}
      aria-label={`${player.displayName} ${money(score)}${picking ? ", picking" : ""}`}
      px="sm"
      bg="boardBlue.9"
      style={{
        flex: "1 1 0",
        minHeight: 28,
        maxHeight: oneLine ? 48 : 64,
        borderRadius: 6,
        border: `3px solid ${picking ? "var(--mantine-color-yellow-4)" : "transparent"}`,
        opacity: player.connected ? 1 : 0.5,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      {oneLine ? (
        <Group gap={6} wrap="nowrap">
          {name}
          {label}
          {points}
        </Group>
      ) : (
        <>
          <Group gap="xs" wrap="nowrap" justify="space-between">
            {name}
            {label}
          </Group>
          {points}
        </>
      )}
    </Box>
  );
}
