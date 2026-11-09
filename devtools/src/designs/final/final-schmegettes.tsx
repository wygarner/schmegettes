/** biome-ignore-all lint/correctness/noUnusedVariables: the design kit is inlined whole in every prototype */

import {
  Alert,
  Button,
  createTheme,
  Group,
  MantineProvider,
  SegmentedControl,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
  UnstyledButton,
} from "@mantine/core";
import { useElementSize } from "@mantine/hooks";
import { type ReactNode, useEffect, useState } from "react";

// PROTOTYPE — Final Schmegettes: title, category, secret wagers (masked for the host), typed answers,
// the reveal from lowest score to highest, and the no-finalist and one-finalist branches.

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

// ── Mock Final ──────────────────────────────────────────────────────────────────────────
type FP = "alice" | "bob" | "dana" | "wyatt";
const ORDER: FP[] = ["alice", "bob", "dana", "wyatt"];
const NAME: Record<FP, string> = { alice: "Alice", bob: "Bob", dana: "Dana", wyatt: "Wyatt" };
const CATEGORY = "Famous Islands";
const CLUE = "In 1927 an island called 'Child of' this volcano rose from the sea where it had blown itself apart";
const RESPONSE = "Krakatoa";
const ACCEPT = ["krakatoa", "krakatau", "anak krakatau"];

const SCENARIOS = {
  two: { label: "Two finalists", scores: { alice: 2200, bob: 400, dana: -400, wyatt: -200 } },
  host: { label: "Host is a finalist", scores: { alice: 2200, bob: 400, dana: -400, wyatt: 1000 } },
  one: { label: "One finalist", scores: { alice: 1800, bob: 0, dana: -400, wyatt: -200 } },
  none: { label: "Nobody in the black", scores: { alice: 0, bob: -600, dana: -400, wyatt: -200 } },
} satisfies Record<string, { label: string; scores: Record<FP, number> }>;
type Scenario = keyof typeof SCENARIOS;

// What the simulated finalists do.
const SIM: Record<FP, { wager: (score: number) => number; answer: string }> = {
  alice: { wager: () => 700, answer: "what is krakatau" },
  bob: { wager: (s) => s, answer: "krakatoa" },
  dana: { wager: () => 0, answer: "" },
  wyatt: { wager: (s) => Math.round(s / 2), answer: "what is java" },
};

type FPhase = "title" | "category" | "wager" | "clue" | "answer" | "reveal" | "response" | "scores" | "skip";
type Entry = { wager?: number; locked: boolean; draft: string; submitted: boolean };
const blank = (): Record<FP, Entry> => ({
  alice: { locked: false, draft: "", submitted: false },
  bob: { locked: false, draft: "", submitted: false },
  dana: { locked: false, draft: "", submitted: false },
  wyatt: { locked: false, draft: "", submitted: false },
});

function lev(a: string, b: string) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
/** Generous judging: "what is" optional, small typos are fine ("Krakatowa"). */
function judge(text: string) {
  const t = text
    .toLowerCase()
    .replace(/^(what|who|where)\s+(is|are|was|were)\s+/, "")
    .replace(/[^a-z ]/g, "")
    .trim();
  return t !== "" && ACCEPT.some((a) => lev(t, a) <= 2);
}

const T = { title: 3000, category: 3500, wager: 30000, answer: 30000, step: 2000, response: 4000, skip: 4000 };
const STEPS = 5; // name, response, verdict, wager, new score

