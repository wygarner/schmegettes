// Small per-device facts about accounts, kept in browser storage. Storage can be missing or
// blocked (private windows, previews), so every access is guarded and a missing value is
// treated as "not set". Rules: docs/product-docs/features/accounts/.

const HAD_ACCOUNT = "schmegettes.hadAccount";
const SIGNED_OUT = "schmegettes.signedOut";
const ACCOUNT_NAME = "schmegettes.accountName";
const SAVE_PROMPT = "schmegettes.savePrompt";
const TICKET = "schmegettes.mergeTicket";

/** "Not now" on the save prompt hides it this long. */
export const SAVE_PROMPT_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Not remembering is fine.
  }
}

/** This device was signed in to an account, so losing the session is worth telling. */
export const hadAccount = () => read(HAD_ACCOUNT) === "1";
export const setHadAccount = (on: boolean) => write(HAD_ACCOUNT, on ? "1" : null);

/** Home shows "You've been signed out" until dismissed or the player signs in. */
export const signedOutNotice = () => read(SIGNED_OUT) === "1";
export const setSignedOutNotice = (on: boolean) => write(SIGNED_OUT, on ? "1" : null);

/** The account's name, cached for name prompts. */
export const cachedAccountName = () => read(ACCOUNT_NAME);
export const setCachedAccountName = (name: string | null) => write(ACCOUNT_NAME, name);

export type StoredTicket = { ticket: string; expiresAt: string };

/** The guest's merge ticket, kept until it's redeemed or expires. */
export function storedTicket(now = Date.now()): StoredTicket | null {
  const raw = read(TICKET);
  if (!raw) return null;
  try {
    const t = JSON.parse(raw) as StoredTicket;
    if (typeof t.ticket !== "string" || !(Date.parse(t.expiresAt) > now)) {
      write(TICKET, null);
      return null;
    }
    return t;
  } catch {
    write(TICKET, null);
    return null;
  }
}
export const storeTicket = (t: StoredTicket | null) => write(TICKET, t ? JSON.stringify(t) : null);

type SavePrompt = { pending?: boolean; snoozedUntil?: number };

function savePrompt(): SavePrompt {
  try {
    return (JSON.parse(read(SAVE_PROMPT) ?? "{}") as SavePrompt) ?? {};
  } catch {
    return {};
  }
}

/** A guest contestant finished a game: offer "Save your games" back on Home. */
export function markGamePlayed(): void {
  write(SAVE_PROMPT, JSON.stringify({ ...savePrompt(), pending: true }));
}

export function shouldShowSavePrompt(now = Date.now()): boolean {
  const p = savePrompt();
  return p.pending === true && !(typeof p.snoozedUntil === "number" && p.snoozedUntil > now);
}

/** "Not now": hidden for 7 days, and until another game finishes. */
export function snoozeSavePrompt(now = Date.now()): void {
  write(SAVE_PROMPT, JSON.stringify({ pending: false, snoozedUntil: now + SAVE_PROMPT_SNOOZE_MS }));
}

export const clearSavePrompt = () => write(SAVE_PROMPT, null);
