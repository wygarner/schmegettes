import type { ClientMessage } from "@schmegettes/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import type { RoomState } from "../lib/room";
import { createRecognizer, type Recognizer } from "../lib/speech";
import { ANSWER_MS } from "./timing";

const PROGRESS_MS = 250;

type Alternatives = NonNullable<Extract<ClientMessage, { type: "submit_answer" }>["alternatives"]>;

/** The first four guesses, as the contract's 0–4 item tuple. */
function upToFour([a, b, c, d]: string[]): Alternatives {
  if (a === undefined) return [];
  if (b === undefined) return [a];
  if (c === undefined) return [a, b];
  if (d === undefined) return [a, b, c];
  return [a, b, c, d];
}

/**
 * Listens for this player's spoken answer. iOS only starts the microphone from a tap, so
 * listening starts inside the buzz tap (begin), before the server says who won. If this
 * player wins, the words are streamed (answer_progress) and the final text is submitted;
 * if not, the recording is thrown away.
 */
export function useAnswerCapture(state: RoomState, userId: string, send: (m: ClientMessage) => void) {
  const recRef = useRef<Recognizer | null>(null);
  const clueRef = useRef<string>("");
  const confirmedRef = useRef(false);
  const finalRef = useRef<{ text: string; alternatives: string[] } | null>(null);
  const lastSentRef = useRef(0);
  const capRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState("");

  const submit = useCallback(
    (text: string, alternatives: string[] = []) => {
      confirmedRef.current = false;
      clearTimeout(capRef.current);
      send({
        type: "submit_answer",
        clueId: clueRef.current,
        answer: text.slice(0, 200),
        source: "voice",
        // Other guesses only when the recognizer gave some, so the message stays as before.
        ...(alternatives.length > 0 && { alternatives: upToFour(alternatives.map((a) => a.slice(0, 200))) }),
      });
    },
    [send],
  );

  const reset = useCallback(() => {
    clearTimeout(capRef.current);
    recRef.current?.abort();
    recRef.current = null;
    confirmedRef.current = false;
    finalRef.current = null;
    setListening(false);
    setHeard("");
  }, []);

  const start = useCallback(
    (clueId: string) => {
      if (recRef.current) return;
      const rec = createRecognizer();
      if (!rec) return;
      clueRef.current = clueId;
      finalRef.current = null;
      setHeard("");
      rec.onInterim = (text) => {
        setHeard(text);
        const now = Date.now();
        if (confirmedRef.current && now - lastSentRef.current >= PROGRESS_MS) {
          lastSentRef.current = now;
          send({ type: "answer_progress", clueId: clueRef.current, text: text.slice(0, 200) });
        }
      };
      rec.onFinal = (text, alternatives = []) => {
        recRef.current = null;
        setListening(false);
        if (confirmedRef.current) submit(text, alternatives);
        else finalRef.current = { text, alternatives };
      };
      try {
        rec.start();
        recRef.current = rec;
        setListening(true);
      } catch {
        // Couldn't start (no permission): silence counts as wrong once the window closes.
      }
    },
    [send, submit],
  );

  /** Call from the buzz tap. */
  const begin = useCallback(
    (clueId: string) => {
      if (state.phase === "buzzing_open") start(clueId);
    },
    [state.phase, start],
  );

  const clueId = state.activeClue?.clueId;
  const mine = state.phase === "answering" && state.answeringUserId === userId;
  useEffect(() => {
    if (mine && !confirmedRef.current && clueId) {
      confirmedRef.current = true;
      clueRef.current = clueId;
      if (finalRef.current !== null) {
        submit(finalRef.current.text, finalRef.current.alternatives);
        return;
      }
      if (!recRef.current) start(clueId);
      capRef.current = setTimeout(() => recRef.current?.stop(), ANSWER_MS);
      return;
    }
    if (!mine && state.phase !== "buzzing_open") {
      // Someone else won, or the clue moved on: drop any recording.
      if (recRef.current || confirmedRef.current) reset();
    }
  }, [mine, clueId, state.phase, start, submit, reset]);

  useEffect(() => reset, [reset]);

  return { begin, listening, heard: mine ? heard : "" };
}
