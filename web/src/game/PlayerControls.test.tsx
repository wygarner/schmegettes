import { MantineProvider } from "@mantine/core";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { initialRoom, type RoomState } from "../lib/room";
import { type Recognizer, setRecognizerFactory } from "../lib/speech";
import { PlayerControls } from "./PlayerControls";

const me = "me";
const clue = { clueId: "c1", category: "SCIENCE", value: 400, state: "active" as const };
const players = [
  { userId: me, displayName: "Alice", role: "contestant" as const, score: 0, connected: true },
  { userId: "bob", displayName: "Bob", role: "contestant" as const, score: 0, connected: true },
];
const base: RoomState = {
  ...initialRoom,
  connection: "open",
  players,
  board: [{ ...clue, state: "unplayed" }],
  controllingUserId: "bob",
};

let rec: Recognizer & { started: number; aborted: number; stopped: number };
beforeEach(() => {
  rec = {
    started: 0,
    aborted: 0,
    stopped: 0,
    start() {
      this.started++;
    },
    stop() {
      this.stopped++;
    },
    abort() {
      this.aborted++;
    },
  };
  setRecognizerFactory(() => rec);
});
afterEach(() => setRecognizerFactory(null));

function setup(state: RoomState) {
  const send = vi.fn();
  const view = (s: RoomState) => (
    <MantineProvider>
      <PlayerControls state={s} userId={me} send={send} />
    </MantineProvider>
  );
  const r = render(view(state));
  return { send, update: (s: RoomState) => r.rerender(view(s)) };
}

test("the controller picks from the phone board", () => {
  const { send } = setup({ ...base, phase: "board", controllingUserId: me });
  fireEvent.click(screen.getByRole("button", { name: "SCIENCE for 400" }));
  expect(send).toHaveBeenCalledWith({ type: "select_clue", clueId: "c1" });
});

test("others see who is picking", () => {
  setup({ ...base, phase: "board" });
  expect(screen.getByText("Bob is picking…")).toBeInTheDocument();
});

test("buzzer is dim while reading, lit when open, locked once tried", () => {
  const { update } = setup({ ...base, phase: "clue_reading", activeClue: clue });
  expect(screen.getByRole("button", { name: "Buzz" })).toHaveAttribute("data-state", "dim");
  update({ ...base, phase: "buzzing_open", activeClue: clue });
  expect(screen.getByRole("button", { name: "Buzz" })).toHaveAttribute("data-state", "lit");
  update({ ...base, phase: "buzzing_open", activeClue: clue, attemptedUserIds: ["bob", me] });
  expect(screen.getByRole("button", { name: "Buzz" })).toBeDisabled();
});

test("winning a buzz: listening starts on the tap, words stream, the final text is submitted", () => {
  vi.useFakeTimers();
  try {
    const open: RoomState = { ...base, phase: "buzzing_open", activeClue: clue };
    const { send, update } = setup(open);
    fireEvent.click(screen.getByRole("button", { name: "Buzz" }));
    expect(rec.started).toBe(1);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ type: "buzz", clueId: "c1" }));

    // Words heard before the server confirms aren't sent.
    act(() => rec.onInterim?.("what"));
    expect(send).not.toHaveBeenCalledWith(expect.objectContaining({ type: "answer_progress" }));

    update({ ...open, phase: "answering", answeringUserId: me });
    expect(screen.getByText("Answer now")).toBeInTheDocument();
    vi.advanceTimersByTime(300);
    act(() => rec.onInterim?.("what is nit"));
    expect(send).toHaveBeenCalledWith({ type: "answer_progress", clueId: "c1", text: "what is nit" });

    act(() => rec.onFinal?.("what is nitrogen"));
    expect(send).toHaveBeenCalledWith({
      type: "submit_answer",
      clueId: "c1",
      answer: "what is nitrogen",
      source: "voice",
    });
  } finally {
    vi.useRealTimers();
  }
});

test("listening stops after 7 s", () => {
  vi.useFakeTimers();
  try {
    const open: RoomState = { ...base, phase: "buzzing_open", activeClue: clue };
    const { update } = setup(open);
    fireEvent.click(screen.getByRole("button", { name: "Buzz" }));
    update({ ...open, phase: "answering", answeringUserId: me });
    vi.advanceTimersByTime(7000);
    expect(rec.stopped).toBe(1);
  } finally {
    vi.useRealTimers();
  }
});

test("losing the buzz throws the recording away", () => {
  const open: RoomState = { ...base, phase: "buzzing_open", activeClue: clue };
  const { send, update } = setup(open);
  fireEvent.click(screen.getByRole("button", { name: "Buzz" }));
  update({ ...open, phase: "answering", answeringUserId: "bob" });
  expect(rec.aborted).toBe(1);
  expect(screen.getByText("Bob is answering…")).toBeInTheDocument();
  act(() => rec.onFinal?.("too late"));
  expect(send).not.toHaveBeenCalledWith(expect.objectContaining({ type: "submit_answer" }));
});

test("an early buzz doesn't open the microphone", () => {
  setup({ ...base, phase: "clue_reading", activeClue: clue });
  fireEvent.click(screen.getByRole("button", { name: "Buzz" }));
  expect(rec.started).toBe(0);
});

test("paused and game over", () => {
  const { update } = setup({ ...base, phase: "buzzing_open", activeClue: clue, paused: true });
  expect(screen.getByText("Waiting for the TV…")).toBeInTheDocument();
  update({ ...base, phase: "finished", results: [{ userId: me, displayName: "Alice", score: 1200, placement: 1 }] });
  expect(screen.getByText("Final: $1,200 · place 1")).toBeInTheDocument();
});

test("no lit buzzer once the clue has ended or between rounds", () => {
  const { update } = setup({
    ...base,
    phase: "buzzing_open",
    activeClue: clue,
    clueEnd: { state: "unanswered" },
  });
  expect(screen.queryByRole("button", { name: "Buzz" })).not.toBeInTheDocument();
  expect(screen.getByText("Look at the TV.")).toBeInTheDocument();
  update({ ...base, phase: "answering", roundIntro: "double" });
  expect(screen.queryByRole("button", { name: "Buzz" })).not.toBeInTheDocument();
  expect(screen.getByText("Double Jeopardy!")).toBeInTheDocument();
});
