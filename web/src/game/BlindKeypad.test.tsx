import { MantineProvider } from "@mantine/core";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { BlindKeypad } from "./BlindKeypad";
import { DRAFT_DEBOUNCE_MS } from "./timing";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function setup() {
  const onDraft = vi.fn();
  const onSubmit = vi.fn();
  const r = render(
    <MantineProvider>
      <BlindKeypad onDraft={onDraft} onSubmit={onSubmit} />
    </MantineProvider>,
  );
  const tap = (...keys: string[]) => {
    for (const k of keys) fireEvent.click(screen.getByRole("button", { name: k }));
  };
  return { onDraft, onSubmit, tap, unmount: r.unmount };
}

test("letters, space and backspace build the answer; only dots show", () => {
  const { onSubmit, tap } = setup();
  const submit = screen.getByRole("button", { name: "Submit" });
  expect(submit).toBeDisabled();
  tap("J", "A", "V", "A", "Space", "X", "Delete", "Delete");
  expect(screen.getByLabelText("Answer length")).toHaveTextContent("••••");
  expect(document.body.textContent).not.toMatch(/java/i);
  fireEvent.click(submit);
  expect(onSubmit).toHaveBeenCalledWith("java");
});

test("there is no text field, so no native keyboard can open", () => {
  setup();
  expect(document.querySelector("input, textarea, [contenteditable]")).toBeNull();
});

test("drafts go to the server after a pause, and the last one when it goes away", () => {
  const { onDraft, tap, unmount } = setup();
  tap("K", "R");
  expect(onDraft).not.toHaveBeenCalled();
  act(() => vi.advanceTimersByTime(DRAFT_DEBOUNCE_MS));
  expect(onDraft).toHaveBeenLastCalledWith("kr");
  tap("A");
  unmount();
  expect(onDraft).toHaveBeenLastCalledWith("kra");
});

test("answers stop at 200 characters", () => {
  const { onSubmit, tap } = setup();
  for (let i = 0; i < 205; i++) tap("A");
  fireEvent.click(screen.getByRole("button", { name: "Submit" }));
  expect(onSubmit.mock.calls[0]?.[0]).toHaveLength(200);
});
