// The pick reveal on the host device: the picked cell blinks (0.6 s), then lifts out of the
// board and grows into a card with the category and value (0.9 s), then the clue screen takes
// over. A Daily Double blinks only, then shows its own reveal. Nothing waits on speech or the
// network. Rules: docs/product-docs/features/gameplay/interaction-design.md, "Pick reveal".

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { BoardClue, RoomState } from "../lib/room";
import { ACCENT, BEVEL, CELL, DISPLAY } from "../ui/tokens";
import { Board } from "./Board";
import { PICK_BLINK_MS, PICK_REVEAL_MS } from "./timing";

export type RevealStage = "blink" | "card" | null;

/** How long the card takes to grow out of the cell; it holds for the rest of the reveal. */
const GROW_MS = 600;

/**
 * Where the reveal is now. The first stage is known in the same render the reveal arrives,
 * so nothing that waits for the reveal (the narrator) can start a frame early.
 */
export function usePickReveal(reveal: RoomState["reveal"]): RevealStage {
  const key = reveal ? `${reveal.clueId}:${reveal.kind}` : "";
  const kind = reveal?.kind;
  const [current, setCurrent] = useState<{ key: string; stage: RevealStage }>({ key: "", stage: null });
  let stage = current.stage;
  if (current.key !== key) {
    stage = key ? "blink" : null;
    setCurrent({ key, stage });
  }
  useEffect(() => {
    if (!key) return;
    const to = (next: RevealStage) => () => setCurrent((c) => (c.key === key ? { key, stage: next } : c));
    const timers = [setTimeout(to(kind === "card" ? "card" : null), PICK_BLINK_MS)];
    if (kind === "card") timers.push(setTimeout(to(null), PICK_REVEAL_MS));
    return () => {
      for (const t of timers) clearTimeout(t);
    };
  }, [key, kind]);
  return stage;
}

/** The stage during a reveal: the board with the cell blinking, then the card over it. */
export function PickRevealStage({ board, clue, stage }: { board: BoardClue[]; clue: BoardClue; stage: RevealStage }) {
  const wrap = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const showCard = stage === "card";

  useLayoutEffect(() => {
    const el = card.current;
    if (!showCard || !el || typeof el.animate !== "function") return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: GROW_MS, fill: "both" });
      return;
    }
    // FLIP: start the card where the cell is, then let it grow into place.
    const cell = wrap.current?.querySelector(`[data-clue-id="${CSS.escape(clue.clueId)}"]`);
    const from = cell?.getBoundingClientRect();
    const to = el.getBoundingClientRect();
    if (!from || !to.width || !to.height) return;
    const dx = from.left + from.width / 2 - (to.left + to.width / 2);
    const dy = from.top + from.height / 2 - (to.top + to.height / 2);
    el.animate(
      [
        { transform: `translate(${dx}px, ${dy}px) scale(${from.width / to.width}, ${from.height / to.height})` },
        { transform: "none" },
      ],
      { duration: GROW_MS, easing: "cubic-bezier(.2,.8,.2,1)", fill: "both" },
    );
  }, [showCard, clue.clueId]);

  return (
    <div ref={wrap} style={{ position: "relative", height: "100%" }}>
      <div style={{ height: "100%", opacity: showCard ? 0.35 : 1, transition: "opacity 300ms" }}>
        <Board board={board} blinkClueId={clue.clueId} />
      </div>
      {showCard && (
        <div
          style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <div
            ref={card}
            role="img"
            aria-label={`${clue.category} for $${clue.value.toLocaleString("en-US")}`}
            style={{
              width: "60%",
              aspectRatio: "16 / 9",
              background: CELL,
              boxShadow: BEVEL,
              borderRadius: 10,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "4%",
              padding: "4%",
              textAlign: "center",
            }}
          >
            <span
              style={{
                fontFamily: DISPLAY,
                fontWeight: 600,
                color: "#fff",
                textTransform: "uppercase",
                fontSize: "clamp(16px, min(4vw, 8vh), 56px)",
                lineHeight: 1.05,
              }}
            >
              {clue.category}
            </span>
            <span
              style={{
                fontFamily: DISPLAY,
                fontWeight: 700,
                color: ACCENT,
                textShadow: "0 2px 0 rgba(0,0,0,.55)",
                fontSize: "clamp(20px, min(6vw, 12vh), 80px)",
                lineHeight: 1,
              }}
            >
              ${clue.value.toLocaleString("en-US")}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
