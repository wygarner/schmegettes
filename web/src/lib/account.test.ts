import { beforeEach, expect, test, vi } from "vitest";
import {
  changePassword,
  createAccount,
  deleteAccount,
  looksLikeEmail,
  retryMerge,
  signIn,
  signInMessage,
  signOut,
} from "./account";
import {
  cachedAccountName,
  hadAccount,
  markGamePlayed,
  SAVE_PROMPT_SNOOZE_MS,
  setCachedAccountName,
  setHadAccount,
  shouldShowSavePrompt,
  snoozeSavePrompt,
  storedTicket,
  storeTicket,
} from "./accountFlags";
import { api } from "./api";
import { supabase } from "./supabase";

vi.mock("./api", () => ({ api: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), DELETE: vi.fn() } }));
vi.mock("./supabase", () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
      updateUser: vi.fn(),
      signOut: vi.fn(),
    },
  },
}));

const FUTURE = "2999-01-01T00:00:00Z";
type Session = Awaited<ReturnType<typeof supabase.auth.getSession>>;
let anonymous: boolean | null = true;
function session(): Session {
  const s =
    anonymous === null
      ? null
      : { access_token: "t", user: { id: "u", is_anonymous: anonymous, email: anonymous ? undefined : "sam@x.io" } };
  return { data: { session: s }, error: null } as unknown as Session;
}
function reply(status: number, data?: unknown) {
  return { data, error: data ? undefined : {}, response: new Response(null, { status }) };
}
const authError = (code: string, status = 400) => ({ data: {}, error: { code, status, message: code } }) as never;
const authOk = () => {
  anonymous = false; // the session switches to the account
  return { data: {}, error: null } as never;
};

beforeEach(() => {
  anonymous = true;
  vi.mocked(api.GET)
    .mockReset()
    .mockResolvedValue(reply(200, { accountName: "Wyatt" }) as never);
  vi.mocked(api.POST).mockReset();
  vi.mocked(api.DELETE).mockReset();
  vi.mocked(supabase.auth.getSession)
    .mockReset()
    .mockImplementation(async () => session());
  vi.mocked(supabase.auth.signInWithPassword)
    .mockReset()
    .mockImplementation(async () => authOk());
  vi.mocked(supabase.auth.signUp)
    .mockReset()
    .mockImplementation(async () => authOk());
  vi.mocked(supabase.auth.updateUser)
    .mockReset()
    .mockResolvedValue({ data: {}, error: null } as never);
  vi.mocked(supabase.auth.signOut).mockReset().mockResolvedValue({ error: null });
  window.localStorage.clear();
});

function mergeReplies(merge: ReturnType<typeof reply> | Error) {
  vi.mocked(api.POST).mockImplementation((async (path: string) => {
    if (path === "/v1/me/merge-tickets") return reply(201, { ticket: "tkt", expiresAt: FUTURE });
    if (merge instanceof Error) throw merge;
    return merge;
  }) as never);
}

test.each([
  ["sam@example.com", true],
  [" sam@example.com ", true],
  ["sam@example", false],
  ["sam example.com", false],
  ["", false],
])("looksLikeEmail(%j) = %s", (email, want) => {
  expect(looksLikeEmail(email)).toBe(want);
});

test("signing in: a ticket first, then the merge, then the result", async () => {
  mergeReplies(reply(200, { gamesAdded: 3, hostAccessAdded: false, accountWasNew: false }));
  const r = await signIn(" sam@x.io ", "password123");
  expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({ email: "sam@x.io", password: "password123" });
  expect(api.POST).toHaveBeenNthCalledWith(1, "/v1/me/merge-tickets");
  expect(api.POST).toHaveBeenNthCalledWith(2, "/v1/me/merge", { body: { ticket: "tkt" } });
  expect(r).toEqual({ kind: "ok", result: { gamesAdded: 3, needsName: false, mergeFailed: false } });
  expect(storedTicket()).toBeNull();
  expect(hadAccount()).toBe(true);
  expect(cachedAccountName()).toBe("Wyatt");
});

test("creating an account: a new account is asked for its name", async () => {
  mergeReplies(reply(200, { gamesAdded: 0, hostAccessAdded: false, accountWasNew: true }));
  vi.mocked(api.GET).mockResolvedValue(reply(200, { accountName: null }) as never);
  const r = await createAccount("sam@x.io", "password123");
  expect(supabase.auth.signUp).toHaveBeenCalledWith({ email: "sam@x.io", password: "password123" });
  expect(r).toMatchObject({ kind: "ok", result: { needsName: true } });
});

test("no ticket, no sign-in", async () => {
  vi.mocked(api.POST).mockResolvedValue(reply(500) as never);
  expect(await signIn("sam@x.io", "password123")).toEqual({ kind: "error" });
  expect(supabase.auth.signInWithPassword).not.toHaveBeenCalled();
});

