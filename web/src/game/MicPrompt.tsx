import { Alert, Button } from "@mantine/core";
import { useState } from "react";
import { type MicState, recognitionSupported, requestMicrophone } from "../lib/speech";

/** Asks for the microphone in the lobby, so answering mid-game doesn't stall on a prompt. */
export function MicPrompt() {
  const [mic, setMic] = useState<MicState>("unknown");
  if (!recognitionSupported()) {
    return <Alert color="yellow">This browser can't hear answers. Try Chrome or Safari.</Alert>;
  }
  if (mic === "granted") return null;
  if (mic === "denied" || mic === "unsupported") {
    return (
      <Alert color="red">
        Turn on the microphone to answer: allow it for this site in your browser settings, then reload. Without it, a
        buzz counts as no answer.
      </Alert>
    );
  }
  return (
    <Button variant="light" onClick={async () => setMic(await requestMicrophone())}>
      Allow the microphone so you can answer
    </Button>
  );
}
