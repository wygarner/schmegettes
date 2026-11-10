import { useCallback, useEffect, useRef, useState } from "react";
import { matchPick } from "../lib/pickByVoice";
import type { BoardClue } from "../lib/room";
import { createRecognizer, type Recognizer, recognitionSupported } from "../lib/speech";

const PROBLEMS = {
  "no-category": "Didn't catch the category.",
  "no-value": "Didn't catch the amount.",
  taken: "That one's already been played.",
} as const;

export interface VoicePick {
  listening: boolean;
  /** What was heard so far. */
  heard: string;
  /** Why the last attempt picked nothing. */
  problem: string;
  /** Start listening, or stop if already listening (nothing is picked then). */
  toggle: () => void;
  cancel: () => void;
}

/**
 * A spoken pick: the player in control presses their buzzer and says "Science for 400", and
 * the matching clue is picked with no confirmation. There is no separate microphone button
 * (docs/product-docs/features/gameplay/interaction-design.md).
 */
export function useVoicePick(board: BoardClue[], onPick: (clueId: string) => void): VoicePick {
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState("");
  const [problem, setProblem] = useState("");
  const recRef = useRef<Recognizer | null>(null);
  const latest = useRef({ board, onPick });
  latest.current = { board, onPick };

  useEffect(() => () => recRef.current?.abort(), []);

  const cancel = useCallback(() => {
    const rec = recRef.current;
    recRef.current = null;
    rec?.abort();
    setListening(false);
  }, []);

  const toggle = useCallback(() => {
    if (recRef.current) {
      cancel();
      return;
    }
    setHeard("");
    setProblem("");
    if (!recognitionSupported()) {
      setProblem("This browser can't hear picks.");
      return;
    }
    const rec = createRecognizer();
    if (!rec) return;
    rec.onInterim = setHeard;
    rec.onFinal = (text) => {
      if (recRef.current !== rec) return; // cancelled
      recRef.current = null;
      setListening(false);
      setHeard(text);
      if (!text) {
        setProblem("Didn't hear anything.");
        return;
      }
      const pick = matchPick(text, latest.current.board);
      if ("clueId" in pick) latest.current.onPick(pick.clueId);
      else setProblem(PROBLEMS[pick.problem]);
    };
    try {
      rec.start(); // from the press: iOS only opens the microphone from a user gesture
      recRef.current = rec;
      setListening(true);
    } catch {
      setProblem("Turn on the microphone to pick by voice.");
    }
  }, [cancel]);

  return { listening, heard, problem, toggle, cancel };
}
