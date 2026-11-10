// Accounts: email and password, moving this device's guest into the account, the account's
// name and password, signing out, deleting. Rules: docs/product-docs/features/accounts/.
//
// Every sign-in works the same way: while still a guest, get a one-use merge ticket from
// the api and keep it; create an account or sign in; then redeem the ticket as the account,
// which moves the guest's games, seen clues, and host access in. A merge that fails for a
// passing reason keeps the ticket and is tried again on the next load. Nothing is ever
// emailed: the email is only a username.
import type { AuthError } from "@supabase/supabase-js";
import {
  clearSavePrompt,
  setCachedAccountName,
  setHadAccount,
  setSignedOutNotice,
  storedTicket,
  storeTicket,
} from "./accountFlags";
import { api } from "./api";
import { supabase } from "./supabase";

/** Who this device is playing as. */
export type Account = { kind: "guest" } | { kind: "signed-in"; name: string | null };

/** Same rule as Supabase Auth's minimum_password_length (supabase/config.toml). */
export const MIN_PASSWORD = 8;

/** A plausible email: something@something.something. The server has the final say. */
export function looksLikeEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/** Who this device is, without creating a guest. Null while that can't be told. */
export async function currentAccount(): Promise<Account | null> {
  try {
    const { data } = await supabase.auth.getSession();
    const user = data.session?.user;
    if (!user || user.is_anonymous) return { kind: "guest" };
    const { data: me } = await api.GET("/v1/me");
    const name = me?.accountName ?? null;
    if (me) setCachedAccountName(name);
    return { kind: "signed-in", name };
  } catch {
    return null;
  }
}

/** The signed-in player's own email, for their Account page only. */
export async function accountEmail(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.email ?? null;
}

export type SignedIn = { gamesAdded: number; needsName: boolean; mergeFailed: boolean };

export type SignInResult =
  | { kind: "ok"; result: SignedIn }
  | { kind: "wrong-credentials" }
  | { kind: "email-taken" }
  | { kind: "weak-password" }
  | { kind: "rate-limited" }
  | { kind: "error" };

function authFailure(error: AuthError): Exclude<SignInResult, { kind: "ok" }> {
  switch (error.code) {
    case "invalid_credentials":
      return { kind: "wrong-credentials" };
    case "user_already_exists":
    case "email_exists":
      return { kind: "email-taken" };
    case "weak_password":
      return { kind: "weak-password" };
    case "over_request_rate_limit":
      return { kind: "rate-limited" };
  }
  return error.status === 429 ? { kind: "rate-limited" } : { kind: "error" };
}

/** A guest keeps a merge ticket before switching identity, so its games can follow. */
async function ticketForGuest(): Promise<boolean> {
  const { data: session } = await supabase.auth.getSession();
  if (session.session && !session.session.user.is_anonymous) return true; // already an account
  // A guest with nothing yet still gets a ticket: the guest is removed after sign-in.
  const { data } = await api.POST("/v1/me/merge-tickets");
  if (!data) return false;
  storeTicket({ ticket: data.ticket, expiresAt: data.expiresAt });
  return true;
}

async function withTicket(auth: () => Promise<{ error: AuthError | null }>): Promise<SignInResult> {
  try {
    if (!(await ticketForGuest())) return { kind: "error" };
    const { error } = await auth();
    if (error) return authFailure(error);
    return { kind: "ok", result: await finishSignIn() };
  } catch {
    return { kind: "error" };
  }
}

export function signIn(email: string, password: string): Promise<SignInResult> {
  return withTicket(() => supabase.auth.signInWithPassword({ email: email.trim(), password }));
}

export function createAccount(email: string, password: string): Promise<SignInResult> {
  return withTicket(() => supabase.auth.signUp({ email: email.trim(), password }));
}

