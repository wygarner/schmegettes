// Accounts: signing in with Apple or Google, moving this device's guest into the account,
// the account's name, signing out, deleting. Rules: docs/product-docs/features/accounts/.
//
// Every sign-in works the same way: while still a guest, get a one-use merge ticket from
// the api and keep it; sign in (a redirect to Apple or Google and back); then redeem the
// ticket as the account, which moves the guest's games, seen clues, and host access in.
// A merge that fails for a passing reason keeps the ticket and is tried again on the next
// load.

import {
  clearSavePrompt,
  setCachedAccountName,
  setHadAccount,
  setSignedOutNotice,
  setSignInPending,
  signInPending,
  storedTicket,
  storeTicket,
} from "./accountFlags";
import { api } from "./api";
import { supabase } from "./supabase";

export type Provider = "apple" | "google";

/** Who this device is playing as. */
export type Account = { kind: "guest" } | { kind: "signed-in"; name: string | null };

/** In-app browsers (Instagram, Facebook, TikTok, …) where Google refuses to sign in. */
export function isEmbeddedBrowser(userAgent: string): boolean {
  return /Instagram|FBAN|FBAV|FB_IAB|Messenger|\bLine\/|TikTok|musical_ly|Snapchat|; wv\)/i.test(userAgent);
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

/** Starts Apple or Google sign-in. Leaves the page on success; returns false when it couldn't start. */
export async function startSignIn(provider: Provider): Promise<boolean> {
  try {
    const { data: session } = await supabase.auth.getSession();
    if (!session.session || session.session.user.is_anonymous) {
      // A guest with nothing yet still gets a ticket: the guest is removed after sign-in.
      const { data } = await api.POST("/v1/me/merge-tickets");
      if (!data) return false;
      storeTicket({ ticket: data.ticket, expiresAt: data.expiresAt });
    }
    setSignInPending(true);
    const { error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: window.location.href } });
    if (error) {
      setSignInPending(false);
      return false;
    }
    return true;
  } catch {
    setSignInPending(false);
    return false;
  }
}

export type SignInReturn =
  | { kind: "none" }
  | { kind: "signed-in"; gamesAdded: number; needsName: boolean; mergeFailed: boolean };

/**
 * Runs once per page load. Finishes a sign-in that just returned, and retries a merge that
 * failed before. Returns what to tell the player.
 */
export async function completeSignIn(): Promise<SignInReturn> {
  const justSignedIn = signInPending();
  setSignInPending(false);
  let session: Awaited<ReturnType<typeof supabase.auth.getSession>>["data"]["session"];
  try {
    session = (await supabase.auth.getSession()).data.session;
  } catch {
    return { kind: "none" };
  }
  if (!session || session.user.is_anonymous) return { kind: "none" }; // cancelled, or a guest
  setHadAccount(true);
  setSignedOutNotice(false);

  const ticket = storedTicket();
  let gamesAdded = 0;
  let mergeFailed = false;
  if (ticket) {
    try {
      const { data, response } = await api.POST("/v1/me/merge", { body: { ticket: ticket.ticket } });
      if (data) gamesAdded = data.gamesAdded;
      // Moved, or a ticket that can never work: done with it. Anything else: try again later.
      if (data || response.status === 400) storeTicket(null);
      else mergeFailed = true;
    } catch {
      mergeFailed = true;
    }
  }
  // On an ordinary load, speak up only when a retried merge added games.
  if (!justSignedIn && gamesAdded === 0) return { kind: "none" };

  clearSavePrompt();
  const account = await currentAccount();
  const needsName = account?.kind === "signed-in" && account.name === null;
  return { kind: "signed-in", gamesAdded, needsName, mergeFailed };
}

/** The toast after a sign-in (interaction-design.md, "Sign in"). */
export function signInMessage(r: Extract<SignInReturn, { kind: "signed-in" }>, wasNew: boolean): string {
  if (r.mergeFailed) return "Signed in. Some games from this phone couldn't be added yet.";
  if (wasNew) return "Signed in. Your games are saved.";
  if (r.gamesAdded === 1) return "Signed in. Added 1 game from this phone.";
  if (r.gamesAdded > 1) return `Signed in. Added ${r.gamesAdded} games from this phone.`;
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

/** The sign-in methods connected to this account. */
export async function connectedProviders(): Promise<Provider[]> {
  const { data } = await supabase.auth.getUserIdentities();
  return (data?.identities ?? []).map((i) => i.provider).filter((p): p is Provider => p === "apple" || p === "google");
}

/** Adds the other sign-in method. Leaves the page on success. */
export async function connectProvider(provider: Provider): Promise<boolean> {
  const { error } = await supabase.auth.linkIdentity({ provider, options: { redirectTo: window.location.href } });
  return !error;
}

/** Removes a sign-in method; only allowed while another one is connected. */
export async function disconnectProvider(provider: Provider): Promise<boolean> {
  const { data } = await supabase.auth.getUserIdentities();
  const identities = data?.identities ?? [];
  const identity = identities.find((i) => i.provider === provider);
  if (!identity || identities.length < 2) return false;
  const { error } = await supabase.auth.unlinkIdentity(identity);
  return !error;
}

export type AuthError = "identity-taken" | "failed";

/** An error Apple, Google, or Supabase Auth sent back in the URL; removes it from the URL. */
export function takeAuthError(location: Location = window.location): AuthError | null {
  const params = new URLSearchParams(location.search);
  const hash = new URLSearchParams(location.hash.replace(/^#/, ""));
  const code = params.get("error_code") ?? hash.get("error_code");
  const error = params.get("error") ?? hash.get("error");
  if (!code && !error) return null;
  for (const key of ["error", "error_code", "error_description"]) params.delete(key);
  const query = params.toString();
  window.history.replaceState(null, "", location.pathname + (query ? `?${query}` : ""));
  return code === "identity_already_exists" ? "identity-taken" : "failed";
}