export default function FinalSchmegettes() {
  const [size, setSize] = useState<HostSize>("844");
  const [scenario, setScenario] = useState<Scenario>("two");
  const [viewer, setViewer] = useState<FP>("bob");
  const [speed, setSpeed] = useState(1);
  const [hostKeys, setHostKeys] = useState<"blind" | "system">("blind");
  const [phase, setPhase] = useState<FPhase>("title");
  const [seq, setSeq] = useState(0);
  const [entries, setEntries] = useState(blank);
  const [reveal, setReveal] = useState({ idx: 0, step: 0 });

  const before = SCENARIOS[scenario].scores;
  const finalists = ORDER.filter((p) => before[p] > 0);
  const revealOrder = [...finalists].sort((a, b) => before[a] - before[b] || ORDER.indexOf(a) - ORDER.indexOf(b));
  const isSim = (p: FP) => p !== viewer && p !== "wyatt";
  const s = HOST_SIZES[size];

  const go = (p: FPhase) => {
    setPhase(p);
    setSeq((n) => n + 1);
  };
  const patch = (p: FP, e: Partial<Entry>) => setEntries((all) => ({ ...all, [p]: { ...all[p], ...e } }));

  const result = (p: FP) => {
    const e = entries[p];
    const answer = e.submitted ? e.draft.trim() : "";
    const correct = judge(answer);
    const wager = e.wager ?? 0;
    return { answer, correct, wager, after: before[p] + (correct ? wager : -wager) };
  };
  // A finalist's score changes on the reveal's last line.
  const shown = (p: FP) => {
    if (phase === "response" || phase === "scores") return finalists.includes(p) ? result(p).after : before[p];
    if (phase !== "reveal") return before[p];
    const i = revealOrder.indexOf(p);
    return i >= 0 && (i < reveal.idx || (i === reveal.idx && reveal.step >= 4)) ? result(p).after : before[p];
  };

  function restart(next: Scenario = scenario) {
    setScenario(next);
    setEntries(blank());
    setReveal({ idx: 0, step: 0 });
    go(ORDER.some((p) => SCENARIOS[next].scores[p] > 0) ? "title" : "skip");
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: the clock re-runs only when the phase changes (seq)
  useEffect(() => {
    const ids: number[] = [];
    const at = (ms: number, fn: () => void) => ids.push(window.setTimeout(fn, ms / speed));
    switch (phase) {
      case "title":
        at(T.title, () => go("category"));
        break;
      case "category":
        at(T.category, () => go("wager"));
        break;
      case "wager":
        for (const p of finalists)
          if (isSim(p))
            at(3000 + Math.random() * 6000, () => patch(p, { wager: SIM[p].wager(before[p]), locked: true }));
        at(T.wager, () => go("clue")); // an unlocked wager counts as $0
        break;
      case "clue":
        at(Math.min(14000, (CLUE.split(/\s+/).length / 2.5 + 1) * 1000), () => go("answer"));
        break;
      case "answer":
        for (const p of finalists)
          if (isSim(p)) {
            const text = SIM[p].answer;
            at(5000 + Math.random() * 9000, () => patch(p, { draft: text, submitted: true }));
          }
        at(T.answer, () => {
          // Time's up: whatever is in each field is submitted.
          setEntries(
            (all) =>
              Object.fromEntries(
                ORDER.map((p) => [p, { ...all[p], submitted: all[p].submitted || all[p].draft.trim() !== "" }]),
              ) as Record<FP, Entry>,
          );
          go("reveal");
        });
        break;
      case "reveal":
        at(reveal.step === 0 ? 1200 : T.step, () => {
          if (reveal.step < STEPS - 1) setReveal((r) => ({ ...r, step: r.step + 1 }));
          else if (reveal.idx < revealOrder.length - 1) setReveal((r) => ({ idx: r.idx + 1, step: 0 }));
          else return go("response");
          setSeq((n) => n + 1);
        });
        break;
      case "response":
        at(T.response, () => go("scores"));
        break;
      case "skip":
        at(T.skip, () => go("scores"));
        break;
    }
    return () => {
      for (const id of ids) clearTimeout(id);
    };
  }, [seq]);

  // Move on as soon as every finalist has locked in / submitted.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only entries and phase decide this
  useEffect(() => {
    if (phase === "wager" && finalists.every((p) => entries[p].locked)) go("clue");
    if (phase === "answer" && finalists.every((p) => entries[p].submitted)) go("reveal");
  }, [entries, phase]);

  const place = (p: FP) => 1 + ORDER.filter((q) => shown(q) > shown(p)).length;
  const ordinal = (n: number) => `${n}${n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th"}`;
  const topScore = Math.max(...ORDER.map(shown));

  // ── Host device ──
  const players: Player[] = ORDER.map((p) => ({ id: p, name: NAME[p], score: shown(p), host: p === "wyatt" }));
  const tags: Record<string, string> = {};
  for (const p of ORDER) {
    if (!finalists.includes(p)) tags[p] = "not in Final";
    else if (phase === "category" || phase === "wager") tags[p] = entries[p].locked ? "✓ locked" : "wagering…";
    else if (phase === "clue" || phase === "answer") tags[p] = entries[p].submitted ? "✓ submitted" : "writing…";
  }
  const hostIn = finalists.includes("wyatt");
  const header = (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        color: "#c9cdf7",
        fontWeight: 700,
        letterSpacing: ".12em",
        fontSize: "4.4cqh",
        textTransform: "uppercase",
        flexShrink: 0,
      }}
    >
      <span>Final Schmegettes · {CATEGORY}</span>
      {phase === "clue" && <Meter h={12} color="#c9cdf7" />}
    </div>
  );
  let stage: ReactNode;
  let hostOverlay: ReactNode = null;
  switch (phase) {
    case "title":
      stage = (
        <Stage>
          <Center>
            <Big text="Final" />
            <Big text="Schmegettes" />
          </Center>
        </Stage>
      );
      break;
    case "category":
    case "wager":
      stage = (
        <Stage>
          <Center>
            <Text c="#c9cdf7" fw={700} tt="uppercase" style={{ fontSize: "4.5cqh", letterSpacing: ".14em" }}>
              The Final Schmegettes category is
            </Text>
            <Text
              ff={DISPLAY}
              fw={700}
              c="white"
              tt="uppercase"
              lh={1}
              style={{
                fontSize: phase === "wager" && hostIn ? "12cqh" : "min(20cqh, 11cqw)",
                animation: "sg-pop 380ms",
              }}
            >
              {CATEGORY}
            </Text>
            {phase === "wager" && !hostIn && (
              <Text c="#c9cdf7" style={{ fontSize: "5cqh" }}>
                Finalists, lock in your wager on your phone.
              </Text>
            )}
          </Center>
          {phase === "wager" && hostIn && !entries.wyatt.locked && (
            <div style={{ marginBottom: 8 }}>
              <WagerPad
                layout="stage"
                masked
                min={0}
                max={before.wyatt}
                confirmLabel="Lock in"
                onConfirm={(n) => patch("wyatt", { wager: n, locked: true })}
              />
            </div>
          )}
          {phase === "wager" && <Bar ms={T.wager / speed} runKey={seq} />}
        </Stage>
      );
      break;
    case "clue":
    case "answer": {
      const typing = phase === "answer" || phase === "clue";
      const hostTyping = hostIn && typing && !entries.wyatt.submitted;
      stage = (
        <Stage>
          {header}
          <ClueText q={CLUE} small={hostTyping && hostKeys === "blind"} />
          {hostTyping && hostKeys === "blind" && (
            <BlindKeypad
              value={entries.wyatt.draft}
              onChange={(draft) => patch("wyatt", { draft })}
              onSubmit={() => patch("wyatt", { submitted: true })}
            />
          )}
          {phase === "answer" && <Bar ms={T.answer / speed} runKey={seq} />}
        </Stage>
      );
      if (hostTyping && hostKeys === "system") hostOverlay = <MirroredKeyboard />;
      break;
    }
    case "reveal": {
      const p = revealOrder[reveal.idx];
      const r = result(p);
      const line = (n: number, label: string, valueEl: ReactNode) =>
        reveal.step >= n && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "28cqw 1fr",
              alignItems: "baseline",
              animation: "sg-in 260ms ease-out",
            }}
          >
            <span
              style={{
                color: "#c9cdf7",
                fontWeight: 700,
                fontSize: "4.6cqh",
                textTransform: "uppercase",
                letterSpacing: ".12em",
                textAlign: "right",
                paddingRight: "3cqw",
              }}
            >
              {label}
            </span>
            {valueEl}
          </div>
        );
      stage = (
        <Stage>
          <Text
            ff={DISPLAY}
            fw={700}
            c="white"
            ta="center"
            tt="uppercase"
            style={{ fontSize: "9cqh", letterSpacing: ".04em" }}
          >
            {NAME[p]}{" "}
            <span style={{ color: before[p] < 0 ? "var(--mantine-color-red-4)" : GOLD }}>· {money(before[p])}</span>
          </Text>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: "3cqh" }}>
            {line(
              1,
              "Response",
              <span style={{ fontSize: "8cqh", fontStyle: "italic", color: "#fff" }}>{r.answer || "No answer"}</span>,
            )}
            {line(
              2,
              "",
              <span
                style={{
                  fontFamily: DISPLAY,
                  fontWeight: 700,
                  fontSize: "8cqh",
                  color: r.correct ? "var(--mantine-color-green-4)" : "var(--mantine-color-red-4)",
                }}
              >
                {r.correct ? "✓ Correct" : "✗ Incorrect"}
              </span>,
            )}
            {line(
              3,
              "Wager",
              <span style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: "9cqh", color: "#fff" }}>
                {money(r.wager)}
              </span>,
            )}
            {line(
              4,
              "Score",
              <span
                style={{
                  fontFamily: DISPLAY,
                  fontWeight: 700,
                  fontSize: "13cqh",
                  color: r.after < 0 ? "var(--mantine-color-red-4)" : GOLD,
                  animation: "sg-pop 320ms",
                }}
              >
                {money(r.after)}
              </span>,
            )}
          </div>
          <Text ta="center" c="#7f87e6" style={{ fontSize: "3.8cqh" }}>
            {reveal.idx + 1} of {revealOrder.length} · lowest score first
          </Text>
        </Stage>
      );
      break;
    }
    case "response":
      stage = (
        <Stage>
          {header}
          <Center>
            <Text c="#c9cdf7" fw={700} tt="uppercase" style={{ fontSize: "4.5cqh", letterSpacing: ".14em" }}>
              Correct response
            </Text>
            <Text ff={DISPLAY} fw={700} c="white" tt="uppercase" style={{ fontSize: "min(16cqh, 10cqw)" }}>
              {RESPONSE}
            </Text>
          </Center>
          <Bar ms={T.response / speed} runKey={seq} color="rgba(255,255,255,.35)" h={3} />
        </Stage>
      );
      break;
    case "skip":
      stage = (
        <Stage>
          <Center>
            <Text ff={DISPLAY} fw={600} c="white" style={{ fontSize: "10cqh" }}>
              Nobody's in the black
            </Text>
            <Text c="#c9cdf7" style={{ fontSize: "6cqh" }}>
              No Final Schmegettes this time.
            </Text>
          </Center>
        </Stage>
      );
      break;
    case "scores": {
      const ranked = [...ORDER].sort((a, b) => shown(b) - shown(a) || ORDER.indexOf(a) - ORDER.indexOf(b));
      stage = (
        <Stage>
          <Text
            ff={DISPLAY}
            fw={700}
            c="yellow.4"
            ta="center"
            tt="uppercase"
            style={{ fontSize: "8cqh", letterSpacing: ".06em" }}
          >
            Final scores
          </Text>
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              gap: "2.4cqh",
              padding: "0 6cqw",
            }}
          >
            {ranked.map((p, i) => (
              <div
                key={p}
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: "2cqw",
                  animation: `sg-in 300ms ease-out ${i * 120}ms both`,
                }}
              >
                <span style={{ width: "9cqw", color: "#a5abee", fontWeight: 700, fontSize: "5cqh" }}>
                  {ordinal(place(p))}
                </span>
                <span
                  style={{ flex: 1, fontWeight: 700, color: "#fff", fontSize: shown(p) === topScore ? "8cqh" : "6cqh" }}
                >
                  {NAME[p]} {shown(p) === topScore && "🏆"}
                </span>
                <span
                  style={{
                    fontFamily: DISPLAY,
                    fontWeight: 700,
                    fontSize: shown(p) === topScore ? "9cqh" : "6.5cqh",
                    color: shown(p) < 0 ? "var(--mantine-color-red-4)" : GOLD,
                  }}
                >
                  {money(shown(p))}
                </span>
              </div>
            ))}
          </div>
          <Text ta="center" c="#7f87e6" style={{ fontSize: "3.8cqh" }}>
            Feature 3 replaces this with the full scoreboard and Rematch: see results / scoreboard-and-history
          </Text>
        </Stage>
      );
      break;
    }
  }
  const column = (
    <>
      <Tiles
        players={players}
        tags={tags}
        dimIds={
          ["title", "skip", "scores", "response", "reveal"].includes(phase)
            ? []
            : ORDER.filter((p) => !finalists.includes(p))
        }
      />
      {hostIn && hostKeys === "system" && (phase === "clue" || phase === "answer") && !entries.wyatt.submitted && (
        <Group gap={4} wrap="nowrap">
          <TextInput
            size="xs"
            style={{ flex: 1 }}
            type="password"
            placeholder="Your answer"
            value={entries.wyatt.draft}
            onChange={(e) => patch("wyatt", { draft: e.currentTarget.value })}
            autoComplete="off"
          />
          <Button size="xs" disabled={!entries.wyatt.draft.trim()} onClick={() => patch("wyatt", { submitted: true })}>
            Submit
          </Button>
        </Group>
      )}
      <Buzzer state="idle" height={64} />
    </>
  );

  // ── Contestant phone ──
  const v = viewer;
  const vIn = finalists.includes(v);
  const e = entries[v];
  let body: ReactNode;
  let keyboard = false;
  const centered = (children: ReactNode) => (
    <Stack align="center" justify="center" ta="center" gap="xs" style={{ flex: 1 }}>
      {children}
    </Stack>
  );
  const headline = (t: ReactNode) => (
    <Text ff={DISPLAY} fw={600} fz={34} lh={1.1}>
      {t}
    </Text>
  );
  const sub = (t: ReactNode) => (
    <Text size="sm" c="boardBlue.1" maw={300}>
      {t}
    </Text>
  );
  if (phase === "skip")
    body = centered(
      <>
        {headline("Nobody's in the black")}
        {sub("No Final Schmegettes this time.")}
      </>,
    );
  else if (phase === "scores")
    body = centered(
      <>
        <Text c="boardBlue.1" fw={700} tt="uppercase" style={{ letterSpacing: ".14em" }}>
          You finished
        </Text>
        <Text ff={DISPLAY} fw={700} fz={84} lh={1} c="yellow.4">
          {ordinal(place(v))}
        </Text>
        <Text ff={DISPLAY} fw={600} fz={34} c={shown(v) < 0 ? "red.4" : "white"}>
          {money(shown(v))} {shown(v) === topScore && "🏆"}
        </Text>
      </>,
    );
  else if (!vIn)
    body = centered(
      <>
        {headline("You're not in Final")}
        {sub("Only players above $0 play Final Schmegettes. Watch the TV.")}
      </>,
    );
  else if (phase === "title") body = centered(<Big text="Final Schmegettes" phone />);
  else if (phase === "category" || phase === "wager")
    body = e.locked ? (
      centered(
        <>
          <Text c="green.4" fw={700}>
            ✓ Wager locked
          </Text>
          <Text ff={DISPLAY} fw={700} fz={64} c="yellow.4" lh={1}>
            {money(e.wager ?? 0)}
          </Text>
          {sub("Look at the TV. Nobody else can see this.")}
        </>,
      )
    ) : (
      <Stack gap="sm" mt={4}>
        <div style={{ textAlign: "center" }}>
          <Text c="boardBlue.1" size="xs" fw={700} tt="uppercase" style={{ letterSpacing: ".14em" }}>
            Final: {CATEGORY}
          </Text>
          <Text size="sm" c="boardBlue.1">
            Bet up to your whole score. It's secret.
          </Text>
        </div>
        <WagerPad
          min={0}
          max={before[v]}
          confirmLabel="Lock in"
          onConfirm={(n) => patch(v, { wager: n, locked: true })}
        />
        {phase === "wager" && <Bar ms={T.wager / speed} runKey={seq} h={4} />}
        <Text size="xs" c="boardBlue.1" ta="center">
          No wager in 30 s means $0.
        </Text>
      </Stack>
    );
  else if (phase === "clue" || phase === "answer") {
    if (e.submitted)
      body = centered(
        <>
          <Text c="green.4" fw={700}>
            ✓ Submitted
          </Text>
          <Text fz={26} fs="italic">
            “{e.draft}”
          </Text>
          {sub("Look at the TV.")}
        </>,
      );
    else {
      keyboard = true;
      body = (
        <Stack gap="sm" mt={8}>
          <Text ff={DISPLAY} fw={600} fz={28}>
            Type your answer
          </Text>
          {phase === "answer" ? (
            <Bar ms={T.answer / speed} runKey={seq} h={6} />
          ) : (
            <Text size="xs" c="boardBlue.1">
              The 30 s start when the clue has been read.
            </Text>
          )}
          <TextInput
            size="lg"
            data-autofocus
            maxLength={200}
            placeholder="what is…"
            value={e.draft}
            onChange={(ev) => patch(v, { draft: ev.currentTarget.value })}
            onKeyDown={(ev) => ev.key === "Enter" && e.draft.trim() && patch(v, { submitted: true })}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
          />
          <GoldButton size="lg" fullWidth disabled={!e.draft.trim()} onClick={() => patch(v, { submitted: true })}>
            Submit
          </GoldButton>
          <Text size="xs" c="boardBlue.1">
            Submitting is final. When time runs out, whatever is here is sent. Small typos are fine.
          </Text>
        </Stack>
      );
    }
  } else body = centered(headline("Look at the TV."));

  const W = s.w + BEZEL * 2 + 40 + PHONE.w + BEZEL * 2;
  const H = 28 + Math.max(s.h, PHONE.h) + BEZEL * 2;

  return (
    <MantineProvider theme={theme} defaultColorScheme="dark">
      <Kit />
      <Stack gap="md" pb={48}>
        <Alert color="yellow" title="PROTOTYPE — not production code" />
        <div>
          <Title order={2}>Final Schmegettes</Title>
          <Text c="dimmed" size="sm" maw={860}>
            Secret wagers, typed answers, and the reveal from lowest score to highest. You play {NAME[viewer]}'s phone
            {hostIn ? " and the host's screen" : ""}; the other finalists play on their own.
          </Text>
        </div>
        <Group gap="sm">
          <SegmentedControl
            size="xs"
            value={size}
            onChange={(x) => setSize(x as HostSize)}
            data={Object.entries(HOST_SIZES).map(([value, x]) => ({ value, label: x.label }))}
          />
          <Select
            size="xs"
            w={190}
            value={scenario}
            onChange={(x) => x && restart(x as Scenario)}
            data={Object.entries(SCENARIOS).map(([value, x]) => ({ value, label: x.label }))}
            allowDeselect={false}
          />
          <SegmentedControl
            size="xs"
            value={viewer}
            onChange={(x) => setViewer(x as FP)}
            data={(["alice", "bob", "dana"] as FP[]).map((p) => ({ value: p, label: `${NAME[p]}'s phone` }))}
          />
          <SegmentedControl
            size="xs"
            value={String(speed)}
            onChange={(x) => setSpeed(Number(x))}
            data={[
              { value: "1", label: "Real time" },
              { value: "3", label: "3× speed" },
            ]}
          />
          <Button size="xs" variant="light" onClick={() => restart()}>
            Restart Final
          </Button>
        </Group>
        {hostIn && (
          <Group gap="sm">
            <Text size="sm">Host's Final answer:</Text>
            <SegmentedControl
              size="xs"
              value={hostKeys}
              onChange={(x) => setHostKeys(x as "blind" | "system")}
              data={[
                { value: "blind", label: "Blind keypad on the stage (proposal)" },
                { value: "system", label: "iOS keyboard (as specced)" },
              ]}
            />
          </Group>
        )}
        <Fit width={W} height={H}>
          <div style={{ display: "flex", gap: 40, alignItems: "flex-start" }}>
            <div>
              <DeviceLabel>Host's iPhone, mirrored to the TV</DeviceLabel>
              <HostDevice size={size} stage={stage} column={column} overlay={hostOverlay} />
            </div>
            <div>
              <DeviceLabel>{NAME[viewer]}'s phone</DeviceLabel>
              <PhoneDevice>
                {keyboard ? (
                  <>
                    <PhoneScreen top={<PhoneTop score={before[v]} />}>{body}</PhoneScreen>
                    <PhoneKeyboard />
                  </>
                ) : (
                  <PhoneScreen top={<PhoneTop score={shown(v)} />} buzzer={<Buzzer state="idle" />}>
                    {body}
                  </PhoneScreen>
                )}
              </PhoneDevice>
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

function Center({ children }: { children: ReactNode }) {
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
        gap: "1.5cqh",
      }}
    >
      {children}
    </div>
  );
}

