/** biome-ignore-all lint/correctness/noUnusedVariables: the design kit is inlined whole in every prototype */

import {
  Alert,
  Anchor,
  Badge,
  Button,
  createTheme,
  Group,
  MantineProvider,
  SegmentedControl,
  Stack,
  Switch,
  Text,
  Title,
  UnstyledButton,
} from "@mantine/core";
import { useElementSize } from "@mantine/hooks";
import { type ReactNode, useEffect, useRef, useState } from "react";

// PROTOTYPE — Feature 3 and history: the end-of-game scoreboard and Rematch, a host override of a
// misheard answer, and My games with a past game's scoreboard.

// ── Design kit ──────────────────────────────────────────────────────────────────────────
const theme = createTheme({
  primaryColor: "boardBlue",
  colors: {
    boardBlue: [
      "#e8eaff",
      "#c9cdf7",
      "#a5abee",
      "#7f87e6",
      "#5f68df",
      "#4a53da",
      "#3f48d9",
      "#3139c1",
      "#2932ad",
      "#060ce9",
    ],
  },
  fontFamily: "Inter, system-ui, sans-serif",
  headings: { fontFamily: "Oswald, Impact, sans-serif" },
});

const DISPLAY = "Oswald, Impact, sans-serif";
const GOLD = "var(--mantine-color-yellow-4)";
const INK = "#1f1600"; // text on gold
const CELL = "var(--mantine-color-boardBlue-9)";
const NIGHT = "#03041c";
const STAGE = "radial-gradient(120% 140% at 50% 0%, #0d14c8 0%, #070c86 42%, #040746 100%)";
const BEVEL = "inset 0 1px 0 rgba(255,255,255,.22), inset 0 -3px 0 rgba(0,0,0,.35)";
const TILE = "linear-gradient(180deg, #161df5 0%, #060ce9 55%, #0409c0 100%)";
const PHONE_BG = "linear-gradient(180deg, #0a0f5c 0%, #050833 38%, #03041c 100%)";

const money = (n: number) => `${n < 0 ? "−" : ""}$${Math.abs(n).toLocaleString("en-US")}`;

const KIT_CSS = `
@keyframes sg-glow-red { 0%,100% { filter: drop-shadow(0 0 6px rgba(255,48,48,.55)) } 50% { filter: drop-shadow(0 0 20px rgba(255,48,48,.95)) } }
@keyframes sg-glow-green { 0%,100% { filter: drop-shadow(0 0 4px rgba(64,192,87,.5)) } 50% { filter: drop-shadow(0 0 14px rgba(64,192,87,.9)) } }
@keyframes sg-shake { 0%,100% { transform: translateX(0) } 25% { transform: translateX(-6px) } 75% { transform: translateX(6px) } }
@keyframes sg-in { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: none } }
@keyframes sg-pop { 0% { opacity: 0; transform: scale(.4) } 60% { opacity: 1; transform: scale(1.08) } 100% { transform: scale(1) } }
@keyframes sg-meter { 0%,100% { transform: scaleY(.25) } 50% { transform: scaleY(1) } }
@keyframes sg-float { 0% { opacity: 0; transform: translateY(6px) } 15%,80% { opacity: 1; transform: none } 100% { opacity: 0; transform: translateY(-10px) } }
@keyframes sg-shrink { from { transform: scaleX(1) } to { transform: scaleX(0) } }
@keyframes sg-blink { 0%,100% { opacity: .25 } 50% { opacity: 1 } }
@keyframes sg-flip { 0%,100% { transform: rotateX(0) } 50% { transform: rotateX(90deg) } }
.sg-key:active { background: rgba(255,255,255,.22) !important; transform: scale(.96); }
`;

/** Loads the theme's two fonts (web/ doesn't load them yet) and the kit's keyframes. */
function Kit() {
  useEffect(() => {
    if (document.getElementById("sg-fonts")) return;
    const link = document.createElement("link");
    link.id = "sg-fonts";
    link.rel = "stylesheet";
    link.href =
      "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Oswald:wght@500;600;700&display=swap";
    document.head.appendChild(link);
  }, []);
  return <style>{KIT_CSS}</style>;
}

/** Scales a fixed-size device mockup down to the available width. */
function Fit({ width, height, children }: { width: number; height: number; children: ReactNode }) {
  const { ref, width: avail } = useElementSize();
  const scale = avail > 0 ? Math.min(1, avail / width) : 1;
  return (
    <div ref={ref} style={{ width: "100%" }}>
      <div style={{ width: width * scale, height: height * scale }}>
        <div style={{ width, height, transform: `scale(${scale})`, transformOrigin: "top left" }}>{children}</div>
      </div>
    </div>
  );
}

type HostSize = "844" | "667" | "956";
const HOST_SIZES: Record<HostSize, { label: string; w: number; h: number; side: number; bottom: number }> = {
  "844": { label: "844 × 390", w: 844, h: 390, side: 47, bottom: 21 },
  "667": { label: "667 × 320 (SE)", w: 667, h: 320, side: 0, bottom: 0 },
  "956": { label: "956 × 440 (Pro Max)", w: 956, h: 440, side: 62, bottom: 21 },
};
const BEZEL = 10;

