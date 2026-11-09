/** biome-ignore-all lint/correctness/noUnusedVariables: the design kit is inlined whole in every prototype */

import {
  ActionIcon,
  Alert,
  Anchor,
  Button,
  createTheme,
  Group,
  MantineProvider,
  PinInput,
  SegmentedControl,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
  Title,
  UnstyledButton,
} from "@mantine/core";
import { useElementSize } from "@mantine/hooks";
import { type ReactNode, useEffect, useRef, useState } from "react";

// PROTOTYPE — Host a game and join on a phone: Home, room creation, the TV lobby, joining by code,
// the microphone check, Start and "Shuffling a fresh board…", with every error state reachable.

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

const CODE = "K7RXM";
const SITE = "schmegettes.app";

type HostView = "home" | "lobby" | "building" | "ready" | "not-host" | "closed";
type PhoneView = "home" | "name" | "in";
type Mic = "ask" | "prompt" | "granted" | "blocked" | "unsupported";
type LobbyPlayer = { id: string; name: string; host?: boolean; online: boolean };

function uniqueName(name: string, taken: string[]) {
  if (!taken.includes(name)) return name;
  let i = 2;
  while (taken.includes(`${name} ${i}`)) i++;
  return `${name} ${i}`;
}

function useTimers() {
  const ids = useRef<number[]>([]);
  useEffect(() => () => ids.current.forEach(clearTimeout), []);
  return {
    later: (fn: () => void, ms: number) => {
      ids.current.push(window.setTimeout(fn, ms));
    },
    clear: () => {
      ids.current.forEach(clearTimeout);
      ids.current = [];
    },
  };
}

