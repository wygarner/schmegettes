import { Text } from "@mantine/core";
import { useState } from "react";
import { money } from "../lib/money";
import { ordinal, PLACE_COLOR } from "../lib/placement";
import type { Result, RoomState } from "../lib/room";
import { GoldButton } from "../ui/GoldButton";
import { Stage } from "../ui/Stage";
import { DISPLAY, GOLD, RED, SOFT } from "../ui/tokens";

/** "Nov 9 · 8:14 PM · 41 min", or less when the times aren't known. */
export function gameWhen(startedAt?: number, finishedAt?: number): string {
  if (!startedAt) return "";
  const start = new Date(startedAt);
  const parts = [
    start.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
  ];
  if (finishedAt) parts.push(`${Math.max(1, Math.round((finishedAt - startedAt) / 60000))} min`);
  return parts.join(" · ");
}

/**
 * The final scoreboard on the TV: a winner card and every contestant ranked (ties share a
 * placement), with Rematch on the host device. The player column stays beside it.
 */
export function Scoreboard({ state, onRematch }: { state: RoomState; onRematch: () => void }) {
  const [asked, setAsked] = useState(false);
  const results: Result[] = state.results ?? [];
  const top = results[0]?.score ?? 0;
  const winners = results.filter((r) => r.score === top);
  const many = results.length > 4;
  return (
    <Stage>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <Text ff={DISPLAY} fw={700} c="yellow.4" tt="uppercase" style={{ fontSize: "8cqh", letterSpacing: ".06em" }}>
          Final scores
        </Text>
        <Text c="#a5abee" style={{ fontSize: "clamp(10px, 4cqh, 16px)" }}>
          {gameWhen(state.startedAt, state.finishedAt)}
        </Text>
      </div>
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "grid",
          gridTemplateColumns: "0.9fr 1.1fr",
          gap: "3cqw",
          alignItems: "center",
        }}
      >
        <section
          aria-label="Winner"
          className="sg-pop"
          style={{
            borderRadius: 14,
            background: "rgba(255,212,59,.08)",
            border: `2px solid ${GOLD}`,
            boxShadow: "0 0 30px rgba(255,212,59,.25)",
            padding: "4cqh 3cqw",
            textAlign: "center",
            minWidth: 0,
          }}
        >
          <div style={{ fontSize: "12cqh", lineHeight: 1 }}>🏆</div>
          <div
            style={{ color: SOFT, fontWeight: 800, letterSpacing: ".14em", fontSize: "3.8cqh", marginTop: "1.5cqh" }}
          >
            {winners.length > 1 ? "TIED FOR 1ST" : "WINNER"}
          </div>
          <div
            style={{
              fontWeight: 800,
              color: "#fff",
              fontSize: winners.length > 1 ? "7cqh" : "9cqh",
              lineHeight: 1.1,
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {winners.map((w) => w.displayName).join(" & ")}
          </div>
          <div
            style={{
              fontFamily: DISPLAY,
              fontWeight: 700,
              color: top < 0 ? RED : GOLD,
              fontSize: "11cqh",
              lineHeight: 1.1,
            }}
          >
            {money(top)}
          </div>
        </section>
        <ol
          aria-label="Standings"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: many ? "1.4cqh" : "2.4cqh",
            listStyle: "none",
            margin: 0,
            padding: 0,
          }}
        >
          {results.map((r, i) => (
            <li
              key={r.userId}
              className="sg-in"
              aria-label={`${ordinal(r.placement)} ${r.displayName} ${money(r.score)}`}
              style={{ display: "flex", alignItems: "baseline", gap: "1.6cqw", animationDelay: `${300 + i * 140}ms` }}
            >
              <span
                style={{
                  width: "6cqw",
                  fontWeight: 800,
                  fontSize: "4.6cqh",
                  color: PLACE_COLOR[r.placement] ?? "#a5abee",
                }}
              >
                {ordinal(r.placement)}
              </span>
              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  fontWeight: 700,
                  color: "#fff",
                  fontSize: "5.6cqh",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {r.displayName}
              </span>
              <span style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: "6cqh", color: r.score < 0 ? RED : GOLD }}>
                {money(r.score)}
              </span>
            </li>
          ))}
        </ol>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginTop: 6 }}>
        <Text c="#a5abee" style={{ fontSize: "clamp(10px, 4cqh, 16px)" }}>
          Saved to everyone's game history
        </Text>
        <GoldButton
          loading={asked}
          disabled={asked}
          onClick={() => {
            if (asked) return;
            setAsked(true);
            onRematch();
          }}
        >
          Rematch
        </GoldButton>
      </div>
    </Stage>
  );
}
