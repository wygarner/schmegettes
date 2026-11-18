import { UnstyledButton } from "@mantine/core";
import { useState } from "react";
import type { BoardClue } from "../lib/room";
import { ACCENT, BEVEL, CELL, DISPLAY } from "../ui/tokens";

/** Groups clues into columns by category, keeping the server's order. */
export function columns(board: BoardClue[]): { category: string; clues: BoardClue[] }[] {
  const out: { category: string; clues: BoardClue[] }[] = [];
  for (const clue of board) {
    let col = out.find((c) => c.category === clue.category);
    if (!col) {
      col = { category: clue.category, clues: [] };
      out.push(col);
    }
    col.clues.push(clue);
  }
  for (const col of out) col.clues.sort((a, b) => a.value - b.value);
  return out;
}

const cell = {
  background: CELL,
  borderRadius: 4,
  textAlign: "center" as const,
};

/**
 * The board: category names and values only (never clue text). Tappable when onPick is set.
 * The TV size fills its container (header plus one row per value), so it fits the host's
 * iPhone in landscape; the phone size is a compact grid.
 */
export function Board({
  board,
  onPick,
  size = "tv",
}: {
  board: BoardClue[];
  onPick?: (clueId: string) => void;
  size?: "tv" | "phone";
}) {
  const cols = columns(board);
  const tv = size === "tv";
  const rows = Math.max(1, ...cols.map((c) => c.clues.length));
  return (
    <section
      aria-label="Board"
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${Math.max(cols.length, 1)}, minmax(0, 1fr))`,
        gap: tv ? 5 : 4,
        height: tv ? "100%" : undefined,
        width: "100%",
      }}
    >
      {cols.map((col) => (
        <div
          key={col.category}
          style={{
            display: "grid",
            gridTemplateRows: tv ? `minmax(0, 1.35fr) repeat(${rows}, minmax(0, 1fr))` : `52px repeat(${rows}, 48px)`,
            gap: tv ? 5 : 4,
            minHeight: 0,
          }}
        >
          <div
            lang="en"
            style={{
              ...cell,
              boxShadow: BEVEL,
              minHeight: 0,
              padding: 3,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
              color: "#fff",
              fontWeight: 700,
              textTransform: "uppercase",
              lineHeight: 1.1,
              fontSize: tv ? "clamp(9px, min(1.6vw, 3vh), 22px)" : 9,
              overflowWrap: "break-word",
              hyphens: "auto",
            }}
          >
            <span
              style={{ display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}
            >
              {col.category}
            </span>
          </div>
          {col.clues.map((clue) => (
            <Cell key={clue.clueId} clue={clue} category={col.category} tv={tv} onPick={onPick} />
          ))}
        </div>
      ))}
    </section>
  );
}

function Cell({
  clue,
  category,
  tv,
  onPick,
}: {
  clue: BoardClue;
  category: string;
  tv: boolean;
  onPick?: (clueId: string) => void;
}) {
  const [down, setDown] = useState(false);
  const open = clue.state === "unplayed";
  const live = Boolean(onPick) && open;
  return (
    <UnstyledButton
      disabled={!live}
      onClick={() => onPick?.(clue.clueId)}
      onPointerDown={() => live && setDown(true)}
      onPointerUp={() => setDown(false)}
      onPointerLeave={() => setDown(false)}
      aria-label={open ? `${category} for ${clue.value}` : `${category} ${clue.value}, done`}
      style={{
        ...cell,
        boxShadow: open ? BEVEL : "none",
        minHeight: 0,
        padding: 2,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: live ? "pointer" : "default",
        transform: down ? "scale(.94)" : "none",
        transition: "transform 80ms",
      }}
    >
      {open && (
        <span
          style={{
            fontFamily: DISPLAY,
            fontWeight: 700,
            color: ACCENT,
            textShadow: "0 2px 0 rgba(0,0,0,.55)",
            fontSize: tv ? "clamp(14px, min(3vw, 6.5vh), 46px)" : 18,
            lineHeight: 1,
          }}
        >
          {clue.value.toLocaleString("en-US")}
        </span>
      )}
    </UnstyledButton>
  );
}
