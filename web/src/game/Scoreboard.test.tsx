import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { initialRoom, type RoomState } from "../lib/room";
import { gameWhen, ordinal, Scoreboard } from "./Scoreboard";

function show(results: RoomState["results"]) {
  const onRematch = vi.fn();
  render(
    <MantineProvider>
      <Scoreboard state={{ ...initialRoom, phase: "finished", results }} onRematch={onRematch} />
    </MantineProvider>,
  );
  return onRematch;
}

test("the winner and every placement; ties share a place", () => {
  show([
    { userId: "a", displayName: "Alice", score: 2900, placement: 1 },
    { userId: "b", displayName: "Bob", score: 800, placement: 2 },
    { userId: "c", displayName: "Carol", score: 800, placement: 2 },
    { userId: "d", displayName: "Dana", score: -400, placement: 4 },
  ]);
  expect(screen.getByLabelText("Winner")).toHaveTextContent("WINNER");
  expect(screen.getByLabelText("Winner")).toHaveTextContent("Alice");
  expect(screen.getByLabelText("2nd Carol $800")).toBeInTheDocument();
  expect(screen.getByLabelText("4th Dana −$400")).toBeInTheDocument();
});

test("a tie for first", () => {
  show([
    { userId: "a", displayName: "Alice", score: 2900, placement: 1 },
    { userId: "b", displayName: "Bob", score: 2900, placement: 1 },
  ]);
  expect(screen.getByLabelText("Winner")).toHaveTextContent("TIED FOR 1ST");
  expect(screen.getByLabelText("Winner")).toHaveTextContent("Alice & Bob");
});

test("Rematch is pressed once", () => {
  const onRematch = show([{ userId: "a", displayName: "Alice", score: 0, placement: 1 }]);
  const rematch = screen.getByRole("button", { name: "Rematch" });
  fireEvent.click(rematch);
  fireEvent.click(rematch);
  expect(onRematch).toHaveBeenCalledTimes(1);
  expect(rematch).toBeDisabled();
});

test("ordinals and the game's date and length", () => {
  expect([1, 2, 3, 4, 11, 12, 13, 21].map(ordinal)).toEqual([
    "1st",
    "2nd",
    "3rd",
    "4th",
    "11th",
    "12th",
    "13th",
    "21st",
  ]);
  const start = new Date(2026, 10, 9, 20, 14).getTime();
  expect(gameWhen(start, start + 41 * 60000)).toBe("Nov 9 · 8:14 PM · 41 min");
  expect(gameWhen(undefined, undefined)).toBe("");
});
