import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, expect, test, vi } from "vitest";
import { connectedProviders, currentAccount, deleteAccount, signOut, takeAuthError } from "../lib/account";
import { Account } from "./Account";

vi.mock("../lib/account", () => ({
  currentAccount: vi.fn(),
  connectedProviders: vi.fn(),
  connectProvider: vi.fn(),
  disconnectProvider: vi.fn(),
  deleteAccount: vi.fn(),
  signOut: vi.fn(),
  takeAuthError: vi.fn(),
  isEmbeddedBrowser: () => false,
  startSignIn: vi.fn(),
  setAccountName: vi.fn(),
}));

function show() {
  render(
    <MantineProvider>
      <MemoryRouter initialEntries={["/account"]}>
        <Routes>
          <Route path="/account" element={<Account />} />
          <Route path="/" element={<p>home</p>} />
        </Routes>
      </MemoryRouter>
    </MantineProvider>,
  );
}

beforeEach(() => {
  vi.mocked(currentAccount).mockReset().mockResolvedValue({ kind: "signed-in", name: "Wyatt" });
  vi.mocked(connectedProviders).mockReset().mockResolvedValue(["apple"]);
  vi.mocked(deleteAccount).mockReset();
  vi.mocked(signOut).mockReset().mockResolvedValue();
  vi.mocked(takeAuthError).mockReset().mockReturnValue(null);
});

test("shows the name and sign-in methods, never an email", async () => {
  show();
  expect(await screen.findByText("Wyatt")).toBeInTheDocument();
  expect(screen.getByText("Connected")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Connect" })).toBeInTheDocument();
  expect(screen.queryByText(/@/)).toBeNull();
});

test("sign out asks first, then goes home", async () => {
  show();
  fireEvent.click(await screen.findByRole("button", { name: "Sign out" }));
  expect(
    await screen.findByText("Your games stay in your account. This phone starts fresh as a guest."),
  ).toBeInTheDocument();
  const dialog = await screen.findByRole("dialog", { name: "Sign out?" });
  fireEvent.click(within(dialog).getByRole("button", { name: "Sign out" }));
  expect(await screen.findByText("home")).toBeInTheDocument();
  expect(signOut).toHaveBeenCalledOnce();
});

test("delete while in a game says so", async () => {
  vi.mocked(deleteAccount).mockResolvedValue("in-game");
  show();
  fireEvent.click(await screen.findByText("Delete account"));
  fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
  expect(await screen.findByText("Finish or leave your game first.")).toBeInTheDocument();
});

test("a provider already used by another account says so", async () => {
  vi.mocked(takeAuthError).mockReturnValue("identity-taken");
  show();
  expect(await screen.findByText("That account is already used by another Schmegettes account.")).toBeInTheDocument();
});

test("a guest is offered sign-in", async () => {
  vi.mocked(currentAccount).mockResolvedValue({ kind: "guest" });
  show();
  expect(await screen.findByText("You're playing as a guest.")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
  expect(await screen.findByRole("button", { name: "Continue with Apple" })).toBeInTheDocument();
});
