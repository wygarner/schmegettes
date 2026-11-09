import type { ReactNode } from "react";
import { GOLD, STAGE_BG } from "./tokens";

/**
 * The panel behind clues, the lobby, Daily Double and Final on the host screen. `lit` is the
 * buzzing-open border. Content can size itself in cqh / cqw (container query units).
 */
export function Stage({ children, lit = false, pad = 14 }: { children: ReactNode; lit?: boolean; pad?: number }) {
  return (
    <div
      data-lit={lit || undefined}
      style={{
        position: "relative",
        height: "100%",
        minHeight: 0,
        borderRadius: 12,
        background: STAGE_BG,
        boxShadow: lit
          ? `inset 0 0 0 3px ${GOLD}, 0 0 26px rgba(255,212,59,.45)`
          : "inset 0 0 0 1px rgba(255,255,255,.08)",
        transition: "box-shadow 150ms",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        padding: pad,
        containerType: "size",
        color: "#fff",
      }}
    >
      {children}
    </div>
  );
}

/** The small uppercase line at the top of the stage ("VOLCANOES · $400"). */
export function StageHeader({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 8,
        color: "#c9cdf7",
        fontWeight: 700,
        letterSpacing: ".12em",
        fontSize: "clamp(10px, 4.4cqh, 18px)",
        textTransform: "uppercase",
        flexShrink: 0,
      }}
    >
      <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {children}
      </span>
      {right}
    </div>
  );
}

/** Centers stage content in the space left over. */
export function StageBody({ children, gap = "1.5cqh" }: { children: ReactNode; gap?: string }) {
  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        gap,
      }}
    >
      {children}
    </div>
  );
}

/** A big gold moment: DAILY DOUBLE, a wager amount, FINAL SCHMEGETTES. */
export function BigMoment({ children, size = "min(24cqh, 13cqw)" }: { children: ReactNode; size?: string }) {
  return (
    <span
      className="sg-pop"
      style={{
        display: "block",
        fontFamily: "Oswald, Impact, sans-serif",
        fontWeight: 700,
        textTransform: "uppercase",
        color: "var(--mantine-color-yellow-4)",
        lineHeight: 1,
        fontSize: size,
        textShadow: "0 4px 0 rgba(0,0,0,.45)",
      }}
    >
      {children}
    </span>
  );
}
