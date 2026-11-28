import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { WagerPad } from "./WagerPad";

function setup(props: { min: number; max: number; masked?: boolean }) {
  const onWager = vi.fn();
  render(
    <MantineProvider>
      <WagerPad {...props} confirmLabel="Wager" onWager={onWager} />
    </MantineProvider>,
  );
  const tap = (...keys: string[]) => {
    for (const k of keys) fireEvent.click(screen.getByRole("button", { name: k }));
  };
  return { onWager, tap, confirm: () => screen.getByRole("button", { name: "Wager" }) };
}

test("confirm is disabled until the amount is in range", () => {
  const { onWager, tap, confirm } = setup({ min: 5, max: 1200 });
  expect(confirm()).toBeDisabled();
  tap("4");
  expect(screen.getByText("At least $5")).toBeInTheDocument();
  expect(confirm()).toBeDisabled();
  tap("Delete", "1", "3", "0", "0");
  expect(screen.getByText("At most $1,200")).toBeInTheDocument();
  expect(screen.getByLabelText("Wager amount")).toHaveTextContent("$130");
  fireEvent.click(confirm());
  expect(onWager).toHaveBeenCalledWith(130);
});

test("Min, Max, and leading zeros", () => {
  const { onWager, tap, confirm } = setup({ min: 0, max: 600 });
  tap("0", "0", "7");
  expect(screen.getByLabelText("Wager amount")).toHaveTextContent("$7");
  tap("Max");
  fireEvent.click(confirm());
  tap("Min");
  fireEvent.click(confirm());
  expect(onWager.mock.calls).toEqual([[600], [0]]);
});

test("masked never shows the amount or the limits", () => {
  const { tap, confirm } = setup({ min: 0, max: 900, masked: true });
  expect(screen.queryByText(/\$900/)).toBeNull();
  tap("6", "0", "0");
  expect(screen.getByLabelText("Wager amount")).toHaveTextContent("$ •••••");
  expect(document.body.textContent).not.toContain("600");
  tap("0");
  expect(screen.getByText("Over the limit")).toBeInTheDocument();
  expect(screen.getByLabelText("Wager amount")).toHaveTextContent("$ •••••");
  expect(document.body.textContent).not.toContain("900");
  expect(document.body.textContent).not.toContain("6000");
});

test("a digit past the limit isn't added, and the amount shakes", () => {
  const { tap, confirm } = setup({ min: 5, max: 800 });
  tap("8", "0", "0", "0");
  const amount = screen.getByLabelText("Wager amount");
  expect(amount).toHaveTextContent("$800");
  expect(amount).toHaveClass("sg-shake");
  expect(screen.getByText("At most $800")).toBeInTheDocument();
  expect(confirm()).toBeEnabled();
  tap("Delete");
  expect(screen.getByLabelText("Wager amount")).toHaveTextContent("$80");
  expect(screen.getByLabelText("Wager amount")).not.toHaveClass("sg-shake");
  expect(screen.queryByText("At most $800")).toBeNull();
});

test("a digit that reaches the limit exactly is added", () => {
  const { tap } = setup({ min: 5, max: 1200 });
  tap("1", "2", "0", "0");
  expect(screen.getByLabelText("Wager amount")).toHaveTextContent("$1,200");
  tap("0");
  expect(screen.getByLabelText("Wager amount")).toHaveTextContent("$1,200");
});

test("the stage layout works like the phone's", () => {
  const onWager = vi.fn();
  render(
    <MantineProvider>
      <WagerPad layout="stage" min={5} max={1200} confirmLabel="Wager" onWager={onWager} />
    </MantineProvider>,
  );
  for (const k of ["1", "0", "0", "0"]) fireEvent.click(screen.getByRole("button", { name: k }));
  expect(screen.getByLabelText("Wager amount")).toHaveTextContent("$1,000");
  fireEvent.click(screen.getByRole("button", { name: "Wager" }));
  expect(onWager).toHaveBeenCalledWith(1000);
});

test("masked keys never highlight when pressed", () => {
  setup({ min: 0, max: 900, masked: true });
  expect(screen.getByRole("button", { name: "5" })).not.toHaveClass("sg-key");
});