export default function HostAndJoin() {
  const t = useTimers();
  const [size, setSize] = useState<HostSize>("844");

  // Host device
  const [hostView, setHostView] = useState<HostView>("home");
  const [naming, setNaming] = useState(false);
  const [hostName, setHostName] = useState("Wyatt");
  const [draftHostName, setDraftHostName] = useState("Wyatt");
  const [creating, setCreating] = useState(false);
  const [createFailed, setCreateFailed] = useState(false);
  const [failCreate, setFailCreate] = useState(false);
  const [failBuild, setFailBuild] = useState(false);
  const [buildFailed, setBuildFailed] = useState(false);
  const [starting, setStarting] = useState(false);
  const [editingHost, setEditingHost] = useState(false);
  const [players, setPlayers] = useState<LobbyPlayer[]>([]);

  // Dana's phone
  const [phoneView, setPhoneView] = useState<PhoneView>("home");
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [myName, setMyName] = useState("Dana");
  const [editingMe, setEditingMe] = useState(false);
  const [mic, setMic] = useState<Mic>("ask");

  const count = players.length;
  const full = count >= 6;
  const hostJoined = players.some((p) => p.host);
  const me = players.find((p) => p.id === "me");
  const started = hostView === "building" || hostView === "ready";
  const s = HOST_SIZES[size];

  const add = (id: string, name: string, host = false) =>
    setPlayers((ps) =>
      ps.length >= 6 || ps.some((p) => p.id === id)
        ? ps
        : [
            ...ps,
            {
              id,
              name: uniqueName(
                name,
                ps.map((p) => p.name),
              ),
              host,
              online: true,
            },
          ],
    );
  const remove = (id: string) => setPlayers((ps) => ps.filter((p) => p.id !== id));
  const setOnline = (id: string, online: boolean) =>
    setPlayers((ps) => ps.map((p) => (p.id === id ? { ...p, online } : p)));
  const rename = (id: string, name: string) =>
    setPlayers((ps) =>
      ps.map((p) =>
        p.id === id
          ? {
              ...p,
              name: uniqueName(
                name,
                ps.filter((q) => q.id !== id).map((q) => q.name),
              ),
            }
          : p,
      ),
    );

  function createRoom() {
    setCreating(true);
    t.later(() => {
      setCreating(false);
      setNaming(false);
      if (failCreate) {
        setFailCreate(false);
        setCreateFailed(true);
        return;
      }
      setHostName(draftHostName.trim());
      setCreateFailed(false);
      setHostView("lobby");
    }, 700);
  }

  function arrive() {
    t.later(() => add("a", "Alice"), 600);
    t.later(() => add("b", "Bob"), 1500);
    t.later(() => add("a2", "Alice"), 2700);
    t.later(() => setOnline("b", false), 3800);
    t.later(() => setOnline("b", true), 7000);
  }

  function start() {
    setStarting(true);
    setBuildFailed(false);
    t.later(() => {
      setStarting(false);
      setHostView("building");
      t.later(() => {
        if (failBuild) {
          setFailBuild(false);
          setBuildFailed(true);
          setHostView("lobby");
        } else setHostView("ready");
      }, 2600);
    }, 500);
  }

  function tryCode() {
    const err =
      code !== CODE || hostView === "home" || hostView === "not-host"
        ? "No room with that code."
        : hostView === "closed"
          ? "This room has closed."
          : started
            ? "This game has already started."
            : full
              ? "This room is full (6/6)."
              : null;
    setCodeError(err);
    if (!err) setPhoneView("name");
  }

  function join() {
    if (started || full) {
      setCodeError(started ? "This game has already started." : "This room is full (6/6).");
      setPhoneView("home");
      return;
    }
    add("me", myName.trim());
    setPhoneView("in");
  }

  function reset() {
    t.clear();
    setHostView("home");
    setNaming(false);
    setCreating(false);
    setCreateFailed(false);
    setBuildFailed(false);
    setStarting(false);
    setPlayers([]);
    setPhoneView("home");
    setCode("");
    setCodeError(null);
    setMic("ask");
  }

  // ── Host device ──
  let stage: ReactNode;
  let column: ReactNode;
  let overlay: ReactNode;

  if (hostView === "home") {
    stage = (
      <HostHome
        failed={createFailed}
        onHost={() => {
          setDraftHostName(hostName);
          setNaming(true);
        }}
      />
    );
    if (naming)
      overlay = (
        <Sheet>
          <Stack gap="sm">
            <Text fw={700} size="lg">
              What's your name?
            </Text>
            <TextInput
              data-autofocus
              maxLength={20}
              value={draftHostName}
              onChange={(e) => setDraftHostName(e.currentTarget.value)}
              description="Shown on the TV as “Hosted by …”"
            />
            <Group justify="flex-end" gap="xs">
              <Button variant="subtle" color="gray" onClick={() => setNaming(false)} disabled={creating}>
                Cancel
              </Button>
              <GoldButton onClick={createRoom} loading={creating} disabled={!draftHostName.trim()}>
                Create room
              </GoldButton>
            </Group>
          </Stack>
        </Sheet>
      );
  } else if (hostView === "not-host" || hostView === "closed") {
    stage = (
      <Stage>
        <Stack align="center" justify="center" style={{ flex: 1 }} gap="xs">
          <Text ff={DISPLAY} c="white" style={{ fontSize: "10cqh" }}>
            {hostView === "closed" ? "This room has closed." : "Only the host can open this screen."}
          </Text>
          <Anchor c="yellow.4" onClick={() => (hostView === "closed" ? reset() : setPhoneView("home"))}>
            {hostView === "closed" ? "Back to home" : "Join this room instead"}
          </Anchor>
        </Stack>
      </Stage>
    );
  } else {
    // lobby, building, ready share the two-column layout
    const scored: Player[] = players.map((p) => ({ id: p.id, name: p.name, score: 0, host: p.host, online: p.online }));
    if (hostView === "lobby") {
      stage = (
        <Stage pad={14}>
          <Group justify="space-between" wrap="nowrap" gap="xs">
            <Wordmark size="8cqh" />
            {editingHost ? (
              <Group gap={4} wrap="nowrap">
                <TextInput
                  size="xs"
                  w={140}
                  maxLength={20}
                  value={draftHostName}
                  onChange={(e) => setDraftHostName(e.currentTarget.value)}
                  data-autofocus
                />
                <Button
                  size="xs"
                  disabled={!draftHostName.trim()}
                  onClick={() => {
                    setHostName(draftHostName.trim());
                    rename("host", draftHostName.trim());
                    setEditingHost(false);
                  }}
                >
                  Save
                </Button>
              </Group>
            ) : (
              <Group gap={2} wrap="nowrap">
                <Text c="boardBlue.1" style={{ fontSize: "5cqh" }}>
                  Hosted by <b style={{ color: "#fff" }}>{hostName}</b>
                </Text>
                <ActionIcon
                  variant="subtle"
                  color="boardBlue.1"
                  size="sm"
                  aria-label="Edit host name"
                  onClick={() => {
                    setDraftHostName(hostName);
                    setEditingHost(true);
                  }}
                >
                  ✎
                </ActionIcon>
              </Group>
            )}
          </Group>
          <div
            style={{
              flex: 1,
              minHeight: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "4cqh",
            }}
          >
            <Text fw={600} c="boardBlue.1" style={{ fontSize: "6cqh" }}>
              Join at <span style={{ color: "#fff" }}>{SITE}/join</span>
            </Text>
            <CodeTiles code={CODE} />
          </div>
          {buildFailed && (
            <Text c="red.3" fw={600} ta="center" mb={6} style={{ fontSize: "4.5cqh" }}>
              Couldn't build a board. Try again.
            </Text>
          )}
          <Group justify="space-between" wrap="nowrap">
            <Button
              variant="outline"
              color="boardBlue.1"
              disabled={!hostJoined && full}
              onClick={() => (hostJoined ? remove("host") : add("host", hostName, true))}
            >
              {hostJoined ? "Leave the game" : !hostJoined && full ? "Room is full" : "Join the game"}
            </Button>
            <Group gap="xs" wrap="nowrap">
              {count < 2 && (
                <Text c="boardBlue.1" style={{ fontSize: "4.5cqh" }}>
                  Need at least 2 players
                </Text>
              )}
              <GoldButton disabled={count < 2} loading={starting} onClick={start}>
                Start
              </GoldButton>
            </Group>
          </Group>
        </Stage>
      );
      column = (
        <>
          <Group justify="space-between" px={2} wrap="nowrap">
            <Text fw={700} size="sm">
              Players
            </Text>
            <Text ff={DISPLAY} fw={600} c="yellow.4">
              {count} / 6
            </Text>
          </Group>
          <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: 4 }}>
            {players.length === 0 ? (
              <Text size="sm" c="boardBlue.1" ta="center" mt="md">
                Waiting for players<span style={{ animation: "sg-blink 1.2s infinite" }}>…</span>
              </Text>
            ) : (
              players.map((p) => <LobbyRow key={p.id} p={p} />)
            )}
          </div>
          {hostJoined && <Buzzer state="idle" height={64} />}
        </>
      );
    } else {
      stage =
        hostView === "building" ? (
          <Stage>
            <Shuffling />
          </Stage>
        ) : (
          <Board
            cats={CATS}
            cells={CATS.map(() => [200, 400, 600, 800].map((value) => ({ value, done: false })))}
            hostW={s.w}
          />
        );
      column = (
        <>
          <Tiles players={scored} controlId={hostView === "ready" ? (scored[0]?.id ?? "") : undefined} />
          {hostJoined && <Buzzer state="idle" height={64} />}
        </>
      );
    }
  }

  // ── Dana's phone ──
  let phone: ReactNode;
  const roomGone = phoneView === "in" && hostView === "closed";
  if (roomGone) {
    phone = (
      <PhoneScreen center>
        <Stack align="center" ta="center" gap="sm">
          <Text ff={DISPLAY} fz={32} fw={600}>
            This room has closed.
          </Text>
          <Text c="boardBlue.1" size="sm">
            The host's screen was away for 30 minutes, or they started a new room.
          </Text>
          <GoldButton
            onClick={() => {
              remove("me");
              setPhoneView("home");
            }}
          >
            Back to home
          </GoldButton>
        </Stack>
      </PhoneScreen>
    );
  } else if (phoneView === "home") {
    phone = (
      <PhoneScreen>
        <Stack gap={32} mt={36}>
          <Stack gap={6} align="center">
            <Wordmark size={46} />
            <Text c="boardBlue.1" size="sm">
              The quiz show for your living room
            </Text>
          </Stack>
          <Stack gap="sm">
            <Text fw={700} size="xl">
              Join a game
            </Text>
            <Text size="sm" c="boardBlue.1">
              Type the code on the TV.
            </Text>
            <PinInput
              length={5}
              size="xl"
              type="alphanumeric"
              aria-label="Room code"
              value={code}
              error={!!codeError}
              onChange={(v) => {
                setCode(v.toUpperCase());
                setCodeError(null);
              }}
              styles={{ input: { fontFamily: DISPLAY, fontSize: 28, fontWeight: 700 } }}
            />
            {codeError && (
              <Text c="red.4" size="sm" fw={600}>
                {codeError}
              </Text>
            )}
            <GoldButton size="lg" fullWidth disabled={code.length !== 5} onClick={tryCode}>
              Join
            </GoldButton>
            <Text
              size="xs"
              c="dimmed"
              ta="center"
              style={{ border: "1px dashed rgba(255,255,255,.15)", borderRadius: 6, padding: 6 }}
            >
              Prototype: the room's code is {CODE}. Try another for “No room”.
            </Text>
          </Stack>
        </Stack>
        <Group justify="space-between" mt="auto" pb={8}>
          <Anchor size="sm" c="boardBlue.2">
            My games
          </Anchor>
          <Anchor size="sm" c="boardBlue.2">
            Host a game
          </Anchor>
        </Group>
      </PhoneScreen>
    );
  } else if (phoneView === "name") {
    phone = (
      <PhoneScreen top={<PhoneTop />}>
        <Stack mt={32} gap="md">
          <Text ff={DISPLAY} fz={34} fw={600} lh={1.1}>
            What's your name?
          </Text>
          <Text size="sm" c="boardBlue.1">
            It's how you'll show up on the TV. Hosted by {hostName}.
          </Text>
          <TextInput
            size="lg"
            maxLength={20}
            value={myName}
            onChange={(e) => setMyName(e.currentTarget.value)}
            rightSection={
              <Text size="xs" c="dimmed">
                {myName.length}/20
              </Text>
            }
            rightSectionWidth={52}
          />
          <GoldButton size="lg" fullWidth disabled={!myName.trim()} onClick={join}>
            Join
          </GoldButton>
          <Anchor size="sm" c="boardBlue.2" onClick={() => setPhoneView("home")}>
            Use a different code
          </Anchor>
        </Stack>
      </PhoneScreen>
    );
  } else if (hostView === "building" || hostView === "ready") {
    phone = (
      <PhoneScreen top={<PhoneTop score={0} />} buzzer={<Buzzer state="idle" />}>
        {hostView === "building" ? (
          <Stack align="center" justify="center" style={{ flex: 1 }} gap="md">
            <MiniShuffle />
            <Text ff={DISPLAY} fz={28} fw={600}>
              Shuffling a fresh board…
            </Text>
          </Stack>
        ) : (
          <Stack align="center" justify="center" style={{ flex: 1 }} gap={4} ta="center">
            <Text ff={DISPLAY} fz={30} fw={600}>
              {players[0]?.name ?? "Alice"} is picking…
            </Text>
            <Text c="boardBlue.1" size="sm">
              Continues in board / clue-loop
            </Text>
          </Stack>
        )}
        {mic !== "granted" && <MicCard mic={mic} onAsk={() => setMic("prompt")} />}
      </PhoneScreen>
    );
  } else {
    phone = (
      <PhoneScreen
        top={<PhoneTop />}
        buzzer={<Buzzer state="idle" />}
        hint="Try the buzzer. Nothing is sent until a clue is read."
      >
        <Stack mt={20} gap={2}>
          <Text ff={DISPLAY} fz={32} fw={500} lh={1}>
            You're in,
          </Text>
          <Text ff={DISPLAY} fz={54} fw={700} c="yellow.4" lh={1.1} truncate="end">
            {me?.name ?? myName}.
          </Text>
          <Text size="sm" c="boardBlue.1">
            Hosted by {hostName}. Look for your name on the TV.
          </Text>
        </Stack>
        <MicCard mic={mic} onAsk={() => setMic("prompt")} />
        {editingMe ? (
          <Group mt="auto" gap="xs" wrap="nowrap">
            <TextInput
              style={{ flex: 1 }}
              maxLength={20}
              value={myName}
              onChange={(e) => setMyName(e.currentTarget.value)}
              data-autofocus
            />
            <Button
              disabled={!myName.trim()}
              onClick={() => {
                rename("me", myName.trim());
                setEditingMe(false);
              }}
            >
              Save
            </Button>
          </Group>
        ) : (
          <Group mt="auto" grow gap="xs">
            <Button variant="light" onClick={() => setEditingMe(true)}>
              Edit name
            </Button>
            <Button
              variant="subtle"
              color="red"
              onClick={() => {
                remove("me");
                setPhoneView("home");
                setCode("");
              }}
            >
              Leave
            </Button>
          </Group>
        )}
      </PhoneScreen>
    );
  }
  const phoneOverlay =
    mic === "prompt" ? (
      <div
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 20,
          background: "rgba(0,0,0,.45)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            width: 270,
            background: "rgba(40,40,46,.97)",
            borderRadius: 14,
            overflow: "hidden",
            textAlign: "center",
            animation: "sg-pop 180ms",
          }}
        >
          <div style={{ padding: "18px 16px 14px" }}>
            <Text fw={700} size="sm" c="white">
              “{SITE}” Would Like to Access the Microphone
            </Text>
          </div>
          <div style={{ display: "flex", borderTop: "1px solid rgba(255,255,255,.15)" }}>
            <UnstyledButton style={{ flex: 1, padding: 11, color: "#0a84ff" }} onClick={() => setMic("blocked")}>
              Don't Allow
            </UnstyledButton>
            <UnstyledButton
              style={{
                flex: 1,
                padding: 11,
                color: "#0a84ff",
                fontWeight: 700,
                borderLeft: "1px solid rgba(255,255,255,.15)",
              }}
              onClick={() => setMic("granted")}
            >
              Allow
            </UnstyledButton>
          </div>
        </div>
      </div>
    ) : null;

  const W = s.w + BEZEL * 2 + 40 + PHONE.w + BEZEL * 2;
  const H = 28 + Math.max(s.h, PHONE.h) + BEZEL * 2;

  return (
    <MantineProvider theme={theme} defaultColorScheme="dark">
      <Kit />
      <Stack gap="md" pb={48}>
        <Alert color="yellow" title="PROTOTYPE — not production code" />
        <div>
          <Title order={2}>Host a game, join on a phone</Title>
          <Text c="dimmed" size="sm" maw={820}>
            Both devices are live and talk to each other. Host a game on the left, then type the code on Dana's phone.
            Use the controls to bring in other players and reach the error states.
          </Text>
        </div>
        <Group gap="sm">
          <SegmentedControl
            size="xs"
            value={size}
            onChange={(v) => setSize(v as HostSize)}
            data={Object.entries(HOST_SIZES).map(([value, x]) => ({ value, label: x.label }))}
          />
          <Button size="xs" variant="light" disabled={hostView !== "lobby"} onClick={arrive}>
            Players arrive
          </Button>
          <Button
            size="xs"
            variant="light"
            disabled={!players.some((p) => p.id === "b")}
            onClick={() => setOnline("b", !players.find((p) => p.id === "b")?.online)}
          >
            Bob drops / returns
          </Button>
          <Button
            size="xs"
            variant="light"
            disabled={hostView !== "lobby"}
            onClick={() => {
              const names = { c: "Carol", d: "Dev", e: "Eun-ji", f: "Farah", g: "Gus" };
              Object.entries(names).forEach(([id, name], i) => {
                t.later(() => add(id, name), 200 * i);
              });
            }}
          >
            Fill the room
          </Button>
          <Select
            size="xs"
            w={200}
            placeholder="Jump the host device to…"
            value={null}
            data={[
              { value: "lobby", label: "Lobby" },
              { value: "not-host", label: "Opened by someone else" },
              { value: "closed", label: "Room closed" },
            ]}
            onChange={(v) => v && setHostView(v as HostView)}
          />
          <Button size="xs" variant="subtle" onClick={reset}>
            Reset
          </Button>
        </Group>
        <Group gap="lg">
          <Switch
            size="xs"
            label="Next room create fails"
            checked={failCreate}
            onChange={(e) => setFailCreate(e.currentTarget.checked)}
          />
          <Switch
            size="xs"
            label="Next board build fails"
            checked={failBuild}
            onChange={(e) => setFailBuild(e.currentTarget.checked)}
          />
          <Switch
            size="xs"
            label="Phone browser can't do speech"
            checked={mic === "unsupported"}
            onChange={(e) => setMic(e.currentTarget.checked ? "unsupported" : "ask")}
          />
        </Group>
        <Fit width={W} height={H}>
          <div style={{ display: "flex", gap: 40, alignItems: "flex-start" }}>
            <div>
              <DeviceLabel>Host's iPhone, mirrored to the TV</DeviceLabel>
              <HostDevice size={size} stage={stage} column={column} overlay={overlay} />
            </div>
            <div style={{ position: "relative" }}>
              <DeviceLabel>Dana's phone</DeviceLabel>
              <div style={{ position: "relative" }}>
                <PhoneDevice>{phone}</PhoneDevice>
                <div
                  style={{
                    position: "absolute",
                    inset: BEZEL,
                    borderRadius: 50,
                    overflow: "hidden",
                    pointerEvents: phoneOverlay ? "auto" : "none",
                  }}
                >
                  {phoneOverlay}
                </div>
              </div>
            </div>
          </div>
        </Fit>
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

const CATS = ["Volcanoes", "Potpourri", "80s TV", "World Capitals", "Rhyme Time", "Opera"];

function HostHome({ failed, onHost }: { failed: boolean; onHost: () => void }) {
  const [code, setCode] = useState("");
  return (
    <Stage pad={22}>
      <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 28 }}>
        <div style={{ flex: 1.25, minWidth: 0 }}>
          <Wordmark size="17cqh" />
          <Text c="boardBlue.1" mt={8} style={{ fontSize: "5.5cqh" }}>
            The quiz show for your living room. Put this screen on the TV; everyone plays on their phone.
          </Text>
        </div>
        <Stack style={{ flex: 1, minWidth: 0 }} gap="sm">
          {failed && (
            <Alert color="red" variant="filled" p={8}>
              Couldn't create a room. Try again.
            </Alert>
          )}
          <GoldButton size="lg" fullWidth onClick={onHost}>
            Host a game
          </GoldButton>
          <Text size="xs" c="boardBlue.1" ta="center">
            or join one
          </Text>
          <Group gap={6} wrap="nowrap">
            <PinInput
              length={5}
              size="sm"
              type="alphanumeric"
              value={code}
              onChange={(v) => setCode(v.toUpperCase())}
              aria-label="Room code"
            />
            <Button size="sm" variant="light" disabled={code.length !== 5}>
              Join
            </Button>
          </Group>
        </Stack>
      </div>
    </Stage>
  );
}

