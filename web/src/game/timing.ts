// Mirrors the server's timings in game/internal/play/game.go; keep the two in sync.

/** How long buzzing stays open (and each reopen). */
export const BUZZ_WINDOW_MS = 5000;
/** How long a phone listens for an answer. */
export const ANSWER_MS = 14000;
/** How long the server waits after that for the final transcript. */
export const ANSWER_GRACE_MS = 1500;
/** The answering countdown: the server's whole answer deadline. */
export const ANSWER_TOTAL_MS = ANSWER_MS + ANSWER_GRACE_MS;
