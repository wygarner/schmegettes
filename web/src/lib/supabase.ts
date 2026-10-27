import { createClient } from "@supabase/supabase-js";
import { env } from "./env";

// Supabase is used for auth only. All data goes through api/ (REST) and game/ (WebSocket).
export const supabase = createClient(env.supabaseUrl, env.supabaseAnonKey);

/** Returns a valid access token, signing in anonymously on first visit. */
export async function getAccessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  if (data.session) return data.session.access_token;

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
