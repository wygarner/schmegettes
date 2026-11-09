/** biome-ignore-all lint/correctness/noUnusedVariables: the design kit is inlined whole in every prototype */

import {
  Alert,
  Badge,
  Button,
  createTheme,
  Group,
  MantineProvider,
  SegmentedControl,
  SimpleGrid,
  Slider,
  Stack,
  Switch,
  Text,
  Title,
  UnstyledButton,
} from "@mantine/core";
import { useElementSize } from "@mantine/hooks";
import { type ReactNode, useEffect, useRef, useState } from "react";

// PROTOTYPE — the Schmegettes design kit: tokens, the buzzer, player tiles, and the host
// screen at every target size. The kit below is inlined in every prototype (they can't share code).

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

type BuzzerState = "idle" | "dim" | "lit" | "early" | "answering" | "locked";
/** Dome gradient stops per state: highlight, body, shade, rim. Words go to screen readers only. */
const DOME: Record<BuzzerState, { label: string; stops: [string, string, string, string]; glow?: string }> = {
  idle: { label: "Buzz", stops: ["#d98585", "#a3201f", "#6d0c0c", "#360303"] },
  dim: { label: "Buzz (get ready)", stops: ["#d98585", "#a3201f", "#6d0c0c", "#360303"] },
  lit: { label: "Buzz", stops: ["#ffb8b8", "#ff3030", "#d40c0c", "#7a0404"], glow: "sg-glow-red 1s" },
  early: { label: "Too early", stops: ["#8f6060", "#5c1414", "#3a0808", "#1c0202"] },
  answering: { label: "Answer now", stops: ["#c2f7cd", "#37c95a", "#1c8f37", "#0b4a1a"], glow: "sg-glow-green 1.8s" },
  locked: { label: "You've answered this one", stops: ["#8a8c99", "#4b4d5c", "#30313d", "#18181f"] },
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
        if (state === "dim" || state === "lit") onBuzz?.();
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

const CATS = ["Volcanoes", "Potpourri", "80s TV", "World Capitals", "Rhyme Time", "Words From French"];
const fresh = (done: [number, number][] = []): BoardCell[][] =>
  CATS.map((_, c) =>
    [200, 400, 600, 800].map((value, r) => ({ value, done: done.some(([dc, dr]) => dc === c && dr === r) })),
  );

const ROSTER: Player[] = [
  { id: "a", name: "Alice", score: 1200 },
  { id: "b", name: "Bob", score: 400 },
  { id: "w", name: "Wyatt", score: -200, host: true },
  { id: "c", name: "Carol Montgomery-Reyes", score: 2600 },
  { id: "d", name: "Dev", score: 0 },
  { id: "e", name: "Eun-ji", score: -1400 },
];

export default function Components() {
  return (
    <MantineProvider theme={theme} defaultColorScheme="dark">
      <Kit />
      <Stack gap={48} pb={64} maw={1280}>
        <Stack gap="xs">
          <Alert color="yellow" title="PROTOTYPE — not production code" />
          <Title order={1}>Design kit</Title>
          <Text c="dimmed" maw={720}>
            The pieces every Schmegettes screen is built from. The other prototypes inline the same kit. The host screen
            is the host's iPhone held sideways and mirrored to the TV; contestants' phones are controllers.
          </Text>
        </Stack>
        <Tokens />
        <BuzzerSheet />
        <TileSheet />
        <PadSheet />
        <FitCheck />
      </Stack>
    </MantineProvider>
  );
}

function Section({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <Stack gap="md">
      <div>
        <Title order={2}>{title}</Title>
        {sub && (
          <Text c="dimmed" size="sm" maw={760}>
            {sub}
          </Text>
        )}
      </div>
      {children}
    </Stack>
  );
}

function Tokens() {
  const swatches = [
    { name: "Night", value: NIGHT, use: "Host screen behind the stage; phone base" },
    { name: "Stage", value: STAGE, use: "Clue, lobby, Daily Double and Final stages" },
    { name: "boardBlue.9", value: CELL, use: "Board cells, category headers, player tiles" },
    {
      name: "Buzzer red",
      value: "radial-gradient(circle at 36% 28%, #ffb8b8 0%, #ff3030 32%, #d40c0c 70%, #7a0404 100%)",
      use: "The buzzer dome, lit. Unlit it's a darker red; green when you won the buzz",
    },
    { name: "yellow.4", value: GOLD, use: "Values, scores, control ring, the main action on the stage" },
    { name: "green.7", value: "var(--mantine-color-green-7)", use: "Correct, Answer now" },
    {
      name: "red.7 / red.4",
      value: "var(--mantine-color-red-7)",
      use: "Incorrect, Too early, negative scores (red.4 text)",
    },
  ];
  return (
    <Section title="Tokens" sub="Night and stage are new. Everything else is already in the design system.">
      <SimpleGrid cols={{ base: 2, md: 3 }} spacing="md">
        {swatches.map((s) => (
          <Group key={s.name} gap="sm" wrap="nowrap" align="flex-start">
            <div
              style={{
                width: 56,
                height: 56,
                flexShrink: 0,
                borderRadius: 10,
                background: s.value,
                boxShadow: "inset 0 0 0 1px rgba(255,255,255,.15)",
              }}
            />
            <div>
              <Text fw={700}>{s.name}</Text>
              <Text size="sm" c="dimmed">
                {s.use}
              </Text>
            </div>
          </Group>
        ))}
      </SimpleGrid>
      <Stack gap={6} p="lg" style={{ background: STAGE, borderRadius: 12 }}>
        <Text ff={DISPLAY} fw={700} fz={56} lh={1} c="yellow.4" style={{ letterSpacing: ".2em" }}>
          K7RXM
        </Text>
        <Text size="xs" c="boardBlue.1">
          Oswald 700, letter-spaced: room code, values, scores, DAILY DOUBLE, the buzzer label
        </Text>
        <Text ff={DISPLAY} fw={500} fz={26} lh={1.2} c="white" tt="uppercase" maw={620}>
          The largest active volcano on Earth by volume, it rises from Hawaii's Big Island
        </Text>
        <Text size="xs" c="boardBlue.1">
          Oswald 500, uppercase: clue text (condensed, so long clues fit the 667 px host screen)
        </Text>
        <Text fw={700} fz={18} c="white">
          Alice is picking…
        </Text>
        <Text size="xs" c="boardBlue.1">
          Inter 400–800: everything else, including category headers (700, uppercase)
        </Text>
      </Stack>
    </Section>
  );
}

function BuzzerSheet() {
  const states: { s: BuzzerState; when: string }[] = [
    { s: "idle", when: "Lobby, board, between clues, someone else answering. Unlit red; a tap only presses it." },
    {
      s: "dim",
      when: "Clue being read. A faint red ring around the rim says get ready. A tap here is an early buzz.",
    },
    { s: "lit", when: "Buzzing open. Bright red and glowing." },
    { s: "early", when: "For 250 ms after an early tap: goes dark and shakes." },
    { s: "answering", when: "I won the buzz. Turns green and glows." },
    { s: "locked", when: "I already tried this clue. Grey and faded." },
  ];
  return (
    <Section
      title="Buzzer"
      sub="One component in every view: an oblong red dome the full width of its container, in a dark rim, with no lettering. The whole button is the tap target. On phones it's pinned to the bottom, 120 px tall; in the host's column, 64 px. State shows in the dome's color, light and motion; screen readers hear Buzz, Too early, Answer now, or You've answered this one."
    >
      <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="lg">
        {states.map(({ s, when }) => (
          <Stack key={s} gap={6}>
            <div style={{ background: NIGHT, padding: 12, borderRadius: 16 }}>
              <Buzzer state={s} />
            </div>
            <Text fw={700} size="sm">
              {s}
            </Text>
            <Text size="sm" c="dimmed">
              {when}
            </Text>
          </Stack>
        ))}
      </SimpleGrid>
      <BuzzerDemo />
    </Section>
  );
}

function BuzzerDemo() {
  const [state, setState] = useState<BuzzerState>("idle");
  const [log, setLog] = useState("Press Run a clue, then tap the buzzer early, on time, or not at all.");
  const phase = useRef<"none" | "reading" | "open">("none");
  const timers = useRef<number[]>([]);
  const later = (fn: () => void, ms: number) => timers.current.push(window.setTimeout(fn, ms));
  const clear = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  function run() {
    clear();
    phase.current = "reading";
    setState("dim");
    setLog("Reading: “Here's Volcanoes for 400…” A tap now is an early buzz.");
    later(() => {
      phase.current = "open";
      setState((s) => (s === "early" ? s : "lit"));
      setLog("Buzzing open. 5 s.");
    }, 3500);
    later(() => {
      phase.current = "none";
      setState("idle");
      setLog("Nobody buzzed. The TV shows the correct response.");
    }, 8500);
  }

  function buzz() {
    if (state === "dim") {
      setState("early");
      setLog("Too early: locked out for 250 ms.");
      later(() => setState(phase.current === "open" ? "lit" : "dim"), 250);
    } else if (state === "lit") {
      clear();
      setState("answering");
      setLog("You won the buzz. The phone is listening.");
      later(() => {
        setState("locked");
        setLog("✗ Judged incorrect. Buzzing reopens for the others; you're locked out of this clue.");
      }, 2600);
      later(() => {
        setState("idle");
        setLog("Clue over.");
      }, 6500);
    }
  }

  return (
    <Group align="center" gap="xl" p="md" style={{ background: "rgba(255,255,255,.03)", borderRadius: 12 }}>
      <div style={{ width: 320, background: NIGHT, padding: 12, borderRadius: 16 }}>
        <Buzzer state={state} onBuzz={buzz} />
      </div>
      <Stack gap="xs" style={{ flex: 1, minWidth: 240 }}>
        <Text fw={700}>Try it</Text>
        <Text size="sm" c="dimmed">
          {log}
        </Text>
        <Group>
          <Button onClick={run}>Run a clue</Button>
          <Badge variant="light">{state}</Badge>
        </Group>
      </Stack>
    </Group>
  );
}

function TileSheet() {
  const [deltaKey, setDeltaKey] = useState(0);
  const [alice, setAlice] = useState(1200);
  const four = ROSTER.slice(0, 4).map((p) =>
    p.id === "c" ? { ...p, online: false } : p.id === "a" ? { ...p, score: alice } : p,
  );
  const box = (children: ReactNode, label: string) => (
    <Stack gap={6}>
      <div
        style={{
          width: 236,
          height: 300,
          background: NIGHT,
          padding: 8,
          borderRadius: 12,
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        {children}
      </div>
      <Text size="sm" c="dimmed" maw={236}>
        {label}
      </Text>
    </Stack>
  );
  return (
    <Section
      title="Player tiles"
      sub="Join order, name and score, always visible. The player in control gets the 3 px gold ring and a gold PICKING chip. Score changes float the amount over the tile for 1.8 s."
    >
      <Group align="flex-start" gap="xl">
        {box(
          <Tiles players={four} controlId="a" deltas={deltaKey ? { a: { amount: 400, key: deltaKey } } : undefined} />,
          "Up to 4: two lines. HOST chip, negative in red, reconnecting dimmed.",
        )}
        {box(<Tiles players={ROSTER} controlId="c" />, "5 or 6: one line, max 48 px, long names truncate.")}
        {box(
          <Tiles
            players={ROSTER.slice(0, 4)}
            tags={{ a: "✓ locked", b: "wagering…", w: "not in Final", c: "✓ locked" }}
            dimIds={["w"]}
          />,
          "Final: status only, never an amount. Non-finalists dimmed.",
        )}
      </Group>
      <Group>
        <Button
          variant="light"
          onClick={() => {
            setAlice((s) => s + 400);
            setDeltaKey((k) => k + 1);
          }}
        >
          Alice answers correctly (+$400)
        </Button>
      </Group>
    </Section>
  );
}

function FitCheck() {
  const [size, setSize] = useState<HostSize>("667");
  const [count, setCount] = useState(6);
  const [hostPlays, setHostPlays] = useState(true);
  const colRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState<{ ok: boolean; tile: number }>({ ok: true, tile: 0 });

  const players = ROSTER.slice(0, count).map((p) =>
    p.id === "w" && !hostPlays ? { ...p, id: "w2", name: "Gus", host: false } : p,
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-measure whenever the controls change the layout
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const el = colRef.current;
      if (!el) return;
      const tiles = [...el.querySelectorAll<HTMLElement>("[data-tile]")].map((t) => t.offsetHeight);
      setFit({ ok: el.scrollHeight <= el.clientHeight + 1, tile: Math.min(...tiles) });
    });
    return () => cancelAnimationFrame(id);
  }, [size, count, hostPlays]);

  const s = HOST_SIZES[size];
  return (
    <Section
      title="Host screen fit check"
      sub="Every game screen must fit without scrolling from 667 × 320 up, inside the safe areas. Change the size and player count to check the column."
    >
      <Group gap="lg" align="center">
        <SegmentedControl
          value={size}
          onChange={(v) => setSize(v as HostSize)}
          data={Object.entries(HOST_SIZES).map(([value, x]) => ({ value, label: x.label }))}
        />
        <Group gap="xs" w={220}>
          <Text size="sm">Players {count}</Text>
          <Slider style={{ flex: 1 }} min={2} max={6} value={count} onChange={setCount} />
        </Group>
        <Switch
          label="Host plays (buzzer in column)"
          checked={hostPlays}
          onChange={(e) => setHostPlays(e.currentTarget.checked)}
        />
        <Badge color={fit.ok ? "green" : "red"} variant="light" size="lg">
          {fit.ok ? `Fits · tiles ${fit.tile}px` : "Overflows"}
        </Badge>
      </Group>
      <Fit width={s.w + BEZEL * 2} height={s.h + BEZEL * 2}>
        <HostDevice
          size={size}
          stage={
            <Board
              cats={CATS}
              cells={fresh([
                [1, 0],
                [2, 0],
                [3, 1],
              ])}
              hostW={s.w}
            />
          }
          column={
            <div
              ref={colRef}
              style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: 6, overflow: "hidden" }}
            >
              <Tiles players={players} controlId="a" />
              {hostPlays && <Buzzer state="idle" height={64} />}
            </div>
          }
        />
      </Fit>
    </Section>
  );
}

function PadSheet() {
  const [last, setLast] = useState<string | null>(null);
  return (
    <Section
      title="Wager pad"
      sub="Daily Double and Final wagers. Phone layout on the left; on the host screen it sits on the stage (there's no room in the column). Masked for the host's Final wager: dots, and no key highlights the mirrored TV could show."
    >
      <Group align="flex-start" gap="xl">
        <div style={{ width: 346, background: PHONE_BG, padding: 20, borderRadius: 24 }}>
          <WagerPad min={5} max={1200} confirmLabel="Wager" onConfirm={(n) => setLast(`Wagered ${money(n)}`)} />
        </div>
        <Stack gap="lg" style={{ flex: 1, minWidth: 320 }}>
          <div style={{ height: 200, maxWidth: 560, display: "flex" }}>
            <Stage>
              <WagerPad
                layout="stage"
                min={0}
                max={2200}
                masked
                confirmLabel="Lock in"
                onConfirm={() => setLast("Locked in (amount hidden)")}
              />
            </Stage>
          </div>
          {last && (
            <Badge size="lg" variant="light">
              {last}
            </Badge>
          )}
        </Stack>
      </Group>
    </Section>
  );
}
