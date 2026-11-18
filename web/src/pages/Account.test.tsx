import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, expect, test, vi } from "vitest";
import { accountEmail, changePassword, currentAccount, deleteAccount, setAccountName, signOut } from "../lib/account";
import { Account } from "./Account";

vi.mock("../lib/account", async (original) => ({
  ...(await original<typeof import("../lib/account")>()),
  currentAccount: vi.fn(),
  accountEmail: vi.fn(),
  changePassword: vi.fn(),
  deleteAccount: vi.fn(),
  signOut: vi.fn(),
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
  vi.mocked(accountEmail).mockReset().mockResolvedValue("sam@example.com");
  vi.mocked(changePassword).mockReset();
  vi.mocked(deleteAccount).mockReset();
  vi.mocked(signOut).mockReset().mockResolvedValue();
});

test("shows the name and the owner's email", async () => {
  show();
  expect(await screen.findAllByText("Wyatt")).toHaveLength(2); // the profile card and the Name row
  expect(await screen.findAllByText("sam@example.com")).toHaveLength(2);
});

test("change password: a wrong current password says so; success says so", async () => {
  vi.mocked(changePassword).mockResolvedValueOnce("wrong-password").mockResolvedValueOnce("ok");
  show();
  fireEvent.click(await screen.findByRole("button", { name: "Change password" }));
  const dialog = await screen.findByRole("dialog", { name: "Change password" });
  const save = within(dialog).getByRole("button", { name: "Save" });
  fireEvent.change(within(dialog).getByLabelText("Current password"), { target: { value: "oldpassword" } });
  fireEvent.change(within(dialog).getByLabelText("New password"), { target: { value: "short" } });
  expect(save).toBeDisabled();
  fireEvent.change(within(dialog).getByLabelText("New password"), { target: { value: "newpassword9" } });
  fireEvent.click(save);
  expect(await within(dialog).findByText("That password isn't right.")).toBeInTheDocument();
  expect(changePassword).toHaveBeenCalledWith("oldpassword", "newpassword9");

  fireEvent.change(within(dialog).getByLabelText("Current password"), { target: { value: "oldpassword2" } });
  fireEvent.click(save);
  expect(await screen.findByText("Password changed.")).toBeInTheDocument();
});

test("the name opens a sheet; saving shows it", async () => {
  vi.mocked(setAccountName).mockResolvedValue(true);
  show();
  fireEvent.click(await screen.findByRole("button", { name: "Name" }));
  const dialog = await screen.findByRole("dialog", { name: "Your name" });
  fireEvent.change(within(dialog).getByLabelText("Your name"), { target: { value: "Sam" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
  expect(await screen.findByText("Name saved.")).toBeInTheDocument();
  expect(screen.getAllByText("Sam")).toHaveLength(2);
});

test("sign out asks first, then goes home", async () => {
  show();
  fireEvent.click(await screen.findByRole("button", { name: "Sign out" }));
  const dialog = await screen.findByRole("dialog", { name: "Sign out?" });
  expect(
    within(dialog).getByText("Your games stay in your account. This phone starts fresh as a guest."),
  ).toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole("button", { name: "Sign out" }));
  expect(await screen.findByText("home")).toBeInTheDocument();
  expect(signOut).toHaveBeenCalledOnce();
});

test("delete while in a game says so", async () => {
  vi.mocked(deleteAccount).mockResolvedValue("in-game");
  show();
  fireEvent.click(await screen.findByRole("button", { name: "Delete account" }));
  const dialog = await screen.findByRole("dialog", { name: "Delete your account?" });
  fireEvent.click(within(dialog).getByRole("button", { name: "Delete account" }));
  expect(await screen.findByText("Finish or leave your game first.")).toBeInTheDocument();
});

test("a guest is offered sign-in", async () => {
  vi.mocked(currentAccount).mockResolvedValue({ kind: "guest" });
  show();
  expect(await screen.findByText("You're playing as a guest")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Create account" }));
  const dialog = await screen.findByRole("dialog", { name: "Keep your games" });
  expect(within(dialog).getByRole("button", { name: "Create account" })).toBeInTheDocument();
  expect(within(dialog).getByLabelText("Email")).toBeInTheDocument();
  expect(screen.queryByText("sam@example.com")).toBeNull();
});
