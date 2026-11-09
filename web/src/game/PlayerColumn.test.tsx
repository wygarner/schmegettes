import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { initialRoom, type Player, type RoomState } from "../lib/room";
import { PlayerColumn } from "./PlayerColumn";

const p = (id: string, name: string, connected = true): Player => ({
  userId: id,
  displayName: name,
  role: "contestant",
  score: 0,
  connected,
});

function show(players: Player[], extra: Partial<RoomState> = {}) {
  render(
    <MantineProvider>
      <PlayerColumn state={{ ...initialRoom, phase: "board", players, ...extra }} />
    </MantineProvider>,
  );
}

test("up to 4 players get two-line tiles with a PICKING label on the picker", () => {
  show([p("a", "Alice"), p("b", "Bob")], { controllingUserId: "a", scores: { a: 400 } });
  expect(screen.getByText("PICKING")).toBeInTheDocument();
  expect(screen.getByLabelText("Alice $400, picking")).toHaveAttribute("aria-current", "true");
});

test("5 or 6 players get one-line tiles", () => {
  const six = ["A", "B", "C", "D", "E", "F"].map((n) => p(n, n));
  show(six);
  for (const n of ["A", "B", "C", "D", "E", "F"]) expect(screen.getByLabelText(`${n} $0`)).toBeInTheDocument();
});

test("a disconnected player is dimmed", () => {
  show([p("a", "Alice", false)]);
  expect(screen.getByText("Alice (reconnecting)")).toBeInTheDocument();
  expect(screen.getByLabelText("Alice $0")).toHaveStyle({ opacity: "0.5" });
});

test("in Final, tiles say who has locked in, never an amount, and dim non-finalists", () => {
  show([p("a", "Alice"), p("b", "Bob"), p("c", "Cara")], {
    phase: "final_wager",
    finalistUserIds: ["a", "b"],
    lockedUserIds: ["a"],
    scores: { a: 900, b: 300, c: -100 },
    mine: { wager: 777 },
  });
  expect(screen.getByLabelText("Alice $900, ✓ locked")).toBeInTheDocument();
  expect(screen.getByLabelText("Bob $300, wagering…")).toBeInTheDocument();
  expect(screen.getByLabelText("Cara −$100, not in final")).toHaveStyle({ opacity: "0.5" });
  expect(document.body.textContent).not.toContain("777");
  expect(screen.queryByText("PICKING")).toBeNull();
});

test("the Daily Double picker's tile says WAGERING", () => {
  show([p("a", "Alice")], { phase: "daily_double_wager", controllingUserId: "a" });
  expect(screen.getByText("WAGERING")).toBeInTheDocument();
});