function CodeTiles({ code }: { code: string }) {
  return (
    <section style={{ display: "flex", gap: "2cqw" }} aria-label={`Room code ${code.split("").join(" ")}`}>
      {code
        .split("")
        .map((ch, i) => ({ ch, id: `${i}-${ch}` }))
        .map(({ ch, id }) => (
          <div
            key={id}
            style={{
              width: "min(13cqw, 30cqh)",
              height: "min(17cqw, 38cqh)",
              borderRadius: 8,
              background: CELL,
              boxShadow: `${BEVEL}, 0 6px 18px rgba(0,0,0,.35)`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: DISPLAY,
              fontWeight: 700,
              fontSize: "min(12cqw, 28cqh)",
              color: GOLD,
              textShadow: "0 3px 0 rgba(0,0,0,.5)",
            }}
          >
            {ch}
          </div>
        ))}
    </section>
  );
}

function LobbyRow({ p }: { p: LobbyPlayer }) {
  return (
    <div
      style={{
        flex: "1 1 0",
        minHeight: 24,
        maxHeight: 40,
        borderRadius: 8,
        background: TILE,
        boxShadow: BEVEL,
        padding: "0 10px",
        display: "flex",
        alignItems: "center",
        gap: 8,
        opacity: p.online ? 1 : 0.45,
        animation: "sg-in 320ms ease-out",
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: 8,
          flexShrink: 0,
          background: p.online ? "var(--mantine-color-green-5)" : "transparent",
          border: p.online ? "none" : "1.5px solid #c9cdf7",
        }}
      />
      <span
        style={{
          flex: 1,
          minWidth: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          fontWeight: 700,
          fontSize: 14,
        }}
      >
        {p.name}
        {!p.online && <span style={{ fontWeight: 500, fontSize: 11, color: "#c9cdf7" }}> (reconnecting)</span>}
      </span>
      {p.host && (
        <span
          style={{
            fontSize: 9,
            fontWeight: 800,
            letterSpacing: ".08em",
            color: "#c9cdf7",
            border: "1px solid rgba(201,205,247,.45)",
            padding: "1px 4px",
            borderRadius: 3,
          }}
        >
          HOST
        </span>
      )}
    </div>
  );
}