/** The host iPhone in landscape (what the TV shows): stage left, player column right, inside the safe areas. */
function HostDevice({
  size,
  stage,
  column,
  overlay,
}: {
  size: HostSize;
  stage: ReactNode;
  column?: ReactNode;
  overlay?: ReactNode;
}) {
  const s = HOST_SIZES[size];
  const side = Math.max(8, s.side);
  const inner = s.w - side * 2;
  const col = Math.round(Math.min(280, Math.max(180, inner * 0.28)));
  return (
    <div
      style={{
        width: s.w + BEZEL * 2,
        height: s.h + BEZEL * 2,
        padding: BEZEL,
        borderRadius: s.side ? 54 : 30,
        background: "#0b0b10",
        boxShadow: "0 0 0 2px #2a2a33, 0 20px 50px rgba(0,0,0,.5)",
      }}
    >
      <div
        style={{
          position: "relative",
          width: s.w,
          height: s.h,
          borderRadius: s.side ? 44 : 4,
          overflow: "hidden",
          background: NIGHT,
          display: "grid",
          gridTemplateColumns: column ? `minmax(0,1fr) ${col}px` : "minmax(0,1fr)",
          gap: 8,
          padding: `8px ${side}px ${Math.max(8, s.bottom)}px ${side}px`,
        }}
      >
        {s.side > 0 && (
          <div
            aria-hidden
            style={{
              position: "absolute",
              left: 11,
              top: "50%",
              width: 34,
              height: 122,
              marginTop: -61,
              borderRadius: 18,
              background: "#000",
            }}
          />
        )}
        <div style={{ minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column" }}>{stage}</div>
        {column && (
          <div style={{ minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column", gap: 6 }}>{column}</div>
        )}
        {overlay}
      </div>
    </div>
  );
}

const PHONE = { w: 390, h: 844 };
/** A contestant's phone, portrait, with the Dynamic Island and home-indicator safe areas. */
function PhoneDevice({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        width: PHONE.w + BEZEL * 2,
        height: PHONE.h + BEZEL * 2,
        padding: BEZEL,
        borderRadius: 60,
        background: "#0b0b10",
        boxShadow: "0 0 0 2px #2a2a33, 0 20px 50px rgba(0,0,0,.5)",
      }}
    >
      <div
        style={{
          position: "relative",
          width: PHONE.w,
          height: PHONE.h,
          borderRadius: 50,
          overflow: "hidden",
          background: PHONE_BG,
          display: "flex",
          flexDirection: "column",
          paddingTop: 54,
          paddingBottom: 34,
        }}
      >
        <div
          aria-hidden
          style={{
            position: "absolute",
            top: 11,
            left: "50%",
            width: 124,
            height: 36,
            marginLeft: -62,
            borderRadius: 20,
            background: "#000",
          }}
        />
        {children}
      </div>
    </div>
  );
}

/** pick / listening: the player in control on the board; the buzzer is how they say their pick. */
type BuzzerState = "idle" | "dim" | "lit" | "early" | "answering" | "locked" | "pick" | "listening";
/** Dome gradient stops per state: highlight, body, shade, rim. Words go to screen readers only. */
const DOME: Record<BuzzerState, { label: string; stops: [string, string, string, string]; glow?: string }> = {
  idle: { label: "Buzz", stops: ["#d98585", "#a3201f", "#6d0c0c", "#360303"] },
  dim: { label: "Buzz (get ready)", stops: ["#d98585", "#a3201f", "#6d0c0c", "#360303"] },
  lit: { label: "Buzz", stops: ["#ffb8b8", "#ff3030", "#d40c0c", "#7a0404"], glow: "sg-glow-red 1s" },
  early: { label: "Too early", stops: ["#8f6060", "#5c1414", "#3a0808", "#1c0202"] },
  answering: { label: "Answer now", stops: ["#c2f7cd", "#37c95a", "#1c8f37", "#0b4a1a"], glow: "sg-glow-green 1.8s" },
  locked: { label: "You've answered this one", stops: ["#8a8c99", "#4b4d5c", "#30313d", "#18181f"] },
  pick: {
    label: "Press and say your pick",
    stops: ["#ffb8b8", "#ff3030", "#d40c0c", "#7a0404"],
    glow: "sg-glow-red 2.6s",
  },
  listening: {
    label: "Listening for your pick",
    stops: ["#c2f7cd", "#37c95a", "#1c8f37", "#0b4a1a"],
    glow: "sg-glow-green 1.8s",
  },
};

/**
 * The one buzzer, on phones and the host device: an oblong red dome the full width of its
 * container, set in a dark rim, with no lettering. At least 64 px tall. State shows in the dome's
 * color and light.
 */
function Buzzer({ state, onBuzz, height = 120 }: { state: BuzzerState; onBuzz?: () => void; height?: number }) {
  const [down, setDown] = useState(false);
  const d = DOME[state];
  const h = Math.max(64, height);
  const big = h >= 90;
  const rimPad = big ? 7 : 5;
  const travel = big ? 6 : 4;
  const pressed = down && state !== "locked";
  const [hi, body, shade, rim] = d.stops;
  return (
    <UnstyledButton
      aria-label={d.label}
      data-state={state}
      disabled={state === "locked"}
      onPointerDown={() => setDown(true)}
      onPointerUp={() => setDown(false)}
      onPointerLeave={() => setDown(false)}
      onClick={() => {
        if (state === "dim" || state === "lit" || state === "pick" || state === "listening") onBuzz?.();
      }}
      style={{
        width: "100%",
        height: h,
        flexShrink: 0,
        borderRadius: h / 2,
        padding: `${rimPad}px ${rimPad}px ${rimPad + travel}px`,
        background: "linear-gradient(180deg, #34364c 0%, #15161f 100%)",
        boxShadow: `0 3px 8px rgba(0,0,0,.6), inset 0 1px 0 rgba(255,255,255,.14)${state === "dim" ? ", 0 0 0 2px rgba(255,70,70,.45)" : ""}`,
        opacity: state === "locked" ? 0.55 : 1,
        cursor: state === "locked" ? "not-allowed" : "pointer",
        userSelect: "none",
        touchAction: "manipulation",
        animation: state === "early" ? "sg-shake 250ms" : undefined,
        transition: "box-shadow 150ms",
      }}
    >
      <span
        aria-hidden
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
          animation: d.glow ? `${d.glow} ease-in-out infinite` : undefined,
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
    </UnstyledButton>
  );
}

function Meter({ color = GOLD, h = 20 }: { color?: string; h?: number }) {
  return (
    <span aria-hidden style={{ display: "inline-flex", alignItems: "center", gap: 3, height: h }}>
      {[0, 1, 2, 3, 4].map((i) => (
        <span
          key={i}
          style={{
            width: 4,
            height: "100%",
            borderRadius: 2,
            background: color,
            animation: `sg-meter ${650 + i * 90}ms ease-in-out ${i * 110}ms infinite`,
          }}
        />
      ))}
    </span>
  );
}

type Player = { id: string; name: string; score: number; host?: boolean; online?: boolean };

/** A contestant's name and score. Gold ring + chip for the player in control. */
function Tile({
  p,
  tag,
  highlight,
  dim,
  oneLine,
  delta,
}: {
  p: Player;
  tag?: string;
  highlight?: boolean;
  dim?: boolean;
  oneLine?: boolean;
  delta?: { amount: number; key: number };
}) {
  const off = p.online === false;
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
        background: strong ? GOLD : "transparent",
        color: strong ? INK : "#c9cdf7",
        border: strong ? "none" : "1px solid rgba(201,205,247,.45)",
      }}
    >
      {text}
    </span>
  );
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
      {p.name}
      {off && <span style={{ fontWeight: 500, fontSize: 11, color: "#c9cdf7" }}> (reconnecting)</span>}
    </span>
  );
  const score = (
    <span
      style={{
        flexShrink: 0,
        fontFamily: DISPLAY,
        fontWeight: 600,
        fontSize: oneLine ? 17 : 21,
        lineHeight: 1,
        color: p.score < 0 ? "var(--mantine-color-red-4)" : GOLD,
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {money(p.score)}
    </span>
  );
  const tagEl =
    tag &&
    (highlight ? (
      chip(tag, true)
    ) : (
      <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 700, color: "#c9cdf7" }}>{tag}</span>
    ));
  return (
    <div
      data-tile
      aria-current={highlight ? "true" : undefined}
      style={{
        position: "relative",
        flex: "1 1 0",
        minHeight: 28,
        maxHeight: oneLine ? 48 : 64,
        borderRadius: 8,
        background: TILE,
        border: `3px solid ${highlight ? GOLD : "transparent"}`,
        boxShadow: highlight ? "0 0 16px rgba(255,212,59,.35)" : BEVEL,
        opacity: off || dim ? 0.45 : 1,
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
          {p.host && chip("HOST", false)}
          {tagEl}
          {score}
        </div>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {name}
            {p.host && chip("HOST", false)}
            {tagEl}
          </div>
          {score}
        </>
      )}
      {delta && delta.amount !== 0 && (
        <span
          key={delta.key}
          style={{
            position: "absolute",
            right: 8,
            bottom: 4,
            fontFamily: DISPLAY,
            fontWeight: 700,
            fontSize: 14,
            color: delta.amount > 0 ? "var(--mantine-color-green-4)" : "var(--mantine-color-red-4)",
            animation: "sg-float 1.8s ease-out forwards",
          }}
        >
          {delta.amount > 0 ? "+" : ""}
          {money(delta.amount)}
        </span>
      )}
    </div>
  );
}

