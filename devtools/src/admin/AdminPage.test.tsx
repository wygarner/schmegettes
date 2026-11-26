import { MantineProvider } from "@mantine/core";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminPage } from "./AdminPage";
import {
  type AdminApi,
  AdminApiError,
  type AdminHost,
  type AdminHostCode,
  type AdminNotice,
  SignInError,
  UnreachableError,
} from "./client";
import type { EnvironmentConfig, EnvironmentName } from "./env";

const env = (name: EnvironmentName, label: string, set = true): EnvironmentConfig => ({
  name,
  label,
  supabaseUrl: set ? `https://${name}.supabase.test` : "",
  supabaseAnonKey: set ? "public-anon-key" : "",
  apiUrl: set ? `https://api-${name}.test` : "",
});
const environments = {
  local: env("local", "Local"),
  staging: env("staging", "Staging"),
  production: env("production", "Production"),
};

const T = Date.parse("2026-11-17T12:14:00Z");
const code: AdminHostCode = {
  code: "K7RXM2PQ",
  currentStartedAt: "2026-11-17T12:00:00Z",
  rotatesAt: "2026-11-17T12:45:00Z",
  previousValidUntil: null,
  serverTime: "2026-11-17T12:14:00Z",
};
const account: AdminHost = {
  userId: "22222222-2222-4222-8222-222222222222",
  kind: "account",
  email: "sam@example.com",
  lastPlayedAs: null,
  hostSince: "2026-11-12T09:00:00Z",
  note: "Thursday trivia",
};
const guest: AdminHost = {
  userId: "33333333-3333-4333-8333-333333333333",
  kind: "guest",
  email: null,
  lastPlayedAs: "Priya",
  hostSince: "2026-11-17T08:00:00Z",
  note: null,
};
const notice: AdminNotice = {
  id: "25210000-0000-4000-8000-000000000001",
  revision: 1,
  kind: "incident",
  phase: "active",
  title: "Buzzers lag",
  body: "Looking into it",
  link: null,
  startsAt: null,
  endsAt: null,
  resolvedAt: null,
  resolution: null,
  statusPageSync: "ok",
  statusPageError: null,
  createdBy: "25200000-0000-4000-8000-000000000001",
  history: 1,
  createdAt: "2026-11-17T12:00:00Z",
  updatedAt: "2026-11-17T12:00:00Z",
};

function fakeApi(over: Partial<AdminApi> = {}): AdminApi {
  return {
    signIn: vi.fn(async () => ({ email: "wyatt@example.com" })),
    currentEmail: vi.fn(async () => null),
    signOut: vi.fn(async () => {}),
    hostCode: vi.fn(async () => code),
    hosts: vi.fn(async () => [guest, account]),
    rotate: vi.fn(async () => ({ ...code, code: "ZZ9QHN4B" })),
    setNote: vi.fn(async (_id: string, note: string | null) => ({ ...account, note })),
    removeHost: vi.fn(async () => {}),
    notices: vi.fn(async () => []),
    postNotice: vi.fn(async (input) => ({ ...notice, ...input })),
    editNotice: vi.fn(async (_id, patch) => ({ ...notice, ...patch, revision: 2 })),
    resolveNotice: vi.fn(async (_id, resolution) => ({ ...notice, phase: "resolved" as const, resolution })),
    syncNotice: vi.fn(async () => ({ ...notice, statusPageSync: "ok" as const, statusPageError: null })),
    ...over,
  };
}

function setup(api: AdminApi | ((c: EnvironmentConfig) => AdminApi), envs = environments) {
  const createApi = vi.fn(typeof api === "function" ? api : () => api);
  render(
    <MantineProvider>
      <AdminPage environments={envs} createApi={createApi} />
    </MantineProvider>,
  );
  return createApi;
}

async function signIn() {
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "wyatt@example.com" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "hunter2-secret" } });
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
}

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T);
});
afterEach(() => vi.useRealTimers());

