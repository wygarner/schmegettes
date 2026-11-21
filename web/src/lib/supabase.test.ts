import { beforeEach, expect, test, vi } from "vitest";
import { hadAccount, setHadAccount, signedOutNotice } from "./accountFlags";

const auth = vi.hoisted(() => ({
  getSession: vi.fn(),
  signInAnonymously: vi.fn(),
  onAuthStateChange: vi.fn(),
}));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ auth }) }));
vi.mock("./env", () => ({ env: { supabaseUrl: "http://localhost", supabaseAnonKey: "k" } }));

const { getAccessToken } = await import("./supabase");
const onChange = auth.onAuthStateChange.mock.calls.at(0)?.[0] as (event: string) => void;

beforeEach(() => {
  window.localStorage.clear();
  auth.getSession.mockReset().mockResolvedValue({ data: { session: null } });
  auth.signInAnonymously.mockReset().mockResolvedValue({ data: { session: { access_token: "guest" } }, error: null });
});

test("a first visit becomes a guest quietly", async () => {
  expect(await getAccessToken()).toBe("guest");
  expect(signedOutNotice()).toBe(false);
});

test("a device that had an account and lost it is told, then plays as a guest", async () => {
  setHadAccount(true);
  expect(await getAccessToken()).toBe("guest");
  expect(signedOutNotice()).toBe(true);
  expect(hadAccount()).toBe(false);
});

test("a session ended elsewhere (refresh refused, account deleted) is noticed", () => {
  setHadAccount(true);
  onChange("SIGNED_OUT");
  expect(signedOutNotice()).toBe(true);
});

// Day 120: the guest was deleted by the cleanup, so its saved session's refresh is refused and
// Supabase signs out. The browser quietly becomes a new guest; it was never signed in, so no notice.
test("a deleted guest's session ending is not noticed, and the next call is a new guest", async () => {
  onChange("SIGNED_OUT");
  expect(signedOutNotice()).toBe(false);
  expect(await getAccessToken()).toBe("guest");
  expect(auth.signInAnonymously).toHaveBeenCalledOnce();
  expect(signedOutNotice()).toBe(false);
});