/** One tile per contestant, sharing the column's height; the host's controls sit below. */
function Tiles({
  players,
  controlId,
  tags,
  dimIds,
  deltas,
}: {
  players: Player[];
  controlId?: string;
  tags?: Record<string, string>;
  dimIds?: string[];
  deltas?: Record<string, { amount: number; key: number }>;
}) {
  const oneLine = players.length > 4;
  return (
    <section aria-label="Scores" style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: 4 }}>
      {players.map((p) => (
        <Tile
          key={p.id}
          p={p}
          highlight={p.id === controlId}
          tag={tags?.[p.id] ?? (p.id === controlId ? "PICKING" : undefined)}
          dim={dimIds?.includes(p.id)}
          oneLine={oneLine}
          delta={deltas?.[p.id]}
        />
      ))}
    </section>
  );
}

type BoardCell = { value: number; done: boolean };
/** Category names and values only, never clue text. Tappable only with onPick. */
function Board({
  cats,
  cells,
  hostW = 844,
  phone,
  onPick,
}: {
  cats: string[];
  cells: BoardCell[][];
  hostW?: number;
  phone?: boolean;
  onPick?: (cat: number, row: number) => void;
}) {
  const rows = cells[0]?.length ?? 4;
  const headFz = phone ? 9 : hostW < 700 ? 10 : hostW < 900 ? 12 : 13;
  const valFz = phone ? 18 : hostW < 700 ? 22 : hostW < 900 ? 28 : 32;
  return (
    <section
      aria-label="Board"
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${cats.length}, minmax(0,1fr))`,
        gridTemplateRows: phone ? `52px repeat(${rows}, 48px)` : `minmax(0,1.35fr) repeat(${rows}, minmax(0,1fr))`,
        gridAutoFlow: "column",
        gap: phone ? 4 : 5,
        height: phone ? undefined : "100%",
        width: "100%",
      }}
    >
      {cats.map((cat, c) => [
        <div
          key={`head-${cat}`}
          lang="en"
          style={{
            minHeight: 0,
            borderRadius: 4,
            background: CELL,
            boxShadow: BEVEL,
            color: "#fff",
            fontWeight: 700,
            fontSize: headFz,
            lineHeight: 1.1,
            textTransform: "uppercase",
            textAlign: "center",
            hyphens: "auto",
            overflowWrap: "break-word",
            padding: 3,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
          }}
        >
          <span style={{ display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
            {cat}
          </span>
        </div>,
        ...(cells[c] ?? []).map((cell, r) => (
          <CellButton
            key={`${cat}-${cell.value}`}
            cell={cell}
            fz={valFz}
            onPick={onPick ? () => onPick(c, r) : undefined}
          />
        )),
      ])}
    </section>
  );
}

function CellButton({ cell, fz, onPick }: { cell: BoardCell; fz: number; onPick?: () => void }) {
  const [down, setDown] = useState(false);
  const live = !!onPick && !cell.done;
  return (
    <UnstyledButton
      disabled={!live}
      onClick={onPick}
      onPointerDown={() => live && setDown(true)}
      onPointerUp={() => setDown(false)}
      onPointerLeave={() => setDown(false)}
      aria-label={cell.done ? "Played" : String(cell.value)}
      style={{
        minHeight: 0,
        borderRadius: 4,
        background: CELL,
        boxShadow: cell.done ? "none" : BEVEL,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: live ? "pointer" : "default",
        transform: down ? "scale(.94)" : "none",
        transition: "transform 80ms",
      }}
    >
      {!cell.done && (
        <span
          style={{
            fontFamily: DISPLAY,
            fontWeight: 700,
            fontSize: fz,
            lineHeight: 1,
            color: GOLD,
            textShadow: "0 2px 0 rgba(0,0,0,.55)",
          }}
        >
          {cell.value.toLocaleString("en-US")}
        </span>
      )}
    </UnstyledButton>
  );
}

/** The stage panel for clues, the lobby, and Final. Lit = buzzing open. Sizes inside use cqh/cqw. */
function Stage({ children, lit, pad = 14 }: { children: ReactNode; lit?: boolean; pad?: number }) {
  return (
    <div
      style={{
        position: "relative",
        flex: 1,
        minHeight: 0,
        borderRadius: 12,
        background: STAGE,
        boxShadow: lit
          ? `inset 0 0 0 3px ${GOLD}, 0 0 26px rgba(255,212,59,.45)`
          : "inset 0 0 0 1px rgba(255,255,255,.08)",
        transition: "box-shadow 150ms",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        padding: pad,
        containerType: "size",
      }}
    >
      {children}
    </div>
  );
}

function Bar({
  ms,
  runKey,
  color = GOLD,
  paused,
  h = 6,
}: {
  ms: number;
  runKey: string | number;
  color?: string;
  paused?: boolean;
  h?: number;
}) {
  return (
    <div style={{ height: h, borderRadius: h, background: "rgba(255,255,255,.12)", overflow: "hidden", flexShrink: 0 }}>
      <div
        key={runKey}
        style={{
          height: "100%",
          background: color,
          transformOrigin: "left",
          animation: `sg-shrink ${ms}ms linear forwards`,
          animationPlayState: paused ? "paused" : "running",
        }}
      />
    </div>
  );
}
/** The main action on the stage and on phones: gold with dark text. */
function GoldButton({
  children,
  onClick,
  disabled,
  loading,
  size = "md",
  fullWidth,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
  size?: "sm" | "md" | "lg" | "xl";
  fullWidth?: boolean;
}) {
  return (
    <Button
      color="yellow.4"
      autoContrast
      size={size}
      fullWidth={fullWidth}
      disabled={disabled}
      loading={loading}
      onClick={onClick}
      styles={{
        root: {
          fontFamily: DISPLAY,
          fontWeight: 700,
          letterSpacing: ".08em",
          textTransform: "uppercase",
          flexShrink: 0,
        },
      }}
    >
      {children}
    </Button>
  );
}

function Wordmark({ size }: { size: number | string }) {
  return (
    <span
      style={{
        fontFamily: DISPLAY,
        fontWeight: 700,
        fontSize: size,
        lineHeight: 1,
        color: GOLD,
        letterSpacing: ".04em",
        textShadow: "0 3px 0 rgba(0,0,0,.45)",
      }}
    >
      SCHMEGETTES
    </span>
  );
}

/** A dialog drawn inside a device frame. Centered on the host screen, a bottom sheet on phones. */
function Sheet({ children, bottom, onClose }: { children: ReactNode; bottom?: boolean; onClose?: () => void }) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 10,
        display: "flex",
        alignItems: bottom ? "flex-end" : "center",
        justifyContent: "center",
        padding: bottom ? 0 : 16,
      }}
    >
      <UnstyledButton
        aria-label="Close"
        tabIndex={-1}
        onClick={onClose}
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(2,3,20,.7)",
          cursor: onClose ? "pointer" : "default",
        }}
      />
      <div
        role="dialog"
        style={{
          position: "relative",
          width: bottom ? "100%" : 340,
          background: "#0b0e3d",
          borderRadius: bottom ? "24px 24px 0 0" : 16,
          padding: bottom ? "22px 20px 44px" : 18,
          boxShadow: "0 0 0 1px rgba(255,255,255,.1), 0 20px 40px rgba(0,0,0,.5)",
          animation: bottom ? "sg-in 180ms ease-out" : "sg-pop 200ms ease-out",
        }}
      >
        {children}
      </div>
    </div>
  );
}

/** Phone layout: a slim top bar, the content, and the buzzer pinned to the bottom. */
function PhoneScreen({
  top,
  children,
  buzzer,
  hint,
  center,
}: {
  top?: ReactNode;
  children: ReactNode;
  buzzer?: ReactNode;
  hint?: ReactNode;
  center?: boolean;
}) {
  return (
    <>
      {top && (
        <div
          style={{
            height: 36,
            flexShrink: 0,
            padding: "0 22px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          {top}
        </div>
      )}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflow: "auto",
          padding: "8px 22px",
          display: "flex",
          flexDirection: "column",
          justifyContent: center ? "center" : "flex-start",
        }}
      >
        {children}
      </div>
      {buzzer && (
        <div style={{ padding: "10px 16px 6px", flexShrink: 0 }}>
          {buzzer}
          {hint && (
            <div style={{ textAlign: "center", fontSize: 12, color: "rgba(201,205,247,.7)", marginTop: 8 }}>{hint}</div>
          )}
        </div>
      )}
    </>
  );
}

function PhoneTop({ code = "K7RXM", score }: { code?: string; score?: number }) {
  return (
    <>
      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".14em", color: "#a5abee" }}>ROOM {code}</span>
      {score !== undefined && (
        <span
          style={{
            fontFamily: DISPLAY,
            fontWeight: 600,
            fontSize: 22,
            color: score < 0 ? "var(--mantine-color-red-4)" : GOLD,
          }}
        >
          {money(score)}
        </span>
      )}
    </>
  );
}
/**
 * Wager entry: digits, backspace, Min, Max. Confirm stays disabled until the amount is in range.
 * masked (the host's Final wager on the mirrored screen): digits show as dots and keys give no
 * visual feedback, so the TV reveals nothing but the number of digits.
 */
function WagerPad({
  min,
  max,
  confirmLabel,
  onConfirm,
  layout = "phone",
  masked,
}: {
  min: number;
  max: number;
  confirmLabel: string;
  onConfirm: (amount: number) => void;
  layout?: "phone" | "stage";
  masked?: boolean;
}) {
  const [amt, setAmt] = useState("");
  const n = amt === "" ? Number.NaN : Number(amt);
  const ok = !Number.isNaN(n) && n >= min && n <= max;
  const bad = amt !== "" && !ok;
  const range = `${money(min)} – ${money(max)}`;
  const hint = !bad ? range : masked ? "Out of range" : n < min ? `At least ${money(min)}` : `At most ${money(max)}`;
  const press = (k: string) => setAmt((a) => (k === "⌫" ? a.slice(0, -1) : (a === "0" ? k : a + k).slice(0, 7)));
  const phone = layout === "phone";
  const key = (label: string, onClick: () => void, aria?: string) => (
    <UnstyledButton
      key={label}
      aria-label={aria ?? label}
      onClick={onClick}
      className={masked ? undefined : "sg-key"}
      style={{
        height: phone ? 54 : 36,
        borderRadius: 12,
        background: "rgba(255,255,255,.08)",
        color: "#fff",
        fontFamily: DISPLAY,
        fontWeight: 600,
        fontSize: phone ? (label.length > 1 ? 16 : 24) : label.length > 1 ? 13 : 18,
        letterSpacing: label.length > 1 ? ".08em" : 0,
        textTransform: "uppercase",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "transform 60ms",
      }}
    >
      {label}
    </UnstyledButton>
  );
  const display = (
    <div>
      <div
        style={{
          fontFamily: DISPLAY,
          fontWeight: 700,
          fontSize: phone ? 58 : 34,
          lineHeight: 1,
          color: amt === "" ? "rgba(255,255,255,.28)" : GOLD,
          letterSpacing: masked ? ".12em" : 0,
        }}
      >
        {masked ? `$ ${"•".repeat(amt.length)}` : amt === "" ? "$0" : money(n)}
      </div>
      <div
        style={{
          marginTop: 6,
          fontSize: phone ? 14 : 12,
          fontWeight: bad ? 700 : 500,
          color: bad ? "var(--mantine-color-red-4)" : "#a5abee",
        }}
      >
        {hint}
      </div>
    </div>
  );
  const minMax = (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
      {key("Min", () => setAmt(String(min)))}
      {key("Max", () => setAmt(String(max)))}
    </div>
  );
  const digits = (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: phone ? 8 : 6 }}>
      {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => key(d, () => press(d)))}
      <span />
      {key("0", () => press("0"))}
      {key("⌫", () => press("⌫"), "Backspace")}
    </div>
  );
  const confirm = (
    <GoldButton size={phone ? "xl" : "md"} fullWidth disabled={!ok} onClick={() => ok && onConfirm(n)}>
      {confirmLabel}
    </GoldButton>
  );
  if (phone)
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ textAlign: "center" }}>{display}</div>
        {minMax}
        {digits}
        {confirm}
      </div>
    );
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1.1fr", gap: 14, alignItems: "center" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {display}
        {minMax}
        {confirm}
      </div>
      {digits}
    </div>
  );
}
// ── End of design kit ───────────────────────────────────────────────────────────────────

// ── Mock data ───────────────────────────────────────────────────────────────────────────
type Pid = "alice" | "bob" | "dana" | "wyatt";
const ORDER: Pid[] = ["alice", "bob", "dana", "wyatt"];
const NAME: Record<Pid, string> = { alice: "Alice", bob: "Bob", dana: "Dana", wyatt: "Wyatt" };

const ordinal = (n: number) =>
  `${n}${n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th"}`;
/** Highest score is 1st; tied scores share a placement (two at 1st, the next is 3rd). */
const placeOf = (score: number, all: number[]) => 1 + all.filter((s) => s > score).length;
const PLACE_COLOR = ["", GOLD, "#d5d9e6", "#e0a370"];

type View = "end" | "override" | "history";

export default function ScoreboardAndHistory() {
  const [view, setView] = useState<View>("end");
  return (
    <MantineProvider theme={theme} defaultColorScheme="dark">
      <Kit />
      <Stack gap="md" pb={48}>
        <Alert color="yellow" title="PROTOTYPE — not production code" />
        <div>
          <Title order={2}>Scoreboard, overrides, and history</Title>
          <Text c="dimmed" size="sm" maw={860}>
            The designs for feature 3 (the end-of-game scoreboard, Rematch, and host overrides) and for looking back at
            past games. None of these have a design in the docs yet.
          </Text>
        </div>
        <SegmentedControl
          value={view}
          onChange={(x) => setView(x as View)}
          data={[
            { value: "end", label: "End of game + Rematch" },
            { value: "override", label: "Host override" },
            { value: "history", label: "My games" },
          ]}
          style={{ alignSelf: "flex-start" }}
        />
        {view === "end" && <EndOfGame />}
        {view === "override" && <Override />}
        {view === "history" && <History />}
      </Stack>
    </MantineProvider>
  );
}

function DeviceLabel({ children }: { children: ReactNode }) {
  return (
    <Text size="sm" fw={600} c="dimmed" h={28}>
      {children}
    </Text>
  );
}

function TwoDevices({
  size,
  host,
  phone,
  phoneLabel,
}: {
  size: HostSize;
  host: ReactNode;
  phone: ReactNode;
  phoneLabel: string;
}) {
  const s = HOST_SIZES[size];
  const W = s.w + BEZEL * 2 + 40 + PHONE.w + BEZEL * 2;
  const H = 28 + Math.max(s.h, PHONE.h) + BEZEL * 2;
  return (
    <Fit width={W} height={H}>
      <div style={{ display: "flex", gap: 40, alignItems: "flex-start" }}>
        <div>
          <DeviceLabel>Host's iPhone, mirrored to the TV</DeviceLabel>
          {host}
        </div>
        <div>
          <DeviceLabel>{phoneLabel}</DeviceLabel>
          {phone}
        </div>
      </div>
    </Fit>
  );
}

// ── End of game ─────────────────────────────────────────────────────────────────────────
function EndOfGame() {
  const [size, setSize] = useState<HostSize>("844");
  const [count, setCount] = useState<"4" | "6">("4");
  const [tie, setTie] = useState(false);
  const [viewer, setViewer] = useState<Pid>("bob");
  const [stage, setStage] = useState<"scores" | "rematching" | "lobby">("scores");
  const [left, setLeft] = useState<Pid[]>([]);
  const timer = useRef<number>(0);
  useEffect(() => () => clearTimeout(timer.current), []);

  const extra: Player[] =
    count === "6"
      ? [
          { id: "eunji", name: "Eun-ji", score: 1200 },
          { id: "farah", name: "Farah Al-Sayed", score: 0 },
        ]
      : [];
  const players: Player[] = [
    { id: "alice", name: "Alice", score: 2900 },
    { id: "bob", name: "Bob", score: tie ? 2900 : 800 },
    { id: "dana", name: "Dana", score: -400 },
    { id: "wyatt", name: "Wyatt", score: -200, host: true },
    ...extra,
  ];
  const scores = players.map((p) => p.score);
  const ranked = [...players].sort((a, b) => b.score - a.score);
  const top = ranked[0].score;
  const winners = ranked.filter((p) => p.score === top);
  const me = players.find((p) => p.id === viewer) ?? players[1];

  function rematch() {
    setStage("rematching");
    timer.current = window.setTimeout(() => setStage("lobby"), 900);
  }

  const hostStage =
    stage === "lobby" ? (
      <Stage pad={14}>
        <Group justify="space-between" wrap="nowrap">
          <Wordmark size="8cqh" />
          <Text c="boardBlue.1" style={{ fontSize: "5cqh" }}>
            Rematch · Hosted by <b style={{ color: "#fff" }}>Wyatt</b>
          </Text>
        </Group>
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "3cqh",
          }}
        >
          <Text fw={600} c="boardBlue.1" style={{ fontSize: "6cqh" }}>
            New players join at <span style={{ color: "#fff" }}>schmegettes.app/join</span>
          </Text>
          <Text ff={DISPLAY} fw={700} c="yellow.4" style={{ fontSize: "24cqh", letterSpacing: ".2em", lineHeight: 1 }}>
            K7RXM
          </Text>
          <Text c="boardBlue.1" style={{ fontSize: "4.5cqh" }}>
            Fresh board: none of tonight's clues come back.
          </Text>
        </div>
        <Group justify="space-between" wrap="nowrap">
          <Button variant="outline" color="boardBlue.1">
            Leave the game
          </Button>
          <GoldButton>Start</GoldButton>
        </Group>
      </Stage>
    ) : (
      <Stage pad={14}>
        <Group justify="space-between" wrap="nowrap" align="baseline">
          <Text ff={DISPLAY} fw={700} c="yellow.4" tt="uppercase" style={{ fontSize: "8cqh", letterSpacing: ".06em" }}>
            Final scores
          </Text>
          <Text c="#a5abee" style={{ fontSize: "4cqh" }}>
            Nov 9 · 8:14 PM · 41 min
          </Text>
        </Group>
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
          <div
            style={{
              borderRadius: 14,
              background: "rgba(255,212,59,.08)",
              border: `2px solid ${GOLD}`,
              boxShadow: "0 0 30px rgba(255,212,59,.25)",
              padding: "4cqh 3cqw",
              textAlign: "center",
              animation: "sg-pop 420ms ease-out",
            }}
          >
            <div style={{ fontSize: "12cqh", lineHeight: 1 }}>🏆</div>
            <div
              style={{
                color: "#c9cdf7",
                fontWeight: 800,
                letterSpacing: ".14em",
                fontSize: "3.8cqh",
                marginTop: "1.5cqh",
              }}
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
              {winners.map((w) => w.name).join(" & ")}
            </div>
            <div style={{ fontFamily: DISPLAY, fontWeight: 700, color: GOLD, fontSize: "11cqh", lineHeight: 1.1 }}>
              {money(top)}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: count === "6" ? "1.4cqh" : "2.4cqh" }}>
            {ranked.map((p, i) => {
              const pl = placeOf(p.score, scores);
              return (
                <div
                  key={p.id}
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    gap: "1.6cqw",
                    animation: `sg-in 300ms ease-out ${300 + i * 140}ms both`,
                  }}
                >
                  <span
                    style={{ width: "6cqw", fontWeight: 800, fontSize: "4.6cqh", color: PLACE_COLOR[pl] ?? "#a5abee" }}
                  >
                    {ordinal(pl)}
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
                    {p.name}
                  </span>
                  <span
                    style={{
                      fontFamily: DISPLAY,
                      fontWeight: 700,
                      fontSize: "6cqh",
                      color: p.score < 0 ? "var(--mantine-color-red-4)" : GOLD,
                    }}
                  >
                    {money(p.score)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
        <Group justify="space-between" wrap="nowrap" mt={6}>
          <Text c="#a5abee" style={{ fontSize: "4cqh" }}>
            Saved to everyone's game history
          </Text>
          <GoldButton loading={stage === "rematching"} onClick={rematch}>
            Rematch
          </GoldButton>
        </Group>
      </Stage>
    );

  const inLobby = stage === "lobby";
  const tiles = inLobby ? players.filter((p) => !left.includes(p.id as Pid)).map((p) => ({ ...p, score: 0 })) : players;
  const phoneBody = left.includes(viewer) ? (
    <PhoneScreen>
      <Stack align="center" justify="center" ta="center" style={{ flex: 1 }} gap="sm">
        <Wordmark size={40} />
        <Text c="boardBlue.1">You left the room. This game is in My games.</Text>
        <Button variant="light" onClick={() => setLeft((l) => l.filter((x) => x !== viewer))}>
          (Prototype: undo)
        </Button>
      </Stack>
    </PhoneScreen>
  ) : inLobby ? (
    <PhoneScreen
      top={<PhoneTop />}
      buzzer={<Buzzer state="idle" />}
      hint="Try the buzzer. Nothing is sent until a clue is read."
    >
      <Stack mt={20} gap={2}>
        <Text c="yellow.4" fw={800} size="xs" style={{ letterSpacing: ".14em" }}>
          REMATCH
        </Text>
        <Text ff={DISPLAY} fz={32} fw={500} lh={1}>
          You're in,
        </Text>
        <Text ff={DISPLAY} fz={54} fw={700} c="yellow.4" lh={1.1}>
          {me.name}.
        </Text>
        <Text size="sm" c="boardBlue.1">
          Same room, fresh board. Waiting for Wyatt to start.
        </Text>
      </Stack>
      <Group mt="auto" grow gap="xs">
        <Button variant="light">Edit name</Button>
        <Button variant="subtle" color="red" onClick={() => setLeft((l) => [...l, viewer])}>
          Leave
        </Button>
      </Group>
    </PhoneScreen>
  ) : (
    <PhoneScreen top={<PhoneTop score={me.score} />} buzzer={<Buzzer state="idle" />}>
      <Stack align="center" ta="center" gap={0} mt={24}>
        <Text c="boardBlue.1" fw={700} tt="uppercase" style={{ letterSpacing: ".14em" }}>
          You finished
        </Text>
        <Text
          ff={DISPLAY}
          fw={700}
          fz={96}
          lh={1}
          c={PLACE_COLOR[placeOf(me.score, scores)] ?? "white"}
          style={{ animation: "sg-pop 380ms" }}
        >
          {ordinal(placeOf(me.score, scores))}
        </Text>
        <Text ff={DISPLAY} fw={600} fz={34} c={me.score < 0 ? "red.4" : "white"}>
          {money(me.score)} {me.score === top && "🏆"}
        </Text>
      </Stack>
      <Stack gap={6} mt="xl">
        {ranked.map((p) => (
          <Group
            key={p.id}
            justify="space-between"
            px="sm"
            py={8}
            style={{
              borderRadius: 10,
              background: p.id === me.id ? "rgba(255,212,59,.1)" : "rgba(255,255,255,.04)",
              border: p.id === me.id ? `1px solid rgba(255,212,59,.4)` : "1px solid transparent",
            }}
          >
            <Group gap="sm">
              <Text fw={800} size="sm" w={34} c="#a5abee">
                {ordinal(placeOf(p.score, scores))}
              </Text>
              <Text fw={700}>{p.name}</Text>
            </Group>
            <Text ff={DISPLAY} fw={600} c={p.score < 0 ? "red.4" : "yellow.4"}>
              {money(p.score)}
            </Text>
          </Group>
        ))}
      </Stack>
      <Text size="sm" c="boardBlue.1" ta="center" mt="md">
        Waiting for Wyatt: stay for a rematch, or leave.
      </Text>
      <Button mt="xs" variant="subtle" color="red" onClick={() => setLeft((l) => [...l, viewer])}>
        Leave
      </Button>
    </PhoneScreen>
  );

  return (
    <>
      <Group gap="sm">
        <SegmentedControl
          size="xs"
          value={size}
          onChange={(x) => setSize(x as HostSize)}
          data={Object.entries(HOST_SIZES).map(([value, x]) => ({ value, label: x.label }))}
        />
        <SegmentedControl
          size="xs"
          value={count}
          onChange={(x) => setCount(x as "4" | "6")}
          data={[
            { value: "4", label: "4 players" },
            { value: "6", label: "6 players" },
          ]}
        />
        <SegmentedControl
          size="xs"
          value={viewer}
          onChange={(x) => setViewer(x as Pid)}
          data={(["alice", "bob", "dana"] as Pid[]).map((p) => ({ value: p, label: `${NAME[p]}'s phone` }))}
        />
        <Switch size="xs" label="Tie for 1st" checked={tie} onChange={(e) => setTie(e.currentTarget.checked)} />
        <Button
          size="xs"
          variant="subtle"
          onClick={() => {
            setStage("scores");
            setLeft([]);
          }}
        >
          Back to the scores
        </Button>
      </Group>
      <TwoDevices
        size={size}
        phoneLabel={`${NAME[viewer]}'s phone`}
        host={
          <HostDevice
            size={size}
            stage={hostStage}
            column={
              <>
                {inLobby && (
                  <Group justify="space-between" px={2}>
                    <Text fw={700} size="sm">
                      Players
                    </Text>
                    <Text ff={DISPLAY} fw={600} c="yellow.4">
                      {tiles.length} / 6
                    </Text>
                  </Group>
                )}
                <Tiles players={tiles} />
                <Buzzer state="idle" height={64} />
              </>
            }
          />
        }
        phone={<PhoneDevice>{phoneBody}</PhoneDevice>}
      />
    </>
  );
}

// ── Host override ───────────────────────────────────────────────────────────────────────
type OPhase = "judged" | "response" | "board";

function Override() {
  const [size, setSize] = useState<HostSize>("844");
  const [phase, setPhase] = useState<OPhase>("response");
  const [run, setRun] = useState(0);
  const [reviewing, setReviewing] = useState(false);
  const [overridden, setOverridden] = useState(false);
  const [deltaKey, setDeltaKey] = useState(0);

  // Bob said "Krakatoa"; speech-to-text heard "crack a toe a" and it was judged incorrect.
  const value = 400;
  const scores: Record<Pid, number> = {
    alice: 1200,
    bob: overridden ? 800 + value : 800 - value,
    dana: -400,
    wyatt: -200,
  };
  const control: Pid = overridden ? "bob" : "alice";

  // biome-ignore lint/correctness/useExhaustiveDependencies: run restarts the 6 s timer on Replay
  useEffect(() => {
    if (phase !== "response" || reviewing) return;
    const id = window.setTimeout(() => setPhase("board"), 6000);
    return () => clearTimeout(id);
  }, [phase, reviewing, run]);

  function restart() {
    setOverridden(false);
    setReviewing(false);
    setPhase("response");
    setRun((n) => n + 1);
  }

  function apply() {
    setOverridden(true);
    setReviewing(false);
    setDeltaKey((k) => k + 1);
  }

  const verdict = (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, flexWrap: "wrap" }}>
      {overridden && (
        <span
          style={{
            background: GOLD,
            color: INK,
            fontWeight: 800,
            fontSize: "3.6cqh",
            letterSpacing: ".1em",
            padding: "2px 7px",
            borderRadius: 4,
          }}
        >
          HOST OVERRIDE
        </span>
      )}
      <span
        style={{
          fontWeight: 700,
          fontSize: "7cqh",
          color: overridden ? "var(--mantine-color-green-4)" : "var(--mantine-color-red-4)",
        }}
      >
        {overridden ? "✓" : "✗"} Bob: <i style={{ fontWeight: 500 }}>crack a toe a</i>
      </span>
      <span
        style={{
          fontFamily: DISPLAY,
          fontWeight: 700,
          fontSize: "7cqh",
          color: overridden ? "var(--mantine-color-green-4)" : "var(--mantine-color-red-4)",
        }}
      >
        {overridden ? `+${money(value)}` : money(-value)}
      </span>
      {!overridden && (
        <UnstyledButton
          onClick={() => setReviewing(true)}
          style={{
            fontSize: "3.8cqh",
            fontWeight: 700,
            color: "#c9cdf7",
            border: "1px solid rgba(201,205,247,.5)",
            borderRadius: 6,
            padding: "3px 9px",
          }}
        >
          Override
        </UnstyledButton>
      )}
    </div>
  );

  const stage =
    phase === "board" ? (
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          borderRadius: 12,
          background: STAGE,
        }}
      >
        <Text c="#c9cdf7">(back to the board, {NAME[control]} picks)</Text>
        <Button size="xs" variant="light" onClick={restart}>
          Replay
        </Button>
      </div>
    ) : (
      <Stage>
        <div
          style={{
            color: "#c9cdf7",
            fontWeight: 700,
            letterSpacing: ".12em",
            fontSize: "4.4cqh",
            textTransform: "uppercase",
          }}
        >
          Volcanoes · {money(value)}
        </div>
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "2cqh",
            textAlign: "center",
          }}
        >
          {verdict}
          <Text c="#c9cdf7" fw={700} tt="uppercase" mt="2cqh" style={{ fontSize: "4.5cqh", letterSpacing: ".14em" }}>
            Correct response
          </Text>
          <Text ff={DISPLAY} fw={700} c="white" tt="uppercase" style={{ fontSize: "min(15cqh, 9cqw)", lineHeight: 1 }}>
            Krakatoa
          </Text>
        </div>
        <Bar ms={6000} runKey={`${run}-${overridden}`} paused={reviewing} color="rgba(255,255,255,.35)" h={3} />
      </Stage>
    );

  const overlay = reviewing ? (
    <Sheet onClose={() => setReviewing(false)}>
      <Stack gap="sm">
        <Text c="dimmed" size="xs" fw={700} tt="uppercase" style={{ letterSpacing: ".1em" }}>
          Host override · the clock is paused
        </Text>
        <div>
          <Text size="sm" c="dimmed">
            Bob said
          </Text>
          <Text fz={22} fs="italic" fw={600}>
            “crack a toe a”
          </Text>
        </div>
        <div>
          <Text size="sm" c="dimmed">
            Correct response
          </Text>
          <Text fz={22} fw={700}>
            Krakatoa
          </Text>
        </div>
        <Text size="sm">
          Marking it correct gives Bob <b style={{ color: "var(--mantine-color-green-4)" }}>+{money(value)}</b> instead
          of −{money(value)} ({money(800 - value)} → {money(800 + value)}) and gives Bob control.
        </Text>
        <Group grow gap="xs">
          <Button variant="default" onClick={() => setReviewing(false)}>
            Keep ✗
          </Button>
          <Button color="green" onClick={apply}>
            Mark correct ✓
          </Button>
        </Group>
      </Stack>
    </Sheet>
  ) : null;

  const phone = (
    <PhoneDevice>
      <PhoneScreen top={<PhoneTop score={scores.bob} />} buzzer={<Buzzer state="idle" />}>
        <Stack align="center" justify="center" ta="center" style={{ flex: 1 }} gap="xs">
          {overridden ? (
            <div style={{ animation: "sg-pop 300ms" }}>
              <Text c="yellow.4" fw={800} size="xs" style={{ letterSpacing: ".14em" }}>
                HOST OVERRIDE
              </Text>
              <Text ff={DISPLAY} fw={700} fz={88} lh={1} c="green.5">
                ✓
              </Text>
              <Text ff={DISPLAY} fw={700} fz={40} c="green.4">
                +{money(value)}
              </Text>
              <Text size="sm" c="boardBlue.1">
                {phase === "board" ? "You have control: pick the next clue." : "Wyatt changed your answer to correct."}
              </Text>
            </div>
          ) : reviewing ? (
            <Text ff={DISPLAY} fw={600} fz={30}>
              Wyatt is reviewing your answer…
            </Text>
          ) : (
            <Text ff={DISPLAY} fw={600} fz={34}>
              Look at the TV.
            </Text>
          )}
        </Stack>
      </PhoneScreen>
    </PhoneDevice>
  );

  return (
    <>
      <Group gap="sm">
        <SegmentedControl
          size="xs"
          value={size}
          onChange={(x) => setSize(x as HostSize)}
          data={Object.entries(HOST_SIZES).map(([value, x]) => ({ value, label: x.label }))}
        />
        <Button size="xs" variant="light" onClick={restart}>
          Replay the correct-response screen
        </Button>
      </Group>
      <Text size="sm" c="dimmed" maw={860}>
        Bob said “Krakatoa”, but speech-to-text heard “crack a toe a” and judged it wrong. While the correct response is
        on screen, the host taps Override. The room sees the review (it's the TV), the clock pauses, and the change is
        labeled HOST OVERRIDE.
      </Text>
      <TwoDevices
        size={size}
        phoneLabel="Bob's phone"
        host={
          <HostDevice
            size={size}
            stage={stage}
            overlay={overlay}
            column={
              <>
                <Tiles
                  players={ORDER.map((p) => ({ id: p, name: NAME[p], score: scores[p], host: p === "wyatt" }))}
                  controlId={control}
                  deltas={deltaKey ? { bob: { amount: 2 * value, key: deltaKey } } : undefined}
                />
                <Buzzer state="idle" height={64} />
              </>
            }
          />
        }
        phone={phone}
      />
    </>
  );
}

