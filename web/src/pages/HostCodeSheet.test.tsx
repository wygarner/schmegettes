import { MantineProvider } from "@mantine/core";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { redeemHostCode } from "../lib/hostAccess";
import { HostCodeSheet } from "./HostCodeSheet";

vi.mock("../lib/hostAccess", async (original) => ({
  ...(await original<typeof import("../lib/hostAccess")>()),
  redeemHostCode: vi.fn(),
}));

const onUnlocked = vi.fn();

function renderSheet(onSignIn?: () => void) {
  render(
    <MantineProvider>
      <HostCodeSheet opened onClose={() => {}} onUnlocked={onUnlocked} onSignIn={onSignIn} />
    </MantineProvider>,
  );
  return screen.getByLabelText("Host code");
}

beforeEach(() => {
  vi.mocked(redeemHostCode).mockReset();
  onUnlocked.mockReset();
});

test("a guest is offered to sign in first; others aren't", () => {
  const onSignIn = vi.fn();
  renderSheet(onSignIn);
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
  expect(onSignIn).toHaveBeenCalledOnce();
});

test("no sign-in line without onSignIn", () => {
  renderSheet();
  expect(screen.queryByText("Sign in first so you can host from any device.")).toBeNull();
});

test("Continue is enabled at 8 characters, and a valid code unlocks hosting", async () => {
  vi.mocked(redeemHostCode).mockResolvedValue({ kind: "ok" });
  const input = renderSheet();
  const go = screen.getByRole("button", { name: "Continue" });
  fireEvent.change(input, { target: { value: "k7rxm2p" } });
  expect(go).toBeDisabled();
  fireEvent.change(input, { target: { value: "k7rxm2pq" } });
  expect(input).toHaveValue("K7RX-M2PQ");
  fireEvent.click(go);
  await vi.waitFor(() => expect(onUnlocked).toHaveBeenCalledOnce());
});

test("a code that didn't work says so and keeps the text", async () => {
  vi.mocked(redeemHostCode).mockResolvedValue({ kind: "invalid" });
  const input = renderSheet();
  fireEvent.change(input, { target: { value: "K7RXM2PQ" } });
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  expect(await screen.findByText("That code didn't work.")).toBeInTheDocument();
  expect(input).toHaveValue("K7RX-M2PQ");
  expect(onUnlocked).not.toHaveBeenCalled();
});

test("too many tries turns Continue off until Retry-After has passed", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  try {
    vi.mocked(redeemHostCode).mockResolvedValue({ kind: "rate-limited", retryAfterSeconds: 2 });
    const input = renderSheet();
    fireEvent.change(input, { target: { value: "K7RXM2PQ" } });
    const go = screen.getByRole("button", { name: "Continue" });
    fireEvent.click(go);
    expect(await screen.findByText("Too many tries. Wait a minute and try again.")).toBeInTheDocument();
    expect(go).toBeDisabled();
    expect(screen.getByText("Try again in 2 s.")).toBeInTheDocument();
    for (const _ of [1, 2]) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
    }
    expect(go).toBeEnabled();
  } finally {
    vi.useRealTimers();
  }
});
