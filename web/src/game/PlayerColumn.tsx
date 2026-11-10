import { useRef } from "react";
import { money } from "../lib/money";
import { inFinal, type Player, type RoomState } from "../lib/room";
import { ACCENT, BEVEL, DISPLAY, GREEN, INK, RED, SOFT, TILE_BG } from "../ui/tokens";
import { REVEAL_LINE_MS, REVEAL_STEP_MS } from "./timing";
import { useSince } from "./useSince";

/**
 * Every contestant's name and score, in join order, on every host screen. The player in
 * control is highlighted. Up to 4 players get two-line tiles; 5 or 6 get one-line tiles.
 * Tiles share the column's height, so 6 of them fit above the host's buzzer at 667 × 320.
 * In Final, tiles say who has locked in (never an amount), and players not in Final are
 * dimmed.
 */
export function PlayerColumn({ state }: { state: RoomState }) {
  const players = state.players.filter((p) => p.role === "contestant" || p.role === "host");
  const oneLine = players.length > 4;
  const final = inFinal(state.phase);

  // During a Final reveal, the new score lands on the reveal's last line.
  const current = state.phase === "final_reveal" ? state.reveals[state.reveals.length - 1] : undefined;
  const since = useSince(current ? `${current.userId}:${state.reveals.length}` : "", REVEAL_STEP_MS);
  const held = current && since < 3 * REVEAL_LINE_MS ? current : undefined;

  // Each new verdict floats its amount over that player's tile once.
  const verdict = state.lastVerdict;
  const seen = useRef<{ verdict?: typeof verdict; key: number }>({ key: 0 });
  if (seen.current.verdict !== verdict) seen.current = { verdict, key: seen.current.key + 1 };
  const verdictKey = seen.current.key;

  return (
    <ol
      aria-label="Scores"
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        gap: 4,
        listStyle: "none",
        margin: 0,
        padding: 0,
      }}
    >
      {players.map((p) => {
        const finalist = state.finalistUserIds.includes(p.userId);
        const locked = state.lockedUserIds.includes(p.userId);
        let label: string | undefined;
        let highlight = false;
        if (final) {
          if (!finalist) label = "not in Final";
          else if (state.phase === "final_category" || state.phase === "final_wager")
            label = locked ? "✓ locked" : "wagering…";
          else if (state.phase === "final_answer") label = locked ? "✓ submitted" : "writing…";
        } else if (state.phase !== "lobby" && state.controllingUserId === p.userId) {
          highlight = true;
          label = state.phase === "daily_double_wager" ? "WAGERING" : "PICKING";
        }
        const score = (state.scores[p.userId] ?? 0) - (held?.userId === p.userId ? held.delta : 0);
        return (
          <Tile
            key={p.userId}
            player={p}
            score={score}
            label={label}
            highlight={highlight}
            dim={final && !finalist}
            oneLine={oneLine}
            delta={verdict?.userId === p.userId ? { amount: verdict.delta, key: verdictKey } : undefined}
          />
        );
      })}
    </ol>
  );
}

function Tile({
  player,
  score,
  label,
  highlight,
  dim,
  oneLine,
  delta,
}: {
  player: Player;
  score: number;
  label?: string;
  highlight: boolean;
  dim: boolean;
  oneLine: boolean;
  delta?: { amount: number; key: number };
}) {
  const name = (
    <span
      style={{
        minWidth: 0,
        flex: 1,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        fontWeight: 700,
        fontSize: oneLine ? 13 : 15,
        color: "#fff",
      }}
    >
      {player.displayName}
      {!player.connected && <span style={{ fontWeight: 500, fontSize: 11, color: SOFT }}> (reconnecting)</span>}
    </span>
  );
  const points = (
    <span
      style={{
        flexShrink: 0,
        fontFamily: DISPLAY,
        fontWeight: 600,
        fontSize: oneLine ? 17 : 21,
        lineHeight: 1,
        color: score < 0 ? RED : ACCENT,
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {money(score)}
    </span>
  );
  const chip = (text: string, strong: boolean) => (
    <span
      style={{
        flexShrink: 0,
        fontSize: 9,
        fontWeight: 800,
        letterSpacing: ".08em",
        lineHeight: 1.2,
        padding: "2px 5px",
        borderRadius: 3,
        background: strong ? ACCENT : "transparent",
        color: strong ? INK : SOFT,
        border: strong ? "none" : "1px solid rgba(255,166,217,.45)",
      }}
    >
      {text}
    </span>
  );
  const host = player.role === "host" && chip("HOST", false);
  const tag =
    label &&
    (highlight ? (
      chip(label, true)
    ) : (
      <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 700, color: SOFT }}>{label}</span>
    ));
  return (
    <li
      aria-current={highlight ? "true" : undefined}
      aria-label={`${player.displayName} ${money(score)}${label ? `, ${label.toLowerCase()}` : ""}`}
      style={{
        position: "relative",
        flex: "1 1 0",
        minHeight: 28,
        maxHeight: oneLine ? 48 : 64,
        borderRadius: 8,
        background: TILE_BG,
        border: `3px solid ${highlight ? ACCENT : "transparent"}`,
        boxShadow: highlight ? "0 0 16px rgba(107,255,179,.35)" : BEVEL,
        opacity: player.connected && !dim ? 1 : 0.45,
        padding: "0 8px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        gap: 3,
        overflow: "hidden",
        transition: "border-color 200ms, opacity 200ms",
      }}
    >
      {oneLine ? (
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {name}
          {host}
          {tag}
          {points}
        </div>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {name}
            {host}
            {tag}
          </div>
          {points}
        </>
      )}
      {delta && delta.amount !== 0 && (
        <span
          key={delta.key}
          aria-hidden
          className="sg-float"
          style={{
            position: "absolute",
            right: 8,
            bottom: 4,
            fontFamily: DISPLAY,
            fontWeight: 700,
            fontSize: 14,
            color: delta.amount > 0 ? GREEN : RED,
          }}
        >
          {delta.amount > 0 ? "+" : ""}
          {money(delta.amount)}
        </span>
      )}
    </li>
  );
}
