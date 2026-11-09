import { MantineProvider } from "@mantine/core";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { FinalAnswerField } from "./FinalAnswerField";
import { DRAFT_DEBOUNCE_MS } from "./timing";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function setup(masked = false) {
  const onDraft = vi.fn();
  const onSubmit = vi.fn();
  const view = render(
    <MantineProvider>
      <FinalAnswerField masked={masked} onDraft={onDraft} onSubmit={onSubmit} />
    </MantineProvider>,
  );
  const input = screen.getByLabelText("Your answer") as HTMLInputElement;
  const type = (v: string) => fireEvent.change(input, { target: { value: v } });
  return { onDraft, onSubmit, input, type, view };
}

test("drafts are debounced and the latest one is sent", () => {
  const { onDraft, type } = setup();
  type("k");
  type("kra");
  expect(onDraft).not.toHaveBeenCalled();
  act(() => vi.advanceTimersByTime(DRAFT_DEBOUNCE_MS));
  expect(onDraft).toHaveBeenCalledTimes(1);
  expect(onDraft).toHaveBeenLastCalledWith("kra");
});

test("the last draft is sent when the field goes away", () => {
  const { onDraft, type, view } = setup();
  type("krakatoa");
  view.unmount();
  expect(onDraft).toHaveBeenLastCalledWith("krakatoa");
});

test("submit locks the answer; empty can't be submitted; at most 200 characters", () => {
  const { onSubmit, input, type } = setup();
  const submit = screen.getByRole("button", { name: "Submit" });
  expect(submit).toBeDisabled();
  type("x".repeat(250));
  expect(input.value).toHaveLength(200);
  type("what is krakatoa");
  fireEvent.keyDown(input, { key: "Enter" });
  expect(onSubmit).toHaveBeenCalledWith("what is krakatoa");
});

test("the field is set up for names, and masked on the host device", () => {
  const { input } = setup(true);
  expect(input).toHaveAttribute("type", "password");
  expect(input).toHaveAttribute("autocorrect", "off");
  expect(input).toHaveAttribute("autocapitalize", "off");
  expect(input).toHaveAttribute("spellcheck", "false");
});