describe("signing in", () => {
  it("shows the code, the countdown, and the hosts", async () => {
    const api = fakeApi();
    setup(api);
    await signIn();
    expect(await screen.findByTestId("host-code")).toHaveTextContent("K7RX-M2PQ");
    expect(screen.getByText("Changes in 31 min (12:45 UTC)")).toBeInTheDocument();
    const rows = screen.getAllByTestId("host-row");
    expect(rows[0]).toHaveTextContent('Guest · "Priya"');
    expect(rows[0]).toHaveTextContent("since Nov 17");
    expect(rows[1]).toHaveTextContent("sam@example.com");
    expect(rows[1]).toHaveTextContent('"Thursday trivia"');
    expect(screen.getByText("wyatt@example.com")).toBeInTheDocument();
    expect(api.signIn).toHaveBeenCalledWith("wyatt@example.com", "hunter2-secret");
  });

  it("refuses a wrong password with the generic message", async () => {
    setup(fakeApi({ signIn: vi.fn(async () => Promise.reject(new SignInError())) }));
    await signIn();
    expect(await screen.findByText("Can't sign in as an admin here.")).toBeInTheDocument();
  });

  it("gives a non-admin or a guest the same message and signs them out", async () => {
    const nonAdmin = fakeApi({ hostCode: vi.fn(async () => Promise.reject(new AdminApiError(404))) });
    setup(nonAdmin);
    await signIn();
    expect(await screen.findByText("Can't sign in as an admin here.")).toBeInTheDocument();
    expect(nonAdmin.signOut).toHaveBeenCalled();
    expect(screen.queryByTestId("host-code")).not.toBeInTheDocument();
  });

  it("resumes a saved session without asking again", async () => {
    setup(fakeApi({ currentEmail: vi.fn(async () => "wyatt@example.com") }));
    expect(await screen.findByTestId("host-code")).toHaveTextContent("K7RX-M2PQ");
  });

  it("says when an environment is not set up, and won't sign in to it", async () => {
    setup(fakeApi(), { ...environments, staging: env("staging", "Staging", false) });
    fireEvent.click(screen.getByLabelText("Staging"));
    expect(await screen.findByText(/Staging isn't set up/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "a@b.c" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "x" } });
    expect(screen.getByRole("button", { name: "Sign in" })).toBeDisabled();
  });
});

describe("environments", () => {
  it("marks production in red, keeps one client per environment, and signs out when switching", async () => {
    const apis = new Map<string, AdminApi>();
    const createApi = setup((c) => {
      const api = fakeApi();
      apis.set(c.name, api);
      return api;
    });
    fireEvent.click(screen.getByLabelText("Production"));
    expect(await screen.findByText("PRODUCTION")).toBeInTheDocument();
    expect(document.querySelector("[data-environment='production']")?.getAttribute("style")).toContain(
      "var(--mantine-color-red-6)",
    );
    expect(apis.get("local")?.signOut).toHaveBeenCalled();
    expect(createApi.mock.calls.map(([c]) => c.name)).toEqual(["local", "production"]);
    expect(localStorage.getItem("schmegettes-admin-environment")).toBe("production");
  });
});

describe("the code", () => {
  it("shows the grace deadline while the previous code still works", async () => {
    setup(fakeApi({ hostCode: vi.fn(async () => ({ ...code, previousValidUntil: "2026-11-17T12:50:00Z" })) }));
    await signIn();
    expect(await screen.findByText("Previous code works until 12:50 UTC")).toBeInTheDocument();
  });

  it("explains a code that never rotates on its own (local seed)", async () => {
    setup(fakeApi({ hostCode: vi.fn(async () => ({ ...code, rotatesAt: "9999-01-01T00:00:00Z" })) }));
    await signIn();
    expect(await screen.findByText("Doesn't change on its own here. Use Rotate now.")).toBeInTheDocument();
  });

  it("fetches the new code at the rotation, without a reload", async () => {
    vi.useRealTimers();
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
    vi.setSystemTime(T);
    const hostCode = vi
      .fn()
      .mockResolvedValueOnce({ ...code, rotatesAt: "2026-11-17T12:15:00Z" })
      .mockResolvedValueOnce({ ...code, code: "NEWCQDE2", serverTime: "2026-11-17T12:15:01Z" });
    setup(fakeApi({ currentEmail: vi.fn(async () => "wyatt@example.com"), hostCode }));
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(screen.getByTestId("host-code")).toHaveTextContent("K7RX-M2PQ");
    await act(() => vi.advanceTimersByTimeAsync(61_000));
    expect(hostCode).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("host-code")).toHaveTextContent("NEWC-QDE2");
  });

  it("rotates only after confirming, sending the code on screen", async () => {
    const api = fakeApi();
    setup(api);
    await signIn();
    fireEvent.click(await screen.findByRole("button", { name: "Rotate now" }));
    expect(
      await screen.findByText("Retire K7RX-M2PQ now? Anyone who hasn't used it yet will need the new code."),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Rotate" }));
    expect(await screen.findByText("ZZ9Q-HN4B")).toBeInTheDocument();
    expect(api.rotate).toHaveBeenCalledWith("K7RXM2PQ");
  });

  it("shows the code another admin already made when two rotate at once", async () => {
    const api = fakeApi({ rotate: vi.fn(async () => ({ ...code, code: "QTHER2AD" })) });
    setup(api);
    await signIn();
    fireEvent.click(await screen.findByRole("button", { name: "Rotate now" }));
    fireEvent.click(await screen.findByRole("button", { name: "Rotate" }));
    expect(await screen.findByText("QTHE-R2AD")).toBeInTheDocument();
  });
});

describe("hosts", () => {
  it("saves and clears a note", async () => {
    const api = fakeApi();
    setup(api);
    await signIn();
    fireEvent.click(await screen.findByRole("button", { name: "Edit note for sam@example.com" }));
    fireEvent.change(screen.getByLabelText("Note"), { target: { value: "Sam, Thursday" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText('"Sam, Thursday"')).toBeInTheDocument();
    expect(api.setNote).toHaveBeenCalledWith(account.userId, "Sam, Thursday");

    fireEvent.click(screen.getByRole("button", { name: "Edit note for sam@example.com" }));
    fireEvent.change(screen.getByLabelText("Note"), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await act(async () => {});
    expect(api.setNote).toHaveBeenLastCalledWith(account.userId, null);
  });

  it("removes a host only after confirming", async () => {
    const api = fakeApi();
    setup(api);
    await signIn();
    const row = (await screen.findAllByTestId("host-row"))[1] as HTMLElement;
    fireEvent.click(within(row).getByRole("button", { name: "Remove" }));
    expect(
      await screen.findByText(
        "Remove host access for sam@example.com? Their next create, Start, or Rematch will be refused.",
      ),
    ).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Remove" }));
    await act(async () => {});
    expect(api.removeHost).toHaveBeenCalledWith(account.userId);
    expect(screen.getAllByTestId("host-row")).toHaveLength(1);
  });
});

describe("notices", () => {
  it("shows title and body counters in the new notice form", async () => {
    setup(fakeApi());
    await signIn();
    fireEvent.click(await screen.findByRole("button", { name: "New notice" }));
    expect(screen.getByText("0/60")).toBeInTheDocument();
    expect(screen.getByText("0/280")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Release" } });
    fireEvent.change(screen.getByLabelText("Body"), { target: { value: "New quick picks" } });
    expect(screen.getByText("7/60")).toBeInTheDocument();
    expect(screen.getByText("15/280")).toBeInTheDocument();
  });

  it("confirms maintenance posted with less than 24 hours notice", async () => {
    const api = fakeApi();
    setup(api);
    await signIn();
    fireEvent.click(await screen.findByRole("button", { name: "New notice" }));
    fireEvent.click(screen.getByRole("combobox", { name: "Kind" }));
    fireEvent.click(await screen.findByRole("option", { name: "Maintenance" }));
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Upgrade" } });
    fireEvent.change(screen.getByLabelText("Start"), { target: { value: "2026-11-17T13:00" } });
    fireEvent.change(screen.getByLabelText("End"), { target: { value: "2026-11-17T14:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Post" }));
    expect(await screen.findByText("This is less than 24 hours' notice. Post anyway?")).toBeInTheDocument();
    expect(api.postNotice).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Post anyway" }));
    await act(async () => {});
    expect(api.postNotice).toHaveBeenCalledOnce();
  });

  it("requires a closing line to resolve an incident", async () => {
    const api = fakeApi({ notices: vi.fn(async () => [notice]) });
    setup(api);
    await signIn();
    fireEvent.click(await screen.findByRole("button", { name: "Resolve" }));
    const dialog = screen.getByRole("dialog", { name: "Resolve incident" });
    expect(within(dialog).getByRole("button", { name: "Resolve" })).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText("Closing line"), { target: { value: "Fixed" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Resolve" }));
    await act(async () => {});
    expect(api.resolveNotice).toHaveBeenCalledWith(notice.id, "Fixed");
  });

  it("offers Retry when status-page sync failed", async () => {
    const failedNotice = { ...notice, statusPageSync: "failed" as const, statusPageError: "provider unavailable" };
    const api = fakeApi({ notices: vi.fn(async () => [failedNotice]) });
    setup(api);
    await signIn();
    expect(await screen.findByText(/status page didn't update/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await act(async () => {});
    expect(api.syncNotice).toHaveBeenCalledWith(notice.id);
  });
});

describe("failures", () => {
  it("returns to sign-in, environment kept, when the session ends or the admin is removed", async () => {
    const api = fakeApi({ rotate: vi.fn(async () => Promise.reject(new AdminApiError(404))) });
    setup(api);
    fireEvent.click(screen.getByLabelText("Staging"));
    await act(async () => {});
    await signIn();
    fireEvent.click(await screen.findByRole("button", { name: "Rotate now" }));
    fireEvent.click(await screen.findByRole("button", { name: "Rotate" }));
    expect(await screen.findByText("Can't sign in as an admin here.")).toBeInTheDocument();
    expect(screen.getByLabelText("Staging")).toBeChecked();
    expect(screen.queryByTestId("host-code")).not.toBeInTheDocument();
  });

  it("shows nothing it fetched before when the environment can't be reached, and retries", async () => {
    const hosts = vi.fn().mockRejectedValueOnce(new UnreachableError()).mockResolvedValue([guest]);
    setup(fakeApi({ hosts }));
    await signIn();
    expect(await screen.findByText("Can't reach Local.")).toBeInTheDocument();
    expect(screen.queryByTestId("host-code")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByTestId("host-code")).toBeInTheDocument();
  });

  it("waits out a rate limit before allowing the action again", async () => {
    vi.useRealTimers();
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
    vi.setSystemTime(T);
    const api = fakeApi({
      currentEmail: vi.fn(async () => "wyatt@example.com"),
      rotate: vi.fn(async () => Promise.reject(new AdminApiError(429, 20))),
    });
    setup(api);
    await act(() => vi.advanceTimersByTimeAsync(0));
    fireEvent.click(screen.getByRole("button", { name: "Rotate now" }));
    await act(() => vi.advanceTimersByTimeAsync(500));
    fireEvent.click(screen.getByRole("button", { name: "Rotate" }));
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(screen.getByText("Too many requests. Try again in 20 s.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rotate now" })).toBeDisabled();
    await act(() => vi.advanceTimersByTimeAsync(21_000));
    expect(screen.getByRole("button", { name: "Rotate now" })).toBeEnabled();
  });

  it("never writes the password or a response to the console", async () => {
    const spies = (["log", "info", "warn", "error"] as const).map((m) => vi.spyOn(console, m));
    setup(fakeApi({ hostCode: vi.fn(async () => Promise.reject(new AdminApiError(404))) }));
    await signIn();
    await screen.findByText("Can't sign in as an admin here.");
    for (const spy of spies) {
      for (const call of spy.mock.calls) expect(JSON.stringify(call)).not.toMatch(/hunter2|K7RXM2PQ/);
      spy.mockRestore();
    }
    expect(spies[0]).not.toHaveBeenCalled();
  });
});
