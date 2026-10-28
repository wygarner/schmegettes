import { SimpleGrid, Text, UnstyledButton } from "@mantine/core";
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

/** The board: category names and values only (never clue text). Tappable when onPick is set. */
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
  return (
    <SimpleGrid cols={Math.max(cols.length, 1)} spacing={tv ? "xs" : 4} aria-label="Board">
      {cols.map((col) => (
        <div key={col.category} style={{ display: "flex", flexDirection: "column", gap: tv ? 8 : 4 }}>
          <Text
            c="white"
            fw={700}
            tt="uppercase"
            ta="center"
            size={tv ? "md" : "xs"}
            p={tv ? "sm" : 4}
            style={{
              ...cell,
              minHeight: tv ? 72 : 40,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {col.category}
          </Text>
          {col.clues.map((clue) => {
            const open = clue.state === "unplayed";
            return (
              <UnstyledButton
                key={clue.clueId}
                disabled={!onPick || !open}
                onClick={() => onPick?.(clue.clueId)}
                aria-label={open ? `${col.category} for ${clue.value}` : `${col.category} ${clue.value}, done`}
                style={{ ...cell, padding: tv ? 16 : 8, cursor: onPick && open ? "pointer" : "default" }}
              >
                <Text c="yellow.4" fw={800} size={tv ? "xl" : "sm"}>
                  {open ? clue.value : " "}
                </Text>
              </UnstyledButton>
            );
          })}
        </div>
      ))}
    </SimpleGrid>
  );
}
