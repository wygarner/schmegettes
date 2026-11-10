import { createClient } from "@supabase/supabase-js";
import { hadAccount, setHadAccount, setSignedOutNotice } from "./accountFlags";
import { env } from "./env";

// Supabase is used for auth only. All data goes through api/ (REST) and game/ (WebSocket).
export const supabase = createClient(env.supabaseUrl, env.supabaseAnonKey);

// A device that had an account and lost its session (expired, revoked, deleted elsewhere)
// says so on Home instead of quietly becoming a new guest. Our own sign-out clears the flag
// first, so it never triggers this.
function noticeLostAccount() {
  if (!hadAccount()) return;
  setHadAccount(false);
  setSignedOutNotice(true);
}
supabase.auth.onAuthStateChange((event) => {
  if (event === "SIGNED_OUT") noticeLostAccount();
});

/** Returns a valid access token, signing in anonymously on first visit. */
export async function getAccessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  if (data.session) return data.session.access_token;

  noticeLostAccount();
  const { data: signedIn, error } = await supabase.auth.signInAnonymously();
  if (error || !signedIn.session) throw error ?? new Error("Anonymous sign-in returned no session");
  return signedIn.session.access_token;
}

/** The signed-in user's id, signing in anonymously first if needed. */
export async function getUserId(): Promise<string> {
  await getAccessToken();
  const { data } = await supabase.auth.getSession();
  const id = data.session?.user.id;
  if (!id) throw new Error("No session after sign-in");
  return id;
}

/** Whether the player has no account yet (signed in anonymously). */
export async function isAnonymous(): Promise<boolean> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.is_anonymous ?? true;
}
