import { Text, UnstyledButton } from "@mantine/core";
import type { BoardClue } from "../lib/room";

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
  background: "var(--mantine-color-boardBlue-9)",
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
        gap: tv ? 6 : 4,
        height: tv ? "100%" : undefined,
        width: "100%",
      }}
    >
      {cols.map((col) => (
        <div
          key={col.category}
          style={{
            display: "grid",
            gridTemplateRows: tv ? `minmax(0, 1.3fr) repeat(${rows}, minmax(0, 1fr))` : `44px repeat(${rows}, 36px)`,
            gap: tv ? 6 : 4,
            minHeight: 0,
          }}
        >
          <Text
            c="white"
            fw={700}
            tt="uppercase"
            ta="center"
            p={4}
            style={{
              ...cell,
              minHeight: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
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
          </Text>
          {col.clues.map((clue) => {
            const open = clue.state === "unplayed";
            return (
              <UnstyledButton
                key={clue.clueId}
                disabled={!onPick || !open}
                onClick={() => onPick?.(clue.clueId)}
                aria-label={open ? `${col.category} for ${clue.value}` : `${col.category} ${clue.value}, done`}
                style={{
                  ...cell,
                  minHeight: 0,
                  padding: 2,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: onPick && open ? "pointer" : "default",
                }}
              >
                <Text
                  c="yellow.4"
                  fw={800}
                  style={{ fontSize: tv ? "clamp(12px, min(2.6vw, 6vh), 44px)" : 14, lineHeight: 1 }}
                >
                  {open ? clue.value : " "}
                </Text>
              </UnstyledButton>
            );
          })}
        </div>
      ))}
    </section>
  );
}