// ── My games ────────────────────────────────────────────────────────────────────────────
type PastGame = {
  id: string;
  when: string;
  date: string;
  minutes: number;
  unfinished?: boolean;
  watched?: boolean;
  host: string;
  results: { name: string; score: number; me?: boolean }[];
};

const GAMES: PastGame[] = [
  {
    id: "g1",
    when: "Today, 8:14 PM",
    date: "Nov 9, 2026 · 8:14 PM",
    minutes: 41,
    host: "Wyatt",
    results: [
      { name: "Alice", score: 2900 },
      { name: "Bob", score: 800 },
      { name: "Dana", score: -400, me: true },
      { name: "Wyatt", score: -200 },
    ],
  },
  {
    id: "g2",
    when: "Oct 26, 8:14 PM",
    date: "Oct 26, 2026 · 8:14 PM",
    minutes: 41,
    host: "Carol",
    results: [
      { name: "Dana", score: 12400, me: true },
      { name: "Bob", score: 8000 },
      { name: "Carol", score: 8000 },
      { name: "Former player", score: -400 },
    ],
  },
  {
    id: "g3",
    when: "Oct 24, 9:02 PM",
    date: "Oct 24, 2026 · 9:02 PM",
    minutes: 18,
    unfinished: true,
    host: "Dana",
    results: [
      { name: "Alice", score: 3600 },
      { name: "Dana", score: 3200, me: true },
    ],
  },
  {
    id: "g4",
    when: "Oct 19, 7:30 PM",
    date: "Oct 19, 2026 · 7:30 PM",
    minutes: 44,
    watched: true,
    host: "Dana",
    results: [
      { name: "Eun-ji", score: 15200 },
      { name: "Farah", score: 9800 },
      { name: "Gus", score: 600 },
    ],
  },
  ...Array.from({ length: 19 }, (_, i): PastGame => {
    const day = 17 - Math.floor(i / 2);
    const mine = [6400, -800, 2000, 11200, 400][i % 5];
    return {
      id: `old${i}`,
      when: `${day > 0 ? `Oct ${day}` : `Sep ${30 + day}`}, ${i % 2 ? "9:40" : "8:05"} PM`,
      date: `${day > 0 ? `Oct ${day}` : `Sep ${30 + day}`}, 2026 · ${i % 2 ? "9:40" : "8:05"} PM`,
      minutes: 35 + (i % 9),
      host: "Bob",
      results: [
        { name: "Dana", score: mine, me: true },
        { name: "Bob", score: 5000 + (i % 4) * 1100 },
        { name: "Hiro", score: 3000 - (i % 3) * 2600 },
      ].sort((a, b) => b.score - a.score),
    };
  }),
];

