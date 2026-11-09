import type { RoomState } from "../lib/room";
import type { BuzzerState } from "./Buzzer";

/** Whether this player may buzz right now (a press during the reading is an early buzz). */
export function canBuzz(state: RoomState, userId: string): boolean {
  const between = Boolean(state.clueEnd || state.roundIntro);
  // Nobody buzzes on a Daily Double: the picker answers alone.
  if (state.activeClue?.dailyDouble) return false;
  return (
    (state.phase === "clue_reading" || state.phase === "buzzing_open") &&
    !state.attemptedUserIds.includes(userId) &&
    !state.paused &&
    !between
  );
}

/** How this player's buzzer looks. `early` is the 250 ms flash after a lockout. */
export function buzzerState(state: RoomState, userId: string, early: boolean): BuzzerState {
  if (state.paused || state.results || state.clueEnd || state.roundIntro) return "idle";
  if (state.phase === "answering" && state.answeringUserId === userId) return "answering";
  const inClue = Boolean(state.activeClue) && state.phase !== "board" && state.phase !== "lobby";
  if (inClue && state.attemptedUserIds.includes(userId)) return "locked";
  if (!canBuzz(state, userId)) return "idle";
  if (early) return "early";
  return state.phase === "buzzing_open" ? "lit" : "dim";
}
