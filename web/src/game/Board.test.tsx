import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import type { BoardClue } from "../lib/room";
import { Board, columns } from "./Board";

const board: BoardClue[] = [
  { clueId: "a", category: "SCIENCE", value: 400, state: "unplayed" },
  { clueId: "b", category: "SCIENCE", value: 200, state: "answered" },
  { clueId: "c", category: "OPERA", value: 200, state: "active", clueText: "SECRET CLUE TEXT" },
];

test("groups by category and sorts by value", () => {
  expect(columns(board).map((c) => [c.category, c.clues.map((x) => x.value)])).toEqual([
    ["SCIENCE", [200, 400]],
    ["OPERA", [200]],
  ]);
});

test("never renders clue text, even if it arrives", () => {
  render(
    <MantineProvider>
      <Board board={board} size="phone" />
    </MantineProvider>,
  );
  expect(screen.queryByText(/SECRET CLUE TEXT/)).not.toBeInTheDocument();
});

test("only open clues can be picked, and only with onPick", () => {
  const pick = vi.fn();
  const { rerender } = render(
    <MantineProvider>
      <Board board={board} onPick={pick} />
    </MantineProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "SCIENCE for 400" }));
  expect(pick).toHaveBeenCalledWith("a");
  expect(screen.getByRole("button", { name: "SCIENCE 200, done" })).toBeDisabled();

  rerender(
    <MantineProvider>
      <Board board={board} />
    </MantineProvider>,
  );
  expect(screen.getByRole("button", { name: "SCIENCE for 400" })).toBeDisabled();
});

test("a 4-row board shows every value", () => {
  const four: BoardClue[] = [200, 400, 600, 800].map((v) => ({
    clueId: `s${v}`,
    category: "VOLCANOES",
    value: v,
    state: "unplayed",
  }));
  render(
    <MantineProvider>
      <Board board={four} />
    </MantineProvider>,
  );
  for (const v of [200, 400, 600, 800])
    expect(screen.getByRole("button", { name: `VOLCANOES for ${v}` })).toBeInTheDocument();
});
