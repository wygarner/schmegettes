import { MantineProvider } from "@mantine/core";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  expect(spoken.map((u) => u.text)).toEqual(["Here's SCIENCE for 400. THIS GAS"]);
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
  const read = "Here's SCIENCE for 400. THIS GAS";
  expect(spoken.map((u) => u.text)).toEqual([read, read]); // read again from the tap
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

const board = [{ clueId: "c2", category: "OPERA", value: 200, state: "unplayed" as const }];
const players = [
  { userId: "a", displayName: "Alice", role: "contestant" as const, score: 0, connected: true },
  { userId: "host", displayName: "Wyatt", role: "host" as const, score: 0, connected: true },
];
const onBoard: RoomState = {
  ...state,
  phase: "board",
  activeClue: undefined,
  board,
  players,
  scores: { a: 1200, host: -200 },
  controllingUserId: "a",
};

function host(s: RoomState, send = vi.fn()) {
  render(
    <MantineProvider>
      <HostGame state={s} send={send} hostUserId="host" />
    </MantineProvider>,
  );
  return send;
}

test("the TV board can't be tapped when it isn't the host's pick", () => {
  host({ ...onBoard, hostPlays: false });
  expect(screen.getByRole("button", { name: "OPERA for 200" })).toBeDisabled();
  cleanup();
  host({ ...onBoard, hostPlays: true });
  expect(screen.getByRole("button", { name: "OPERA for 200" })).toBeDisabled();
});

test("a playing host with control taps and confirms", async () => {
  const send = host({ ...onBoard, hostPlays: true, controllingUserId: "host" });
  fireEvent.click(screen.getByRole("button", { name: "OPERA for 200" }));
  expect(send).not.toHaveBeenCalled();
  fireEvent.click(await screen.findByRole("button", { name: "Pick" }));
  expect(send).toHaveBeenCalledWith({ type: "select_clue", clueId: "c2" });
});

test("no waiting caption; the picker's tile is highlighted", () => {
  host(onBoard);
  expect(screen.queryByText(/Waiting for/)).not.toBeInTheDocument();
  expect(screen.queryByText(/host can tap/)).not.toBeInTheDocument();
  const tile = screen.getByLabelText("Alice $1,200, picking");
  expect(tile).toHaveAttribute("aria-current", "true");
  expect(screen.getByLabelText("Wyatt −$200")).not.toHaveAttribute("aria-current");
});

test("every score stays on screen during a clue and its correct response", () => {
  host({ ...onBoard, phase: "answering", activeClue: clue });
  expect(screen.getByLabelText("Alice $1,200, picking")).toBeInTheDocument();
  cleanup();
  host({
    ...onBoard,
    phase: "answering",
    activeClue: clue,
    clueEnd: { state: "unanswered", correctResponse: "Nitrogen" },
  });
  expect(screen.getByLabelText("Wyatt −$200")).toBeInTheDocument();
});

test("the correct-response screen leaves the clue out", () => {
  host({ ...state, phase: "answering", clueEnd: { state: "answered", correctResponse: "Nitrogen" } });
  expect(screen.queryByLabelText("Clue")).not.toBeInTheDocument();
  expect(screen.queryByText("THIS GAS")).not.toBeInTheDocument();
  expect(screen.getByText("Nitrogen")).toBeInTheDocument();
});
