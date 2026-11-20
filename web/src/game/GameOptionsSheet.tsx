import { Button, Group, RangeSlider, Stack, Switch, Text } from "@mantine/core";
import { useState } from "react";
import { FIRST_SEASON, type GameOptions, LAST_SEASON } from "../lib/gameOptions";
import { Sheet } from "../ui/Sheet";
import { SOFT } from "../ui/tokens";

/** "Seasons 20–40 · 2003–2024": a season runs from the fall of one year into the next. */
export function seasonsText(range: [number, number] | null): string {
  const [a, b] = range ?? [FIRST_SEASON, LAST_SEASON];
  const years = `${1983 + a}–${1984 + b}`;
  if (!range) return `Seasons ${a}–${b} (all) · ${years}`;
  return a === b ? `Season ${a} · ${years}` : `Seasons ${a}–${b} · ${years}`;
}

/**
 * The lobby's game options: seasons, Double Schmegettes, Quick picks. Each change applies at once
 * (onChange); Done or a tap outside closes it. Rules:
 * docs/product-docs/features/lobby/interaction-design.md, "Game options".
 */
export function GameOptionsSheet({
  opened,
  onClose,
  options,
  onChange,
}: {
  opened: boolean;
  onClose: () => void;
  options: GameOptions;
  onChange: (next: GameOptions) => void;
}) {
  // The slider moves freely; the season range is sent when the handle is let go.
  const range = options.seasons ?? [FIRST_SEASON, LAST_SEASON];
  const [dragging, setDragging] = useState<[number, number] | null>(null);
  const shown = dragging ?? range;

  const setSeasons = (r: [number, number]) => {
    setDragging(null);
    const all = r[0] === FIRST_SEASON && r[1] === LAST_SEASON;
    onChange({ ...options, seasons: all ? null : r });
  };

  return (
    <Sheet opened={opened} onClose={onClose} label="Game options">
      <Text fw={700} mb="xs">
        Game options
      </Text>
      <Stack gap="md">
        <div>
          <Group justify="space-between" mb={4}>
            <Text fw={600}>Seasons</Text>
            <Text size="sm" c={SOFT}>
              {seasonsText(shown[0] === FIRST_SEASON && shown[1] === LAST_SEASON ? null : (shown as [number, number]))}
            </Text>
          </Group>
          <RangeSlider
            aria-label="Seasons"
            min={FIRST_SEASON}
            max={LAST_SEASON}
            step={1}
            minRange={0}
            value={shown}
            onChange={(v) => setDragging(v)}
            onChangeEnd={setSeasons}
            marks={[
              { value: FIRST_SEASON, label: "1984" },
              { value: LAST_SEASON, label: "2024" },
            ]}
            label={(v) => `Season ${v}`}
            color="green.4"
            mb="lg"
          />
        </div>
        <Switch
          label="Double Schmegettes"
          description={options.doubleRound ? "Two boards, then Final" : "One board, then Final"}
          checked={options.doubleRound}
          onChange={(e) => onChange({ ...options, doubleRound: e.currentTarget.checked })}
          color="green.4"
        />
        <Switch
          label="Quick picks"
          description={options.quickPicks ? "Just the category picks its lowest clue" : "Say the category and amount"}
          checked={options.quickPicks}
          onChange={(e) => onChange({ ...options, quickPicks: e.currentTarget.checked })}
          color="green.4"
        />
      </Stack>
      <Group justify="flex-end" mt="sm">
        <Button onClick={onClose}>Done</Button>
      </Group>
    </Sheet>
  );
}
