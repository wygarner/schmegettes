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

test("Difficulty starts at Any, with its description", () => {
  show(DEFAULT_OPTIONS);
  expect(screen.getByRole("radio", { name: "Any" })).toBeChecked();
  expect(screen.getByText("Every category, easy to hard")).toBeInTheDocument();
});

test("picking a level changes only the difficulty", () => {
  const onChange = show({ ...DEFAULT_OPTIONS, quickPicks: true });
  fireEvent.click(screen.getByRole("radio", { name: "Hard" }));
  expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_OPTIONS, quickPicks: true, difficulty: "hard" });
});

test("each level shows its line", () => {
  show({ ...DEFAULT_OPTIONS, difficulty: "easy" });
  expect(screen.getByRole("radio", { name: "Easy" })).toBeChecked();
  expect(screen.getByText("Clues most people know")).toBeInTheDocument();
});

test("back to Any is null", () => {
  const onChange = show({ ...DEFAULT_OPTIONS, difficulty: "medium" });
  expect(screen.getByText("A mix most groups will enjoy")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("radio", { name: "Any" }));
  expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_OPTIONS, difficulty: null });
});
