import { UnstyledButton } from "@mantine/core";
import { useId, useState } from "react";
import { unlockAudio } from "../lib/piper/audio";
import { playBuzz } from "../lib/sfx";

/**
 * idle: no clue in play (lobby, board without control, between clues); a tap only animates.
 * dim: the clue is being read; a tap is an early buzz.
 * lit: buzzing is open. early: just locked out. answering: this player won the buzz.
 * locked: this player already tried this clue.
 * pick: this player has control on the board; a press listens for a spoken pick.
 * listening: listening for that pick; a press cancels.
 */
export type BuzzerState = "idle" | "dim" | "lit" | "early" | "answering" | "locked" | "pick" | "listening";

/** What screen readers hear about the state. The button's name is always "Buzz". */
const DESCRIPTION: Record<BuzzerState, string> = {
  idle: "Not now",
  dim: "Get ready",
  lit: "Buzz now",
  early: "Too early",
  answering: "Answer now",
  locked: "You've answered this one",
  pick: "Press and say your pick",
  listening: "Listening for your pick",
};

/** Dome gradient stops: highlight, body, shade, rim. */
const RED_UNLIT = ["#d98585", "#a3201f", "#6d0c0c", "#360303"];
const RED_LIT = ["#ffb8b8", "#ff3030", "#d40c0c", "#7a0404"];
const GREEN = ["#c2f7cd", "#37c95a", "#1c8f37", "#0b4a1a"];
const DOME: Record<BuzzerState, { stops: string[]; glow?: string }> = {
  idle: { stops: RED_UNLIT },
  dim: { stops: RED_UNLIT },
  lit: { stops: RED_LIT, glow: "sg-glow-red" },
  early: { stops: ["#8f6060", "#5c1414", "#3a0808", "#1c0202"] },
  answering: { stops: GREEN, glow: "sg-glow-green" },
  locked: { stops: ["#8a8c99", "#4b4d5c", "#30313d", "#18181f"] },
  pick: { stops: RED_LIT, glow: "sg-glow-red-slow" },
  listening: { stops: GREEN, glow: "sg-glow-green" },
};

/** States in which a press does something: a buzz, an early buzz, or a spoken pick. */
const ACTIVE: BuzzerState[] = ["dim", "lit", "pick", "listening"];

/** Presses that make the buzzer's sound: a buzz (early or not) and starting a spoken pick. */
const SOUNDS: BuzzerState[] = ["dim", "lit", "pick"];

/**
 * The buzzer's sound for a press in this state, the moment the finger lands. The press also
 * unlocks this device's sound (iOS wants a tap). Rules: sound-effects feature brief.
 */
export function pressSound(state: BuzzerState): void {
  unlockAudio();
  if (SOUNDS.includes(state)) void playBuzz();
}

/**
 * The one buzzer, on phones and the host device: an oblong red dome the full width of its
 * container, in a dark rim, with no lettering. At least 64 px tall. The state shows in the
 * dome's color and light (docs/product-docs/architecture/design-system.md, "Buzzer").
 */
export function Buzzer({ state, onBuzz, height = 120 }: { state: BuzzerState; onBuzz: () => void; height?: number }) {
  const [down, setDown] = useState(false);
  const describedBy = useId();
  const h = Math.max(height, 64);
  const big = h >= 90;
  const rimPad = big ? 7 : 5;
  const travel = big ? 6 : 4;
  const pressed = down && state !== "locked";
  const [hi, body, shade, rim] = DOME[state].stops;
  const glow = DOME[state].glow;
  return (
    <UnstyledButton
      aria-label="Buzz"
      aria-describedby={describedBy}
      data-state={state}
      disabled={state === "locked"}
      className={state === "early" ? "sg-shake" : undefined}
      onPointerDown={() => {
        setDown(true);
        if (state !== "locked") pressSound(state);
      }}
      onPointerUp={() => setDown(false)}
      onPointerLeave={() => setDown(false)}
      // idle, early and answering taps do nothing but the press animation
      onClick={ACTIVE.includes(state) ? onBuzz : undefined}
      style={{
        display: "block",
        width: "100%",
        height: h,
        flexShrink: 0,
        borderRadius: h / 2,
        padding: `${rimPad}px ${rimPad}px ${rimPad + travel}px`,
        background: "linear-gradient(180deg, #34364c 0%, #15161f 100%)",
        boxShadow: `0 3px 8px rgba(0,0,0,.6), inset 0 1px 0 rgba(255,255,255,.14)${
          state === "dim" ? ", 0 0 0 2px rgba(255,70,70,.45)" : ""
        }`,
        opacity: state === "locked" ? 0.55 : 1,
        cursor: state === "locked" ? "not-allowed" : "pointer",
        userSelect: "none",
        touchAction: "manipulation",
        WebkitTapHighlightColor: "transparent",
      }}
    >
      <span
        aria-hidden
        className={glow}
        style={{
          position: "relative",
          display: "block",
          width: "100%",
          height: "100%",
          borderRadius: 999,
          background: `radial-gradient(ellipse 75% 120% at 50% 18%, ${hi} 0%, ${body} 38%, ${shade} 78%, ${rim} 100%)`,
          transform: pressed ? `translateY(${travel - 1}px)` : "none",
          boxShadow: pressed
            ? `0 1px 0 ${rim}, inset 0 -2px 6px rgba(0,0,0,.35)`
            : `0 ${travel}px 0 ${rim}, 0 ${travel + 2}px 6px rgba(0,0,0,.5), inset 0 -3px 8px rgba(0,0,0,.3)`,
          transition: "transform 60ms, box-shadow 60ms",
        }}
      >
        <span
          style={{
            position: "absolute",
            left: "10%",
            right: "10%",
            top: "8%",
            height: "34%",
            borderRadius: 999,
            background: "linear-gradient(180deg, rgba(255,255,255,.6) 0%, rgba(255,255,255,0) 100%)",
          }}
        />
      </span>
      <span id={describedBy} style={VISUALLY_HIDDEN}>
        {DESCRIPTION[state]}
      </span>
    </UnstyledButton>
  );
}

const VISUALLY_HIDDEN = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
  border: 0,
} as const;
