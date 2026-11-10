import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { initialRoom, type RoomState } from "../lib/room";
import { useOverride, VerdictRow } from "./OverrideSheet";

const players = [
  { userId: "a", displayName: "Alice", role: "contestant" as const, score: 0, connected: true },
  { userId: "b", displayName: "Bob", role: "contestant" as const, score: 0, connected: true },
];
const wrong = { answerId: "ans-b", userId: "b", answer: "crack a toe a", verdict: "incorrect", delta: -400 };
const ended: RoomState = {
  ...initialRoom,
  connection: "open",
  phase: "buzzing_open",
  players,
  scores: { a: 1200, b: 400 },
  controllingUserId: "a",
  activeClue: { clueId: "c1", category: "VOLCANOES", value: 400, state: "unanswered" },
  clueEnd: { state: "unanswered", correctResponse: "Krakatoa" },
  answers: [wrong],
  lastVerdict: wrong,
};

function Harness({ state, send }: { state: RoomState; send: (m: unknown) => void }) {
  const { ask, sheet } = useOverride(state, send);
  return (
    <>
      {state.answers.map((v) => (
        <VerdictRow key={v.answerId} state={state} verdict={v} onOverride={ask} />
      ))}
      {sheet}
    </>
  );
}

function show(state: RoomState = ended) {
  const send = vi.fn();
  const r = render(
    <MantineProvider>
      <Harness state={state} send={send} />
    </MantineProvider>,
  );
  return {
    send,
    rerender: (s: RoomState) =>
      r.rerender(
        <MantineProvider>
          <Harness state={s} send={send} />
        </MantineProvider>,
      ),
  };
}

test("Override opens the review, which pauses the clock and says what changes", () => {
  const { send } = show();
  fireEvent.click(screen.getByRole("button", { name: "Override Bob's answer" }));
  expect(send).toHaveBeenCalledWith({ type: "override_review", open: true });
  const dialog = screen.getByRole("dialog", { name: "Host override" });
  expect(dialog).toHaveTextContent("“crack a toe a”");
  expect(dialog).toHaveTextContent("Krakatoa");
  expect(dialog).toHaveTextContent("$400 → $1,200");
  expect(dialog).toHaveTextContent("gives Bob control");
});

test("Keep closes the review and changes nothing", () => {
  const { send } = show();
  fireEvent.click(screen.getByRole("button", { name: "Override Bob's answer" }));
  fireEvent.click(screen.getByRole("button", { name: /Keep/ }));
  expect(send).toHaveBeenLastCalledWith({ type: "override_review", open: false });
  expect(send).not.toHaveBeenCalledWith(expect.objectContaining({ type: "override_verdict" }));
  expect(screen.queryByRole("dialog")).toBeNull();
});

test("Mark correct overrides once, then closes the review", () => {
  const { send } = show();
  fireEvent.click(screen.getByRole("button", { name: "Override Bob's answer" }));
  const mark = screen.getByRole("button", { name: /Mark correct/ });
  fireEvent.click(mark);
  fireEvent.click(mark);
  const overrides = send.mock.calls.filter(([m]) => m.type === "override_verdict");
  expect(overrides).toEqual([[{ type: "override_verdict", answerId: "ans-b", correct: true }]]);
  expect(send).toHaveBeenLastCalledWith({ type: "override_review", open: false });
});

test("an overridden verdict is labeled HOST OVERRIDE", () => {
  show({ ...ended, overridden: ["ans-b"], answers: [{ ...wrong, verdict: "overridden_correct", delta: 400 }] });
  expect(screen.getByText("HOST OVERRIDE")).toBeInTheDocument();
  expect(screen.getByText(/✓ Bob:/)).toBeInTheDocument();
});

test("the review closes itself when the screen moves on", () => {
  const { rerender } = show();
  fireEvent.click(screen.getByRole("button", { name: "Override Bob's answer" }));
  rerender({ ...ended, answers: [], clueEnd: undefined, phase: "board" });
  expect(screen.queryByRole("dialog")).toBeNull();
});