function Shuffling() {
  return (
    <Stack align="center" justify="center" style={{ flex: 1 }} gap="4cqh">
      <div style={{ display: "flex", gap: "1.2cqw", perspective: 500 }}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            style={{
              width: "11cqw",
              height: "24cqh",
              borderRadius: 4,
              background: CELL,
              boxShadow: BEVEL,
              animation: `sg-flip 900ms ease-in-out ${i * 110}ms infinite`,
            }}
          />
        ))}
      </div>
      <Text ff={DISPLAY} fw={600} c="white" style={{ fontSize: "10cqh" }}>
        Shuffling a fresh board…
      </Text>
      <Text c="boardBlue.1" style={{ fontSize: "4.5cqh", marginTop: "-3cqh" }}>
        Only categories nobody here has seen
      </Text>
    </Stack>
  );
}

function MiniShuffle() {
  return (
    <div style={{ display: "flex", gap: 5, perspective: 300 }}>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          style={{
            width: 36,
            height: 48,
            borderRadius: 4,
            background: CELL,
            boxShadow: BEVEL,
            animation: `sg-flip 900ms ease-in-out ${i * 110}ms infinite`,
          }}
        />
      ))}
    </div>
  );
}

function MicCard({ mic, onAsk }: { mic: Mic; onAsk: () => void }) {
  const box = (children: ReactNode, tone: "info" | "ok" | "bad") => (
    <div
      style={{
        marginTop: 20,
        padding: 14,
        borderRadius: 14,
        background:
          tone === "bad" ? "rgba(240,62,62,.12)" : tone === "ok" ? "rgba(64,192,87,.10)" : "rgba(255,255,255,.05)",
        border: `1px solid ${tone === "bad" ? "rgba(240,62,62,.45)" : tone === "ok" ? "rgba(64,192,87,.35)" : "rgba(255,255,255,.1)"}`,
      }}
    >
      {children}
    </div>
  );
  if (mic === "granted")
    return box(
      <Group gap="sm" wrap="nowrap">
        <Meter color="var(--mantine-color-green-5)" h={18} />
        <div>
          <Text fw={700} size="sm">
            Microphone ready
          </Text>
          <Text size="xs" c="boardBlue.1">
            Say something: the bars should move.
          </Text>
        </div>
      </Group>,
      "ok",
    );
  if (mic === "blocked")
    return box(
      <Stack gap={4}>
        <Text fw={700} size="sm" c="red.3">
          Turn on the microphone to answer
        </Text>
        <Text size="xs" c="boardBlue.1">
          Settings › Safari › Microphone › Allow, then come back. You can still buzz, but a buzz without a microphone
          counts as no answer.
        </Text>
      </Stack>,
      "bad",
    );
  if (mic === "unsupported")
    return box(
      <Stack gap={4}>
        <Text fw={700} size="sm" c="red.3">
          This browser can't hear answers
        </Text>
        <Text size="xs" c="boardBlue.1">
          Try Chrome or Safari.
        </Text>
      </Stack>,
      "bad",
    );
  return box(
    <Stack gap="xs">
      <Text fw={700} size="sm">
        🎤 Allow the microphone so you can answer
      </Text>
      <Text size="xs" c="boardBlue.1">
        You'll say your answers out loud. Asking now means no pop-up mid-game.
      </Text>
      <Button variant="light" onClick={onAsk}>
        Allow microphone
      </Button>
    </Stack>,
    "info",
  );
}
