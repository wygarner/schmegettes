import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { DEFAULT_OPTIONS, type GameOptions } from "../lib/gameOptions";
import { GameOptionsSheet } from "./GameOptionsSheet";

function show(options: GameOptions, onChange = vi.fn()) {
  render(
    <MantineProvider>
      <GameOptionsSheet opened onClose={() => {}} options={options} onChange={onChange} />
    </MantineProvider>,
  );
  return onChange;
}

const DESCRIPTIONS = [
  "Every category, easy to hard",
  "Clues most people know",
  "A mix most groups will enjoy",
  "For trivia regulars",
];

test("Difficulty starts at Any, with no description under it", () => {
  show(DEFAULT_OPTIONS);
  expect(screen.getByRole("radio", { name: "Any" })).toBeChecked();
  for (const text of DESCRIPTIONS) expect(screen.queryByText(text)).toBeNull();
});

test("picking a level changes only the difficulty", () => {
  const onChange = show({ ...DEFAULT_OPTIONS, quickPicks: true });
  fireEvent.click(screen.getByRole("radio", { name: "Hard" }));
  expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_OPTIONS, quickPicks: true, difficulty: "hard" });
});

test("a level shows as checked, still with no description", () => {
  show({ ...DEFAULT_OPTIONS, difficulty: "easy" });
  expect(screen.getByRole("radio", { name: "Easy" })).toBeChecked();
  for (const text of DESCRIPTIONS) expect(screen.queryByText(text)).toBeNull();
});

test("back to Any is null", () => {
  const onChange = show({ ...DEFAULT_OPTIONS, difficulty: "medium" });
  fireEvent.click(screen.getByRole("radio", { name: "Any" }));
  expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_OPTIONS, difficulty: null });
});

test("Default spoken clue value: Ask by default; Lowest left and Ask set quickPicks", () => {
  const onChange = show(DEFAULT_OPTIONS);
  expect(screen.queryByText("Quick picks")).toBeNull();
  expect(screen.getByText("Default spoken clue value")).toBeInTheDocument();
  expect(screen.getByText("When a player says just the category")).toBeInTheDocument();
  expect(screen.getByRole("radio", { name: "Ask" })).toBeChecked();
  fireEvent.click(screen.getByRole("radio", { name: "Lowest left" }));
  expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_OPTIONS, quickPicks: true });
});

test("a room saved with Quick picks on opens as Lowest left", () => {
  const onChange = show({ ...DEFAULT_OPTIONS, quickPicks: true });
  expect(screen.getByRole("radio", { name: "Lowest left" })).toBeChecked();
  fireEvent.click(screen.getByRole("radio", { name: "Ask" }));
  expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_OPTIONS, quickPicks: false });
});
