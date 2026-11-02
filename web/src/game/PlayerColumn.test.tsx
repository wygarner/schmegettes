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
