import { Button, Stack, Text } from "@mantine/core";
import { useEffect, useRef, useState } from "react";
import { matchPick } from "../lib/pickByVoice";
import type { BoardClue } from "../lib/room";
import { createRecognizer, type Recognizer, recognitionSupported } from "../lib/speech";

const PROBLEMS = {
  "no-category": "Didn't catch the category.",
  "no-value": "Didn't catch the amount.",
  taken: "That one's already been played.",
} as const;

/** "Say it": the player says "Science for 400" and the matching clue is picked. */
export function VoicePick({ board, onPick }: { board: BoardClue[]; onPick: (clueId: string) => void }) {
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState("");
  const [problem, setProblem] = useState("");
  const recRef = useRef<Recognizer | null>(null);

  useEffect(() => () => recRef.current?.abort(), []);

  if (!recognitionSupported()) return null;

  function listen() {
    if (recRef.current) return;
    const rec = createRecognizer();
    if (!rec) return;
    setHeard("");
    setProblem("");
    rec.onInterim = setHeard;
    rec.onFinal = (text) => {
      recRef.current = null;
      setListening(false);
      setHeard(text);
      if (!text) {
        setProblem("Didn't hear anything.");
        return;
      }
      const pick = matchPick(text, board);
      if ("clueId" in pick) onPick(pick.clueId);
      else setProblem(PROBLEMS[pick.problem]);
    };
    try {
      rec.start(); // from the tap: iOS only opens the microphone from a user gesture
      recRef.current = rec;
      setListening(true);
    } catch {
      setProblem("Turn on the microphone to pick by voice.");
    }
  }

  return (
    <Stack gap={4} align="center">
      <Button size="lg" fullWidth variant={listening ? "filled" : "light"} onClick={listen} aria-label="Say a clue">
        {listening ? "Listening…" : "🎤 Say it: “Science for 400”"}
      </Button>
      {heard && (
        <Text size="sm" c="dimmed" aria-label="What we heard">
          “{heard}”
        </Text>
      )}
      {problem && (
        <Text size="sm" c="red">
          {problem} Try again, or tap a clue.
        </Text>
      )}
    </Stack>
  );
}
