import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router";
import { expect, test } from "vitest";
import { answering, HomeButton, inGame } from "./HomeButton";

function show(ui: ReactNode) {
  return render(
    <MantineProvider>
      <MemoryRouter initialEntries={["/join/K7RXM"]}>
        <Routes>
          <Route path="/" element={<p>home screen</p>} />
          <Route path="/join/:code" element={ui} />
        </Routes>
      </MemoryRouter>
    </MantineProvider>,
  );
}

test("outside a game, Home goes Home at once", () => {
  show(<HomeButton />);
  fireEvent.click(screen.getByRole("button", { name: "Home" }));
  expect(screen.getByText("home screen")).toBeInTheDocument();
});

test("during a game it asks first: Stay keeps the screen, Leave game goes Home", () => {
  show(<HomeButton confirm="contestant" />);
  fireEvent.click(screen.getByRole("button", { name: "Home" }));
  const dialog = screen.getByRole("dialog", { name: "Leave the game?" });
  expect(dialog).toHaveTextContent("Your score stays. You can rejoin from Home.");
  fireEvent.click(screen.getByRole("button", { name: "Stay" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.queryByText("home screen")).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "Home" }));
  fireEvent.click(screen.getByRole("button", { name: "Leave game" }));
  expect(screen.getByText("home screen")).toBeInTheDocument();
});

test("the host is told the game pauses", () => {
  show(<HomeButton confirm="host" />);
  fireEvent.click(screen.getByRole("button", { name: "Home" }));
  expect(screen.getByRole("dialog")).toHaveTextContent("The game pauses for everyone until you rejoin from Home.");
});

test("disabled (answering) does nothing", () => {
  show(<HomeButton confirm="contestant" disabled />);
  const home = screen.getByRole("button", { name: "Home" });
  expect(home).toHaveAttribute("aria-disabled", "true");
  fireEvent.click(home);
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.queryByText("home screen")).toBeNull();
});

test("the question closes when the game ends", () => {
  const { rerender } = show(<HomeButton confirm="contestant" />);
  fireEvent.click(screen.getByRole("button", { name: "Home" }));
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  rerender(
    <MantineProvider>
      <MemoryRouter initialEntries={["/join/K7RXM"]}>
        <Routes>
          <Route path="/join/:code" element={<HomeButton />} />
        </Routes>
      </MemoryRouter>
    </MantineProvider>,
  );
  expect(screen.queryByRole("dialog")).toBeNull();
});

test("in a game: from building the board until the results, not the lobby or the end", () => {
  expect(inGame({ phase: "lobby", results: undefined })).toBe(false);
  expect(inGame({ phase: "building_board", results: undefined })).toBe(true);
  expect(inGame({ phase: "answering", results: undefined })).toBe(true);
  expect(inGame({ phase: "final_reveal", results: [] })).toBe(false);
  expect(inGame({ phase: "finished", results: [] })).toBe(false);
});

test("answering: only the player who buzzed, only while answering", () => {
  expect(answering({ phase: "answering", answeringUserId: "a" }, "a")).toBe(true);
  expect(answering({ phase: "answering", answeringUserId: "b" }, "a")).toBe(false);
  expect(answering({ phase: "buzzing_open", answeringUserId: undefined }, "a")).toBe(false);
});
