// Mirrors the server's timings in game/internal/play/game.go; keep the two in sync.

/** The pick reveal: the picked cell blinks (0.6 s), grows into the category card (0.6 s), and
 * the card holds (1.05 s) so the room can read it. The server opens buzzing only after it
 * (play.PickReveal, play.PickBlink). */
export const PICK_REVEAL_MS = 2250;
export const PICK_BLINK_MS = 600;

/** How long buzzing stays open (and each reopen). */
export const BUZZ_WINDOW_MS = 9000;
/** How long a phone listens for an answer. */
export const ANSWER_MS = 9000;
/** How long the server waits after that for the final transcript. */
export const ANSWER_GRACE_MS = 1500;
/** The answering countdown: the server's whole answer deadline. */
export const ANSWER_TOTAL_MS = ANSWER_MS + ANSWER_GRACE_MS;

/** This game's windows (the lobby's timer pace, from the snapshot); Standard when unknown. */
export function buzzWindowMs(s: { buzzWindowMs?: number }): number {
  return s.buzzWindowMs ?? BUZZ_WINDOW_MS;
}
export function answerMs(s: { answerWindowMs?: number }): number {
  return s.answerWindowMs ?? ANSWER_MS;
}

// Wagers (docs/product-docs/features/wagers/interaction-design.md, "Timing").

/** "DAILY DOUBLE" over the stage before the wager. */
export const DD_REVEAL_MS = 2000;
/** How long a player has to wager (Daily Double and Final). */
export const WAGER_MS = 30000;
/** "FINAL SCHMEGETTES" title before the category. */
export const FINAL_TITLE_MS = 3000;
/** How long finalists have to type, from the end of the reading. */
export const FINAL_ANSWER_MS = 30000;
/** One finalist's reveal, and the gap between its lines. */
export const REVEAL_STEP_MS = 8000;
export const REVEAL_LINE_MS = 2000;
/** "Nobody's in the black" before the final scores. */
export const FINAL_SKIPPED_MS = 4000;
/** How long a phone waits after a keystroke before sending its Final draft. */
export const DRAFT_DEBOUNCE_MS = 300;