function History() {
  const [open, setOpen] = useState<PastGame | null>(null);
  const [shown, setShown] = useState(20);
  const [empty, setEmpty] = useState(false);
  const list = empty ? [] : GAMES;

  const body = open ? (
    <GameScoreboard game={open} onBack={() => setOpen(null)} />
  ) : (
    <PhoneScreen>
      <Group justify="space-between" mt={4} mb="md">
        <Text ff={DISPLAY} fw={700} fz={34}>
          My games
        </Text>
        <Anchor size="sm" c="boardBlue.2">
          Home
        </Anchor>
      </Group>
      {list.length === 0 ? (
        <Stack align="center" ta="center" mt={80} gap="sm">
          <Text fz={44}>🎲</Text>
          <Text fw={700} size="lg">
            No games yet
          </Text>
          <Text size="sm" c="boardBlue.1" maw={260}>
            Games you play or watch show up here, with everyone's scores.
          </Text>
          <GoldButton>Join a game</GoldButton>
        </Stack>
      ) : (
        <Stack gap={8}>
          {list.slice(0, shown).map((g) => (
            <GameRow key={g.id} game={g} onOpen={() => setOpen(g)} />
          ))}
          {shown < list.length && (
            <Button variant="subtle" onClick={() => setShown((n) => n + 20)}>
              Show more
            </Button>
          )}
          <Text size="xs" c="dimmed" ta="center" mt="xs">
            Played without an account. Link Google or email to keep these if you switch phones.
          </Text>
        </Stack>
      )}
    </PhoneScreen>
  );

  return (
    <>
      <Group gap="sm">
        <Switch
          size="xs"
          label="No games yet"
          checked={empty}
          onChange={(e) => {
            setEmpty(e.currentTarget.checked);
            setOpen(null);
          }}
        />
      </Group>
      <Text size="sm" c="dimmed" maw={860}>
        From the phone's home screen. Newest first, 20 at a time. Includes an unfinished game, a game Dana only watched,
        and a player who deleted their account.
      </Text>
      <Fit width={PHONE.w + BEZEL * 2} height={PHONE.h + BEZEL * 2}>
        <PhoneDevice>{body}</PhoneDevice>
      </Fit>
    </>
  );
}