/** Redeems a stored ticket. Moved, or a ticket that can never work: forget it. */
async function redeemTicket(): Promise<{ gamesAdded: number; failed: boolean }> {
  const ticket = storedTicket();
  if (!ticket) return { gamesAdded: 0, failed: false };
  try {
    const { data, response } = await api.POST("/v1/me/merge", { body: { ticket: ticket.ticket } });
    if (data || response.status === 400) storeTicket(null);
    return { gamesAdded: data?.gamesAdded ?? 0, failed: !data && response.status !== 400 };
  } catch {
    return { gamesAdded: 0, failed: true };
  }
}

/** Right after signing in: move the guest in, and see whether the account needs a name. */
export async function finishSignIn(): Promise<SignedIn> {
  setHadAccount(true);
  setSignedOutNotice(false);
  clearSavePrompt();
  const { gamesAdded, failed } = await redeemTicket();
  const account = await currentAccount();
  const needsName = account?.kind === "signed-in" && account.name === null;
  return { gamesAdded, needsName, mergeFailed: failed };
}

/** On app load: retry a merge that failed before. The number of games added, if any. */
export async function retryMerge(): Promise<number> {
  try {
    const { data } = await supabase.auth.getSession();
    if (!data.session || data.session.user.is_anonymous || !storedTicket()) return 0;
  } catch {
    return 0;
  }
  return (await redeemTicket()).gamesAdded;
}

/** The toast after a sign-in (interaction-design.md, "Sign in or create an account"). */
export function signInMessage(r: SignedIn, created: boolean): string {
  if (r.mergeFailed) return "Signed in. Some games from this phone couldn't be added yet.";
  if (created) return "Account created. Your games are saved.";
  return addedMessage(r.gamesAdded);
}

export function addedMessage(gamesAdded: number): string {
  if (gamesAdded === 1) return "Signed in. Added 1 game from this phone.";
  if (gamesAdded > 1) return `Signed in. Added ${gamesAdded} games from this phone.`;
  return "Signed in.";
}

/** Sets the account's name. False when it couldn't be saved. */
export async function setAccountName(name: string): Promise<boolean> {
  try {
    const { data } = await api.PATCH("/v1/me", { body: { accountName: name.trim() } });
    if (!data) return false;
    setCachedAccountName(data.accountName);
    return true;
  } catch {
    return false;
  }
}

export type PasswordChange = "ok" | "wrong-password" | "weak-password" | "rate-limited" | "error";

/**
 * Changes the password after checking the current one. The check runs here, by signing in
 * with it, because Supabase's own check needs email (security-model.md, Known gaps).
 * Supabase signs out the account's other devices; this one stays signed in.
 */
export async function changePassword(current: string, next: string): Promise<PasswordChange> {
  try {
    const email = await accountEmail();
    if (!email) return "error";
    const check = await supabase.auth.signInWithPassword({ email, password: current });
    if (check.error) {
      const f = authFailure(check.error).kind;
      return f === "wrong-credentials" ? "wrong-password" : f === "rate-limited" ? "rate-limited" : "error";
    }
    const { error } = await supabase.auth.updateUser({ password: next });
    if (!error) return "ok";
    const f = authFailure(error).kind;
    return f === "weak-password" || f === "rate-limited" ? f : "error";
  } catch {
    return "error";
  }
}

function forgetAccount() {
  setHadAccount(false);
  setSignedOutNotice(false);
  setCachedAccountName(null);
}

/** Signs out this device only. The next request starts a fresh guest. */
export async function signOut(): Promise<void> {
  forgetAccount();
  await supabase.auth.signOut({ scope: "local" });
}

export type DeleteResult = "ok" | "in-game" | "error";

export async function deleteAccount(): Promise<DeleteResult> {
  try {
    const { response } = await api.DELETE("/v1/me");
    if (response.status === 409) return "in-game";
    if (response.status !== 204) return "error";
  } catch {
    return "error";
  }
  forgetAccount();
  await supabase.auth.signOut({ scope: "local" });
  return "ok";
}
