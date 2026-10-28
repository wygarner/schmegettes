import { MantineProvider } from "@mantine/core";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { initialRoom, type RoomState } from "../lib/room";
import { HostGame } from "./HostGame";

class FakeUtterance {
  onend?: () => void;
  onerror?: () => void;
  constructor(public text: string) {}
}

let spoken: FakeUtterance[];
beforeEach(() => {
  spoken = [];
  vi.stubGlobal("SpeechSynthesisUtterance", FakeUtterance);
  Object.defineProperty(window, "speechSynthesis", {
    configurable: true,
    value: { cancel: vi.fn(), speak: (u: FakeUtterance) => spoken.push(u) },
  });
});
afterEach(() => vi.unstubAllGlobals());

const clue = { clueId: "c1", category: "SCIENCE", value: 400, state: "active" as const, clueText: "THIS GAS" };
const state: RoomState = {
  ...initialRoom,
  connection: "open",
  hostUserId: "host",
  players: [{ userId: "a", displayName: "Alice", role: "contestant", score: 0, connected: true }],
  board: [clue],
  phase: "clue_reading",
  activeClue: clue,
  deadlineAt: 123,
};

test("reads the clue aloud once, then reports reading done", async () => {
  const send = vi.fn();
  const { rerender } = render(
    <MantineProvider>
      <HostGame state={state} send={send} hostUserId="host" />
    </MantineProvider>,
  );
  expect(screen.getByLabelText("Clue")).toHaveTextContent("THIS GAS");
  expect(spoken.map((u) => u.text)).toEqual(["THIS GAS"]);
  rerender(
    <MantineProvider>
      <HostGame state={{ ...state }} send={send} hostUserId="host" />
    </MantineProvider>,
  );
  expect(spoken).toHaveLength(1);
  spoken[0]?.onend?.();
  await waitFor(() => expect(send).toHaveBeenCalledWith({ type: "reading_done", clueId: "c1" }));
});

test("shows the correct response and the verdict", () => {
  render(
    <MantineProvider>
      <HostGame
        state={{
          ...state,
          phase: "answering",
          lastVerdict: { userId: "a", answer: "nitrogen", verdict: "correct", delta: 400 },
          clueEnd: { state: "answered", correctResponse: "Nitrogen" },
        }}
        send={vi.fn()}
        hostUserId="host"
      />
    </MantineProvider>,
  );
  expect(screen.getByText("Nitrogen")).toBeInTheDocument();
  expect(screen.getByText(/Alice:/)).toBeInTheDocument();
});

test("the host's player bar appears when the host plays", () => {
  render(
    <MantineProvider>
      <HostGame
        state={{
          ...state,
          hostPlays: true,
          phase: "buzzing_open",
          players: [
            ...state.players,
            { userId: "host", displayName: "Wyatt", role: "host", score: 0, connected: true },
          ],
        }}
        send={vi.fn()}
        hostUserId="host"
      />
    </MantineProvider>,
  );
  expect(screen.getByLabelText("Your controls")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Buzz" })).toBeInTheDocument();
});

test("final scores", () => {
  render(
    <MantineProvider>
      <HostGame
        state={{
          ...state,
          phase: "finished",
          results: [
            { userId: "a", displayName: "Alice", score: 1200, placement: 1 },
            { userId: "b", displayName: "Bob", score: -400, placement: 2 },
          ],
        }}
        send={vi.fn()}
        hostUserId="host"
      />
    </MantineProvider>,
  );
  expect(screen.getByText("Final scores")).toBeInTheDocument();
  expect(screen.getByText("2. Bob −$400")).toBeInTheDocument();
});

test("when the browser blocks speech, buzzing is left to the server timer and the TV asks for a tap", async () => {
  const send = vi.fn();
  render(
    <MantineProvider>
      <HostGame state={state} send={send} hostUserId="host" />
    </MantineProvider>,
  );
  spoken[0]?.onerror?.();
  const tap = await screen.findByRole("button", { name: "Tap to turn on sound" });
  expect(send).not.toHaveBeenCalledWith(expect.objectContaining({ type: "reading_done" }));

  tap.click();
  expect(spoken.map((u) => u.text)).toEqual(["THIS GAS", "THIS GAS"]); // read again from the tap
  spoken[1]?.onend?.();
  await waitFor(() => expect(send).toHaveBeenCalledWith({ type: "reading_done", clueId: "c1" }));
});

test("without speech synthesis, the TV never reports reading done", async () => {
  Object.defineProperty(window, "speechSynthesis", { configurable: true, value: undefined });
  const send = vi.fn();
  render(
    <MantineProvider>
      <HostGame state={state} send={send} hostUserId="host" />
    </MantineProvider>,
  );
  await new Promise((r) => setTimeout(r, 20));
  expect(send).not.toHaveBeenCalled();
});