function GameRow({ game, onOpen }: { game: PastGame; onOpen: () => void }) {
  const scores = game.results.map((r) => r.score);
  const me = game.results.find((r) => r.me);
  const pl = me ? placeOf(me.score, scores) : 0;
  return (
    <UnstyledButton
      onClick={onOpen}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 12px",
        borderRadius: 14,
        background: "rgba(255,255,255,.05)",
        border: "1px solid rgba(255,255,255,.07)",
      }}
    >
      <div
        style={{
          width: 46,
          height: 46,
          flexShrink: 0,
          borderRadius: 12,
          background: game.watched ? "rgba(255,255,255,.06)" : CELL,
          boxShadow: game.watched ? "none" : BEVEL,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: DISPLAY,
          fontWeight: 700,
          fontSize: game.watched ? 11 : 18,
          color: game.watched ? "#a5abee" : (PLACE_COLOR[pl] ?? "#fff"),
          letterSpacing: game.watched ? ".06em" : 0,
        }}
      >
        {game.watched ? "WATCHED" : ordinal(pl)}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <Group gap={6} wrap="nowrap">
          <Text fw={700} size="sm">
            {game.when}
          </Text>
          {game.unfinished && (
            <Badge size="xs" color="gray" variant="outline">
              Unfinished
            </Badge>
          )}
        </Group>
        <Text size="xs" c="boardBlue.1" truncate="end">
          {game.results.map((r) => (r.me ? "You" : r.name)).join(", ")}
        </Text>
      </div>
      {me && (
        <Text ff={DISPLAY} fw={600} fz={18} c={me.score < 0 ? "red.4" : "yellow.4"}>
          {money(me.score)}
        </Text>
      )}
      <Text c="dimmed">›</Text>
    </UnstyledButton>
  );
}

