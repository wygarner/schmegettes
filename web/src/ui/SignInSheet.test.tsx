import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { createAccount, setAccountName, signIn } from "../lib/account";
import { SignInSheet } from "./SignInSheet";

vi.mock("../lib/account", async (original) => ({
  ...(await original<typeof import("../lib/account")>()),
  signIn: vi.fn(),
  createAccount: vi.fn(),
  setAccountName: vi.fn(),
}));

const onSignedIn = vi.fn();
const ok = (over = {}) => ({
  kind: "ok" as const,
  result: { gamesAdded: 0, needsName: false, mergeFailed: false, ...over },
});

function show(variant: "sign-in" | "save" = "sign-in") {
  render(
    <MantineProvider>
      <SignInSheet opened variant={variant} onClose={() => {}} onSignedIn={onSignedIn} />
    </MantineProvider>,
  );
}

function fill(email: string, password: string) {
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: email } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: password } });
}

beforeEach(() => {
  vi.mocked(signIn).mockReset();
  vi.mocked(createAccount).mockReset();
  vi.mocked(setAccountName).mockReset().mockResolvedValue(true);
  onSignedIn.mockReset();
  window.localStorage.clear();
});

test("fields are set up for password managers", () => {
  show();
  expect(screen.getByLabelText("Email")).toHaveAttribute("autocomplete", "username");
  expect(screen.getByLabelText("Password")).toHaveAttribute("autocomplete", "current-password");
  fireEvent.click(screen.getByText("Create account"));
  expect(screen.getByLabelText("Password")).toHaveAttribute("autocomplete", "new-password");
});

test("the button needs an email and 8 characters", () => {
  show();
  const go = screen.getByRole("button", { name: "Sign in" });
  fill("sam@example", "password123");
  expect(go).toBeDisabled();
  fill("sam@example.com", "pass123");
  expect(go).toBeDisabled();
  fill("sam@example.com", "password");
  expect(go).toBeEnabled();
});

test("signing in moves games and says so", async () => {
  vi.mocked(signIn).mockResolvedValue(ok({ gamesAdded: 3 }));
  show();
  fill("sam@example.com", "password123");
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
  expect(await screen.findByText("Signed in. Added 3 games from this phone.")).toBeInTheDocument();
  expect(signIn).toHaveBeenCalledWith("sam@example.com", "password123");
  expect(onSignedIn).toHaveBeenCalledOnce();
});

test("a wrong password says so and clears the password", async () => {
  vi.mocked(signIn).mockResolvedValue({ kind: "wrong-credentials" });
  show();
  fill("sam@example.com", "password123");
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
  expect(await screen.findByText("That email and password don't match.")).toBeInTheDocument();
  expect(screen.getByLabelText("Password")).toHaveValue("");
  expect(screen.getByLabelText("Email")).toHaveValue("sam@example.com");
  expect(onSignedIn).not.toHaveBeenCalled();
});

test("the save prompt opens on Create account; a taken email offers Sign in, keeping the email", async () => {
  vi.mocked(createAccount).mockResolvedValue({ kind: "email-taken" });
  show("save");
  expect(screen.getByText("Save your games")).toBeInTheDocument();
  fill("sam@example.com", "password123");
  fireEvent.click(screen.getByRole("button", { name: "Create account" }));
  expect(await screen.findByText("That email already has an account. Sign in instead.")).toBeInTheDocument();
  fireEvent.click(screen.getAllByRole("button", { name: "Sign in" })[0] as HTMLElement);
  expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
  expect(screen.getByLabelText("Email")).toHaveValue("sam@example.com");
});

test("a new account is asked for its name, then told its games are saved", async () => {
  vi.mocked(createAccount).mockResolvedValue(ok({ needsName: true }));
  show();
  fireEvent.click(screen.getByText("Create account"));
  fill("sam@example.com", "password123");
  fireEvent.click(screen.getByRole("button", { name: "Create account" }));
  const name = await screen.findByLabelText("Your name");
  fireEvent.change(name, { target: { value: "Sam" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(await screen.findByText("Account created. Your games are saved.")).toBeInTheDocument();
  expect(setAccountName).toHaveBeenCalledWith("Sam");
  expect(onSignedIn).toHaveBeenCalledOnce();
});

test("forgot password explains who resets it", () => {
  show();
  fireEvent.click(screen.getByText("Forgot password?"));
  expect(screen.getByText(/Ask the person who runs Schmegettes to reset your password/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Back" }));
  expect(screen.getByLabelText("Email")).toBeInTheDocument();
});
