import type { ClientMessage } from "@schmegettes/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { matchPickAny } from "../lib/pickByVoice";
import type { BoardClue } from "../lib/room";
import { createRecognizer, type Recognizer, recognitionSupported } from "../lib/speech";

const PROBLEMS = {
  "no-category": "Didn't catch the category.",
  ambiguous: "Didn't catch the category.",
  "no-value": "Didn't catch the amount.",
  taken: "That one's already been played.",
} as const;

export type VoicePickMiss = Omit<Extract<ClientMessage, { type: "voice_pick_missed" }>, "type">;

function clippedAlternatives(alternatives: string[]): VoicePickMiss["alternatives"] {
  const clipped = alternatives.slice(0, 4).map((alternative) => alternative.slice(0, 200));
  switch (clipped.length) {
    case 4:
      return [clipped[0] ?? "", clipped[1] ?? "", clipped[2] ?? "", clipped[3] ?? ""];
    case 3:
      return [clipped[0] ?? "", clipped[1] ?? "", clipped[2] ?? ""];
    case 2:
      return [clipped[0] ?? "", clipped[1] ?? ""];
    case 1:
      return [clipped[0] ?? ""];
    default:
      return [];
  }
}

export interface VoicePick {
  listening: boolean;
  /** What was heard so far. */
  heard: string;
  /** Why the last attempt picked nothing. */
  problem: string;
  /** Start listening, or stop if already listening (nothing is picked then). */
  toggle: () => void;
  cancel: () => void;
  /** This game's Quick picks option: just a category picks its lowest clue left. */
  quickPicks: boolean;
}

/**
 * A spoken pick: the player in control presses their buzzer and says "Science for 400", and
 * the matching clue is picked with no confirmation. There is no separate microphone button
 * (docs/product-docs/features/gameplay/interaction-design.md).
 */
export function useVoicePick(
  board: BoardClue[],
  onPick: (clueId: string) => void,
  quickPicks = false,
  report: (miss: VoicePickMiss) => void = () => {},
): VoicePick {
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState("");
  const [problem, setProblem] = useState("");
  const recRef = useRef<Recognizer | null>(null);
  const latest = useRef({ board, onPick, quickPicks, report });
  latest.current = { board, onPick, quickPicks, report };

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
    rec.onFinal = (text, alternatives = []) => {
      if (recRef.current !== rec) return; // cancelled
      recRef.current = null;
      setListening(false);
      setHeard(text);
      if (!text) {
        setProblem("Didn't hear anything.");
        latest.current.report({ problem: "nothing-heard", heard: "", alternatives: clippedAlternatives(alternatives) });
        return;
      }
      const hearings = [text, ...alternatives];
      const pick = matchPickAny(hearings, latest.current.board, { quickPicks: latest.current.quickPicks });
      if ("clueId" in pick) latest.current.onPick(pick.clueId);
      else {
        setProblem(PROBLEMS[pick.problem]);
        latest.current.report({
          problem: pick.problem,
          heard: text.slice(0, 200),
          alternatives: clippedAlternatives(alternatives),
        });
      }
    };
    try {
      rec.start(); // from the press: iOS only opens the microphone from a user gesture
      recRef.current = rec;
      setListening(true);
    } catch {
      setProblem("Turn on the microphone to pick by voice.");
    }
  }, [cancel]);

  return { listening, heard, problem, toggle, cancel, quickPicks };
}
