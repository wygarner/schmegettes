import { MantineProvider } from "@mantine/core";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { currentAccount } from "../lib/account";
import { environmentName, type HostCodeState, hostCode, msUntilRotation, rotateHostCode } from "../lib/admin";
import { Admin } from "./Admin";

vi.mock("../lib/account", () => ({ currentAccount: vi.fn() }));
vi.mock("../lib/admin", async (original) => ({
  ...(await original<typeof import("../lib/admin")>()),
  hostCode: vi.fn(),
  rotateHostCode: vi.fn(),
}));

const NOW = Date.parse("2026-11-21T12:44:00Z");
const state = (over: Partial<HostCodeState> = {}): HostCodeState => ({
  code: "K7RXM2PQ",
  currentStartedAt: "2026-11-21T12:00:00Z",
  rotatesAt: "2026-11-21T12:45:00Z",
  previousValidUntil: null,
  serverTime: new Date(NOW).toISOString(),
  ...over,
});

function show() {
  render(
    <MantineProvider>
      <MemoryRouter initialEntries={["/admin"]}>
        <Routes>
          <Route path="/admin" element={<Admin />} />
          <Route path="/" element={<p>home screen</p>} />
        </Routes>
      </MemoryRouter>
    </MantineProvider>,
  );
}

beforeEach(() => {
  vi.mocked(currentAccount).mockReset().mockResolvedValue({ kind: "signed-in", name: "w", isAdmin: true });
  vi.mocked(hostCode).mockReset().mockResolvedValue({ ok: true, data: state() });
  vi.mocked(rotateHostCode).mockReset();
});
afterEach(() => {
  vi.useRealTimers();
});

test.each([{ kind: "guest" as const }, { kind: "signed-in" as const, name: "dave" }])(
  "anyone but an admin goes Home without an admin call (%o)",
  async (account) => {
    vi.mocked(currentAccount).mockResolvedValue(account);
    show();
    expect(await screen.findByText("home screen")).toBeInTheDocument();
    expect(hostCode).not.toHaveBeenCalled();
  },
);

test("the code is masked until Show; it's never in the page before that", async () => {
  show();
  const code = await screen.findByLabelText("Host code");
  expect(code).toHaveTextContent("••••-••••");
  expect(document.body.textContent).not.toContain("K7RX");
  fireEvent.click(screen.getByRole("button", { name: "Show" }));
  expect(code).toHaveTextContent("K7RX-M2PQ");
  fireEvent.click(screen.getByRole("button", { name: "Hide" }));
  expect(code).toHaveTextContent("••••-••••");
});

test("locking the phone masks it again", async () => {
  show();
  fireEvent.click(await screen.findByRole("button", { name: "Show" }));
  Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
  expect(screen.getByLabelText("Host code")).toHaveTextContent("••••-••••");
  Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
});

test("Copy code copies it with the dash, without showing it", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  show();
  fireEvent.click(await screen.findByRole("button", { name: "Copy code" }));
  expect(writeText).toHaveBeenCalledWith("K7RX-M2PQ");
  expect(await screen.findByText("Copied")).toBeInTheDocument();
  expect(screen.getByLabelText("Host code")).toHaveTextContent("••••-••••");
});

test("Rotate now confirms, sends the code it retires, and shows the new one masked", async () => {
  vi.mocked(rotateHostCode).mockResolvedValue({ ok: true, data: state({ code: "ABCDEFGH" }) });
  show();
  fireEvent.click(await screen.findByRole("button", { name: "Rotate now" }));
  expect(screen.getByText("Retire K7RX-M2PQ now?")).toBeInTheDocument();
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Rotate" }));
  });
  expect(rotateHostCode).toHaveBeenCalledWith("K7RXM2PQ");
  fireEvent.click(screen.getByRole("button", { name: "Show" }));
  expect(screen.getByLabelText("Host code")).toHaveTextContent("ABCD-EFGH");
});

test("one fetch just after the rotation, and the new code starts masked", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.mocked(hostCode)
    .mockResolvedValueOnce({ ok: true, data: state() })
    .mockResolvedValueOnce({ ok: true, data: state({ code: "NEWCODE2", rotatesAt: "2026-11-21T13:30:00Z" }) });
  show();
  fireEvent.click(await screen.findByRole("button", { name: "Show" }));
  expect(hostCode).toHaveBeenCalledTimes(1);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(60_000 + 1500);
  });
  expect(hostCode).toHaveBeenCalledTimes(2);
  expect(screen.getByLabelText("Host code")).toHaveTextContent("••••-••••");
});

test("taken off the admin list: Home", async () => {
  vi.mocked(hostCode).mockResolvedValue({ ok: false, reason: "gone" });
  show();
  expect(await screen.findByText("home screen")).toBeInTheDocument();
});

test("rate limited and unreachable say so, with Try again", async () => {
  vi.mocked(hostCode)
    .mockResolvedValueOnce({ ok: false, reason: "rate-limited" })
    .mockResolvedValueOnce({ ok: true, data: state() });
  show();
  expect(await screen.findByText("Too many tries. Wait a minute and try again.")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByLabelText("Host code")).toBeInTheDocument();
});

test("environment names and rotation timing", () => {
  expect(environmentName("localhost")).toBe("Local");
  expect(environmentName("staging.schmegettes.app")).toBe("Staging");
  expect(environmentName("schmegettes.app")).toBe("Production");
  expect(msUntilRotation(state())).toBe(60_000);
  // The local seed rotates years ahead: no timer.
  expect(msUntilRotation(state({ rotatesAt: "2030-01-01T00:00:00Z" }))).toBeNull();
});