function Big({ text, phone }: { text: string; phone?: boolean }) {
  return (
    <span
      style={{
        display: "block",
        fontFamily: DISPLAY,
        fontWeight: 700,
        textTransform: "uppercase",
        color: GOLD,
        lineHeight: 1,
        fontSize: phone ? 48 : "min(24cqh, 13cqw)",
        textShadow: "0 4px 0 rgba(0,0,0,.45)",
        animation: "sg-pop 380ms ease-out",
      }}
    >
      {text}
    </span>
  );
}

function ClueText({ q, small }: { q: string; small?: boolean }) {
  const h = small ? 7 : 9.5;
  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: "0 3cqw",
      }}
    >
      <span
        style={{
          fontFamily: DISPLAY,
          fontWeight: 500,
          textTransform: "uppercase",
          color: "#fff",
          fontSize: `min(${h}cqh, ${h * 0.55}cqw)`,
          lineHeight: 1.18,
        }}
      >
        {q}
      </span>
    </div>
  );
}

/**
 * Proposal for the host's Final answer on the mirrored screen. The iOS keyboard is mirrored to the
 * TV and pops up each key as it's pressed. This keypad is drawn by the page instead: keys never
 * highlight, and the field shows dots, so the TV shows nothing but the answer's length.
 */
function BlindKeypad({
  value,
  onChange,
  onSubmit,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
}) {
  const keys = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
  const key = (label: string, onClick: () => void, span = 1) => (
    <UnstyledButton
      key={label}
      onClick={onClick}
      aria-label={label === "␣" ? "Space" : label}
      style={{
        gridColumn: `span ${span}`,
        height: "8.5cqh",
        minHeight: 22,
        borderRadius: 6,
        background: "rgba(255,255,255,.08)",
        color: "#fff",
        fontWeight: 700,
        fontSize: "4.4cqh",
      }}
    >
      {label}
    </UnstyledButton>
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 8 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <div
          style={{
            flex: 1,
            height: 30,
            borderRadius: 8,
            background: "rgba(0,0,0,.3)",
            border: "1px solid rgba(255,255,255,.15)",
            display: "flex",
            alignItems: "center",
            padding: "0 10px",
            color: GOLD,
            letterSpacing: ".2em",
            fontWeight: 800,
          }}
        >
          {value ? (
            "•".repeat(value.length)
          ) : (
            <span style={{ color: "#7f87e6", letterSpacing: 0, fontWeight: 500, fontSize: 13 }}>
              Wyatt, type your answer (hidden from the TV)
            </span>
          )}
        </div>
        <GoldButton size="sm" disabled={!value.trim()} onClick={onSubmit}>
          Submit
        </GoldButton>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(14, 1fr)", gap: 4 }}>
        {keys.map((k) => key(k, () => onChange(`${value}${k.toLowerCase()}`.slice(0, 200))))}
        {key("␣", () => onChange(`${value} `.slice(0, 200)))}
        {key("⌫", () => onChange(value.slice(0, -1)))}
      </div>
    </div>
  );
}