function GameScoreboard({ game, onBack }: { game: PastGame; onBack: () => void }) {
  const scores = game.results.map((r) => r.score);
  return (
    <PhoneScreen>
      <Anchor size="sm" c="boardBlue.2" onClick={onBack} mt={4}>
        ‹ My games
      </Anchor>
      <Text c="boardBlue.1" size="sm" mt="md">
        {game.date} · {game.minutes} min
      </Text>
      <Text ff={DISPLAY} fw={700} fz={30} mb="xs">
        Hosted by {game.host}
      </Text>
      {game.unfinished && (
        <Text
          size="sm"
          c="orange.3"
          mb="sm"
          p="xs"
          style={{ border: "1px solid rgba(255,169,77,.4)", borderRadius: 10 }}
        >
          Unfinished: these are the scores when the room closed.
        </Text>
      )}
      {game.watched && (
        <Text size="sm" c="boardBlue.1" mb="sm">
          You watched this game.
        </Text>
      )}
      <Stack gap={6}>
        {game.results.map((r) => {
          const pl = placeOf(r.score, scores);
          const former = r.name === "Former player";
          return (
            <Group
              key={r.name}
              justify="space-between"
              wrap="nowrap"
              px="sm"
              py={10}
              style={{
                borderRadius: 12,
                background: r.me ? "rgba(255,212,59,.1)" : "rgba(255,255,255,.04)",
                border: r.me ? "1px solid rgba(255,212,59,.4)" : "1px solid transparent",
              }}
            >
              <Group gap="sm" wrap="nowrap">
                <Text fw={800} w={38} c={PLACE_COLOR[pl] ?? "#a5abee"}>
                  {ordinal(pl)}
                </Text>
                <Text fw={700} fs={former ? "italic" : undefined} c={former ? "dimmed" : undefined}>
                  {r.name}
                  {r.me && (
                    <Text span c="dimmed" fw={500}>
                      {" "}
                      (you)
                    </Text>
                  )}
                </Text>
                {pl === 1 && !game.unfinished && <Text>🏆</Text>}
              </Group>
              <Text ff={DISPLAY} fw={600} fz={20} c={r.score < 0 ? "red.4" : "yellow.4"}>
                {money(r.score)}
              </Text>
            </Group>
          );
        })}
      </Stack>
    </PhoneScreen>
  );
}
