import { Box, Group, Stack, Text } from "@mantine/core";
import { money } from "../lib/money";
import { inFinal, type Player, type RoomState } from "../lib/room";
import { REVEAL_LINE_MS, REVEAL_STEP_MS } from "./timing";
import { useSince } from "./useSince";

/**
 * Every contestant's name and score, in join order, on every host screen. The player in
 * control is highlighted. Up to 4 players get two-line tiles; 5 or 6 get one-line tiles.
 * Tiles share the column's height, so 6 of them fit above the host's buzzer at 667 × 320.
 * In Final, tiles say who has locked in (never an amount), and players not in Final are
 * dimmed.
 */
export function PlayerColumn({ state }: { state: RoomState }) {
  const players = state.players.filter((p) => p.role === "contestant" || p.role === "host");
  const oneLine = players.length > 4;
  const final = inFinal(state.phase);

  // During a Final reveal, the new score lands on the reveal's last line.
  const current = state.phase === "final_reveal" ? state.reveals[state.reveals.length - 1] : undefined;
  const since = useSince(current ? `${current.userId}:${state.reveals.length}` : "", REVEAL_STEP_MS);
  const held = current && since < 3 * REVEAL_LINE_MS ? current : undefined;

  return (
    <Stack gap={4} h="100%" aria-label="Scores">
      {players.map((p) => {
        const finalist = state.finalistUserIds.includes(p.userId);
        const locked = state.lockedUserIds.includes(p.userId);
        let label: string | undefined;
        let highlight = false;
        if (final) {
          if (!finalist) label = "not in Final";
          else if (state.phase === "final_category" || state.phase === "final_wager")
            label = locked ? "✓ locked" : "wagering…";
          else if (state.phase === "final_answer") label = locked ? "✓ submitted" : "writing…";
        } else if (state.phase !== "lobby" && state.controllingUserId === p.userId) {
          highlight = true;
          label = state.phase === "daily_double_wager" ? "WAGERING" : "PICKING";
        }
        const score = (state.scores[p.userId] ?? 0) - (held?.userId === p.userId ? held.delta : 0);
        return (
          <Tile
            key={p.userId}
            player={p}
            score={score}
            label={label}
            highlight={highlight}
            dim={final && !finalist}
            oneLine={oneLine}
          />
        );
      })}
    </Stack>
  );
}

function Tile({
  player,
  score,
  label,
  highlight,
  dim,
  oneLine,
}: {
  player: Player;
  score: number;
  label?: string;
  highlight: boolean;
  dim: boolean;
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
  const tag = label && (
    <Text size="10px" fw={800} c={highlight ? "yellow.4" : "gray.3"} lh={1} style={{ flexShrink: 0 }}>
      {label}
    </Text>
  );
  return (
    <Box
      aria-current={highlight ? "true" : undefined}
      aria-label={`${player.displayName} ${money(score)}${label ? `, ${label.toLowerCase()}` : ""}`}
      px="sm"
      bg="boardBlue.9"
      style={{
        flex: "1 1 0",
        minHeight: 28,
        maxHeight: oneLine ? 48 : 64,
        borderRadius: 6,
        border: `3px solid ${highlight ? "var(--mantine-color-yellow-4)" : "transparent"}`,
        opacity: player.connected && !dim ? 1 : 0.5,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      {oneLine ? (
        <Group gap={6} wrap="nowrap">
          {name}
          {tag}
          {points}
        </Group>
      ) : (
        <>
          <Group gap="xs" wrap="nowrap" justify="space-between">
            {name}
            {tag}
          </Group>
          {points}
        </>
      )}
    </Box>
  );
}
