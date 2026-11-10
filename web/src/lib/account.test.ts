import { beforeEach, expect, test, vi } from "vitest";
import {
  completeSignIn,
  deleteAccount,
  isEmbeddedBrowser,
  signInMessage,
  signOut,
  startSignIn,
  takeAuthError,
} from "./account";
import {
  cachedAccountName,
  hadAccount,
  markGamePlayed,
  SAVE_PROMPT_SNOOZE_MS,
  setCachedAccountName,
  setHadAccount,
  setSignInPending,
  shouldShowSavePrompt,
  signInPending,
  snoozeSavePrompt,
  storedTicket,
  storeTicket,
} from "./accountFlags";
import { api } from "./api";
import { supabase } from "./supabase";

vi.mock("./api", () => ({ api: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), DELETE: vi.fn() } }));
vi.mock("./supabase", () => ({
  supabase: { auth: { getSession: vi.fn(), signInWithOAuth: vi.fn(), signOut: vi.fn() } },
}));

const FUTURE = "2999-01-01T00:00:00Z";
type Session = Awaited<ReturnType<typeof supabase.auth.getSession>>;
function session(anonymous: boolean | null): Session {
  const s = anonymous === null ? null : { access_token: "t", user: { id: "u", is_anonymous: anonymous } };
  return { data: { session: s }, error: null } as unknown as Session;
}
function reply(status: number, data?: unknown) {
  return {
    data,
    error: data ? undefined : {},
    response: new Response(null, { status: status === 204 ? 204 : status }),
  };
}

beforeEach(() => {
  vi.mocked(api.GET)
    .mockReset()
    .mockResolvedValue(reply(200, { accountName: "Wyatt" }) as never);
  vi.mocked(api.POST).mockReset();
  vi.mocked(api.DELETE).mockReset();
  vi.mocked(supabase.auth.getSession).mockReset().mockResolvedValue(session(true));
  vi.mocked(supabase.auth.signInWithOAuth)
    .mockReset()
    .mockResolvedValue({ data: {}, error: null } as never);
  vi.mocked(supabase.auth.signOut).mockReset().mockResolvedValue({ error: null });
  window.localStorage.clear();
});

test.each([
  ["Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Instagram 300.0", true],
  ["Mozilla/5.0 (iPhone) [FBAN/FBIOS;FBAV/450.0]", true],
  ["Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 Chrome/120 Mobile", true],
  ["Mozilla/5.0 (Linux; Android 14) musical_ly_32.0", true],
  ["Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Version/18.0 Mobile/15E148 Safari/604.1", false],
  ["Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36", false],
])("isEmbeddedBrowser(%s) = %s", (ua, want) => {
  expect(isEmbeddedBrowser(ua)).toBe(want);
});

test("a guest gets a ticket before leaving for Apple or Google", async () => {
  vi.mocked(api.POST).mockResolvedValue(reply(201, { ticket: "tkt", expiresAt: FUTURE }) as never);
  expect(await startSignIn("apple")).toBe(true);
  expect(storedTicket()?.ticket).toBe("tkt");
  expect(signInPending()).toBe(true);
  expect(supabase.auth.signInWithOAuth).toHaveBeenCalledWith(expect.objectContaining({ provider: "apple" }));
});

test("no ticket, no redirect", async () => {
  vi.mocked(api.POST).mockResolvedValue(reply(500) as never);
  expect(await startSignIn("google")).toBe(false);
  expect(supabase.auth.signInWithOAuth).not.toHaveBeenCalled();
  expect(signInPending()).toBe(false);
});

test("returning from a sign-in: the ticket is redeemed and cleared", async () => {
  storeTicket({ ticket: "tkt", expiresAt: FUTURE });
  setSignInPending(true);
  vi.mocked(supabase.auth.getSession).mockResolvedValue(session(false));
  vi.mocked(api.POST).mockResolvedValue(
    reply(200, { gamesAdded: 3, hostAccessAdded: false, accountWasNew: false }) as never,
  );
  const r = await completeSignIn();
  expect(api.POST).toHaveBeenCalledWith("/v1/me/merge", { body: { ticket: "tkt" } });
  expect(r).toEqual({ kind: "signed-in", gamesAdded: 3, needsName: false, mergeFailed: false });
  expect(storedTicket()).toBeNull();
  expect(hadAccount()).toBe(true);
  expect(cachedAccountName()).toBe("Wyatt");
});

test("a new account is asked for its name", async () => {
  setSignInPending(true);
  vi.mocked(supabase.auth.getSession).mockResolvedValue(session(false));
  vi.mocked(api.GET).mockResolvedValue(reply(200, { accountName: null }) as never);
  expect(await completeSignIn()).toMatchObject({ kind: "signed-in", needsName: true });
});

test.each([
  ["a ticket that can't work is dropped", 400, false],
  ["the guest is in a game: keep it", 409, true],
  ["the server failed: keep it", 500, true],
])("%s", async (_, status, kept) => {
  storeTicket({ ticket: "tkt", expiresAt: FUTURE });
  setSignInPending(true);
  vi.mocked(supabase.auth.getSession).mockResolvedValue(session(false));
  vi.mocked(api.POST).mockResolvedValue(reply(status) as never);
  const r = await completeSignIn();
  expect(storedTicket() !== null).toBe(kept);
  expect(r).toMatchObject({ kind: "signed-in", mergeFailed: kept });
});

test("a network error keeps the ticket for the next load", async () => {
  storeTicket({ ticket: "tkt", expiresAt: FUTURE });
  vi.mocked(supabase.auth.getSession).mockResolvedValue(session(false));
  vi.mocked(api.POST).mockRejectedValue(new TypeError("offline"));
  expect(await completeSignIn()).toEqual({ kind: "none" }); // an ordinary load stays quiet
  expect(storedTicket()?.ticket).toBe("tkt");
});

test("a cancelled sign-in leaves a guest and says nothing", async () => {
  storeTicket({ ticket: "tkt", expiresAt: FUTURE });
  setSignInPending(true);
  expect(await completeSignIn()).toEqual({ kind: "none" });
  expect(api.POST).not.toHaveBeenCalled();
  expect(signInPending()).toBe(false);
});

test("an expired ticket is forgotten", () => {
  storeTicket({ ticket: "tkt", expiresAt: "2000-01-01T00:00:00Z" });
  expect(storedTicket()).toBeNull();
});

test("sign-in messages", () => {
  const r = { kind: "signed-in" as const, gamesAdded: 0, needsName: false, mergeFailed: false };
  expect(signInMessage(r, true)).toBe("Signed in. Your games are saved.");
  expect(signInMessage(r, false)).toBe("Signed in.");
  expect(signInMessage({ ...r, gamesAdded: 1 }, false)).toBe("Signed in. Added 1 game from this phone.");
  expect(signInMessage({ ...r, gamesAdded: 3 }, false)).toBe("Signed in. Added 3 games from this phone.");
  expect(signInMessage({ ...r, mergeFailed: true }, true)).toBe(
    "Signed in. Some games from this phone couldn't be added yet.",
  );
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
  vi.mocked(api.DELETE).mockResolvedValue(reply(204) as never);
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

test("an auth error in the URL is read once and removed", () => {
  window.history.replaceState(null, "", "/account?error=server_error&error_code=identity_already_exists&x=1");
  expect(takeAuthError()).toBe("identity-taken");
  expect(window.location.search).toBe("?x=1");
  expect(takeAuthError()).toBeNull();
  window.history.replaceState(null, "", "/account#error=access_denied");
  expect(takeAuthError()).toBe("failed");
});