/** What the room would see with the specced design: the iOS keyboard, mirrored, with key pop-ups. */
function MirroredKeyboard() {
  const rows = ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"];
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        height: "50%",
        zIndex: 5,
        background: "rgba(44,44,50,.97)",
        padding: "8px 60px 22px",
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      {rows.map((row, i) => (
        <div
          key={row}
          style={{ display: "flex", gap: 5, justifyContent: "center", paddingLeft: i * 18, paddingRight: i * 18 }}
        >
          {row.split("").map((k) => (
            <div
              key={k}
              style={{
                position: "relative",
                flex: 1,
                maxWidth: 62,
                height: 34,
                borderRadius: 5,
                background: "#5a5a60",
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 15,
              }}
            >
              {k}
              {k === "K" && (
                <div
                  style={{
                    position: "absolute",
                    bottom: 26,
                    left: "50%",
                    marginLeft: -24,
                    width: 48,
                    height: 56,
                    borderRadius: 8,
                    background: "#76767c",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 28,
                    boxShadow: "0 4px 12px rgba(0,0,0,.5)",
                  }}
                >
                  K
                </div>
              )}
            </div>
          ))}
        </div>
      ))}
      <Text ta="center" size="xs" c="red.3" fw={700}>
        Mirrored to the TV: each key pops up as the host presses it, so the room can read the answer.
      </Text>
    </div>
  );
}

function PhoneKeyboard() {
  const rows = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];
  return (
    <div
      style={{
        flexShrink: 0,
        background: "rgba(44,44,50,.97)",
        margin: "0 0 -34px",
        padding: "8px 4px 40px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      {rows.map((row, i) => (
        <div key={row} style={{ display: "flex", gap: 6, justifyContent: "center", padding: `0 ${i * 16}px` }}>
          {row.split("").map((k) => (
            <div
              key={k}
              style={{
                flex: 1,
                maxWidth: 34,
                height: 42,
                borderRadius: 5,
                background: "#5a5a60",
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 20,
              }}
            >
              {k}
            </div>
          ))}
        </div>
      ))}
      <div style={{ display: "flex", gap: 6, padding: "0 4px" }}>
        <div style={{ flex: 1, height: 42, borderRadius: 5, background: "#3d3d42" }} />
        <div
          style={{
            flex: 4,
            height: 42,
            borderRadius: 5,
            background: "#5a5a60",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 14,
          }}
        >
          space
        </div>
        <div
          style={{
            flex: 1.4,
            height: 42,
            borderRadius: 5,
            background: "#0a84ff",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 14,
          }}
        >
          go
        </div>
      </div>
    </div>
  );
}