test.each([
  ["invalid_credentials", 400, "wrong-credentials"],
  ["user_already_exists", 422, "email-taken"],
  ["email_exists", 422, "email-taken"],
  ["weak_password", 422, "weak-password"],
  ["over_request_rate_limit", 429, "rate-limited"],
  [undefined, 429, "rate-limited"],
  ["unexpected_failure", 500, "error"],
])("auth error %s → %s", async (code, status, want) => {
  mergeReplies(reply(200, { gamesAdded: 0, hostAccessAdded: false, accountWasNew: false }));
  vi.mocked(supabase.auth.signUp).mockResolvedValue(authError(code as string, status));
  expect(await createAccount("sam@x.io", "password123")).toEqual({ kind: want });
  expect(storedTicket()?.ticket).toBe("tkt"); // kept for the next try; replaced then
});

test.each([
  ["a ticket that can't work is dropped", 400, false],
  ["the guest is in a game: keep it", 409, true],
  ["the server failed: keep it", 500, true],
])("%s", async (_, status, kept) => {
  mergeReplies(reply(status));
  const r = await signIn("sam@x.io", "password123");
  expect(storedTicket() !== null).toBe(kept);
  expect(r).toMatchObject({ kind: "ok", result: { mergeFailed: kept } });
});

test("a network error keeps the ticket; the next load retries quietly unless games were added", async () => {
  mergeReplies(new TypeError("offline"));
  expect(await signIn("sam@x.io", "password123")).toMatchObject({ result: { mergeFailed: true } });
  expect(storedTicket()?.ticket).toBe("tkt");

  vi.mocked(api.POST).mockResolvedValue(
    reply(200, { gamesAdded: 2, hostAccessAdded: false, accountWasNew: false }) as never,
  );
  expect(await retryMerge()).toBe(2);
  expect(storedTicket()).toBeNull();
  expect(await retryMerge()).toBe(0);
});

test("a guest never retries a merge", async () => {
  storeTicket({ ticket: "tkt", expiresAt: FUTURE });
  expect(await retryMerge()).toBe(0);
  expect(api.POST).not.toHaveBeenCalled();
});

test("an expired ticket is forgotten", () => {
  storeTicket({ ticket: "tkt", expiresAt: "2000-01-01T00:00:00Z" });
  expect(storedTicket()).toBeNull();
});

test("sign-in messages", () => {
  const r = { gamesAdded: 0, needsName: false, mergeFailed: false };
  expect(signInMessage(r, true)).toBe("Account created. Your games are saved.");
  expect(signInMessage(r, false)).toBe("Signed in.");
  expect(signInMessage({ ...r, gamesAdded: 1 }, false)).toBe("Signed in. Added 1 game from this phone.");
  expect(signInMessage({ ...r, gamesAdded: 3 }, false)).toBe("Signed in. Added 3 games from this phone.");
  expect(signInMessage({ ...r, mergeFailed: true }, true)).toBe(
    "Signed in. Some games from this phone couldn't be added yet.",
  );
});

test("change password checks the current one first", async () => {
  anonymous = false;
  vi.mocked(supabase.auth.signInWithPassword).mockResolvedValueOnce(authError("invalid_credentials"));
  expect(await changePassword("wrong", "newpassword9")).toBe("wrong-password");
  expect(supabase.auth.updateUser).not.toHaveBeenCalled();

  expect(await changePassword("password123", "newpassword9")).toBe("ok");
  expect(supabase.auth.signInWithPassword).toHaveBeenLastCalledWith({ email: "sam@x.io", password: "password123" });
  expect(supabase.auth.updateUser).toHaveBeenCalledWith({ password: "newpassword9" });

  vi.mocked(supabase.auth.updateUser).mockResolvedValueOnce(authError("weak_password", 422));
  expect(await changePassword("password123", "short")).toBe("weak-password");
});

test("signing out is local and forgets the account first", async () => {
  setHadAccount(true);
  setCachedAccountName("Wyatt");
  await signOut();
  expect(supabase.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  expect(hadAccount()).toBe(false);
  expect(cachedAccountName()).toBeNull();
});

test("deleting while in a game is refused and keeps the session", async () => {
  setHadAccount(true);
  vi.mocked(api.DELETE).mockResolvedValue(reply(409) as never);
  expect(await deleteAccount()).toBe("in-game");
  expect(supabase.auth.signOut).not.toHaveBeenCalled();
  expect(hadAccount()).toBe(true);
  vi.mocked(api.DELETE).mockResolvedValue({
    data: undefined,
    error: undefined,
    response: new Response(null, { status: 204 }),
  } as never);
  expect(await deleteAccount()).toBe("ok");
  expect(supabase.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
});

test("the save prompt: shown after a game, Not now hides it for 7 days", () => {
  const now = Date.parse("2026-11-10T20:00:00Z");
  expect(shouldShowSavePrompt(now)).toBe(false);
  markGamePlayed();
  expect(shouldShowSavePrompt(now)).toBe(true);
  snoozeSavePrompt(now);
  expect(shouldShowSavePrompt(now)).toBe(false);
  markGamePlayed();
  expect(shouldShowSavePrompt(now + SAVE_PROMPT_SNOOZE_MS - 1)).toBe(false);
  expect(shouldShowSavePrompt(now + SAVE_PROMPT_SNOOZE_MS + 1)).toBe(true);
});
