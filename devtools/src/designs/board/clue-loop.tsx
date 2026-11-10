/** biome-ignore-all lint/correctness/noUnusedVariables: the design kit is inlined whole in every prototype */

import {
  Alert,
  Badge,
  Button,
  createTheme,
  Group,
  Loader,
  MantineProvider,
  Paper,
  SegmentedControl,
  Stack,
  Switch,
  Text,
  Title,
  UnstyledButton,
} from "@mantine/core";
import { useElementSize } from "@mantine/hooks";
import { type ReactNode, useEffect, useRef, useState } from "react";

// PROTOTYPE — The core loop, live: pick (tap + confirm, or say it), the clue read aloud, early-buzz
// lockout, buzzing, spoken answers, judging and reopen, the correct response, Daily Doubles, the
// Double Schmegettes interstitial, controller hand-off, disconnects and the host-device pause.

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

// ── Mock game ───────────────────────────────────────────────────────────────────────────
type Pid = "alice" | "bob" | "wyatt";
const ORDER: Pid[] = ["alice", "bob", "wyatt"];
const NAME: Record<Pid, string> = { alice: "Alice", bob: "Bob", wyatt: "Wyatt" };

type Clue = { q: string; a: string; wrong: string; dd?: boolean };
type Round = { name: string; cats: string[]; values: number[]; clues: Clue[][] };

const ROUNDS: Round[] = [
  {
    name: "Single",
    cats: ["Volcanoes", "Potpourri", "80s TV", "World Capitals", "Rhyme Time", "Opera"],
    values: [200, 400, 600, 800],
    clues: [
      [
        { q: "This volcano buried Pompeii in 79 AD", a: "Vesuvius", wrong: "Etna" },
        {
          q: "The largest active volcano on Earth by volume, it rises from Hawaii's Big Island",
          a: "Mauna Loa",
          wrong: "Kilauea",
        },
        {
          q: "Europe's tallest active volcano, it looms over the Sicilian city of Catania",
          a: "Etna",
          wrong: "Stromboli",
          dd: true,
        },
        { q: "Its 1883 eruption was heard nearly 3,000 miles away", a: "Krakatoa", wrong: "Tambora" },
      ],
      [
        { q: "A group of crows shares its name with this crime", a: "murder", wrong: "robbery" },
        {
          q: "The Rosetta Stone has been housed in this London museum since 1802",
          a: "the British Museum",
          wrong: "the Louvre",
        },
        { q: "Sold by weight, this costly spice is the dried stigmas of a crocus", a: "saffron", wrong: "turmeric" },
        {
          q: "Literally 'rotten pot' in French, it's a bowl of dried petals or a mixed bag",
          a: "potpourri",
          wrong: "medley",
        },
      ],
      [
        { q: "Sam Malone poured drinks at this Boston bar", a: "Cheers", wrong: "Frasier" },
        { q: "Michael Knight's crime-fighting partner was this talking car", a: "KITT", wrong: "Herbie" },
        {
          q: "B.A. Baracus refused to fly on this series about soldiers of fortune",
          a: "The A-Team",
          wrong: "Magnum, P.I.",
        },
        {
          q: "Crockett and Tubbs made pastel suits famous on this cop show",
          a: "Miami Vice",
          wrong: "Hill Street Blues",
        },
      ],
      [
        { q: "Canberra is the capital of this country", a: "Australia", wrong: "New Zealand" },
        {
          q: "Buda and Pest, on opposite banks of the Danube, merged in 1873 to form this capital",
          a: "Budapest",
          wrong: "Vienna",
        },
        { q: "At about 11,900 feet, it's the highest seat of government in the world", a: "La Paz", wrong: "Quito" },
        {
          q: "Kazakhstan's capital has had this name since 2022, after 3 years as Nur-Sultan",
          a: "Astana",
          wrong: "Almaty",
        },
      ],
      [
        { q: "An overweight feline", a: "fat cat", wrong: "big cat" },
        { q: "A pig of considerable size", a: "big pig", wrong: "huge hog" },
        { q: "A rodent's residence", a: "mouse house", wrong: "rat hole" },
        { q: "A melody that goes on and on", a: "long song", wrong: "endless tune" },
      ],
      [
        { q: "The 'Toreador Song' is a highlight of this Bizet opera", a: "Carmen", wrong: "Aida" },
        {
          q: "Mozart's opera about a seducer who is dragged down to hell",
          a: "Don Giovanni",
          wrong: "The Magic Flute",
        },
        { q: "Puccini's opera about poor young artists in Paris's Latin Quarter", a: "La Bohème", wrong: "Tosca" },
        { q: "Wagner's 4-opera cycle is called 'The Ring of' these", a: "the Nibelung", wrong: "the Valkyries" },
      ],
    ],
  },
  {
    name: "Double Schmegettes",
    cats: ["Space Race", "Breakfast", "Mythology", "Words From French", "Body Parts", "Board Games"],
    values: [400, 800, 1200, 1600],
    clues: [
      [
        { q: "Launched in 1957, it was the first artificial satellite", a: "Sputnik", wrong: "Explorer 1" },
        { q: "In 1961 he became the first human in space", a: "Yuri Gagarin", wrong: "Alan Shepard" },
        { q: "Apollo 11's command module pilot, he stayed in lunar orbit", a: "Michael Collins", wrong: "Buzz Aldrin" },
        { q: "In 1965 this cosmonaut made the first spacewalk", a: "Alexei Leonov", wrong: "Valentina Tereshkova" },
      ],
      [
        { q: "Ham, a poached egg and hollandaise on an English muffin", a: "eggs Benedict", wrong: "eggs Florentine" },
        {
          q: "Swiss doctor Maximilian Bircher-Benner created this oat dish around 1900",
          a: "muesli",
          wrong: "granola",
        },
        { q: "Shakshuka is eggs poached in a spiced sauce of these", a: "tomatoes", wrong: "peppers" },
        { q: "A spurtle is a Scottish stick for stirring this", a: "porridge", wrong: "haggis" },
      ],
      [
        { q: "Norse god of thunder who carries the hammer Mjölnir", a: "Thor", wrong: "Odin" },
        { q: "He flew too close to the sun on wings of feathers and wax", a: "Icarus", wrong: "Daedalus" },
        { q: "The Egyptian god of embalming, shown with a jackal's head", a: "Anubis", wrong: "Horus", dd: true },
        { q: "This 3-headed dog guards the gates of the underworld", a: "Cerberus", wrong: "Orthrus" },
      ],
      [
        { q: "A ballet dancer's full turn on one foot", a: "pirouette", wrong: "plié" },
        { q: "Literally 'stroke of state', it's a sudden seizure of power", a: "coup d'état", wrong: "putsch" },
        { q: "The feeling that you've lived this exact moment before", a: "déjà vu", wrong: "ennui" },
        { q: "Literally 'false step', it's a social blunder", a: "faux pas", wrong: "gaffe" },
      ],
      [
        { q: "By area, it's the body's largest organ", a: "skin", wrong: "liver" },
        { q: "The patella is better known as this", a: "kneecap", wrong: "shin bone" },
        { q: "Shaped like a stirrup, it's the smallest bone in the body", a: "stapes", wrong: "anvil" },
        { q: "The Adam's apple is formed by this cartilage of the larynx", a: "thyroid cartilage", wrong: "cricoid" },
      ],
      [
        { q: "In this game you can buy Boardwalk and Park Place", a: "Monopoly", wrong: "Life" },
        { q: "A game of this ends in checkmate or a draw", a: "chess", wrong: "checkers", dd: true },
        { q: "This ancient game of black and white stones is played on a 19 × 19 grid", a: "Go", wrong: "Othello" },
        { q: "Players fill a 15 × 15 grid with lettered tiles in this word game", a: "Scrabble", wrong: "Boggle" },
      ],
    ],
  },
];

type Phase =
  | "board"
  | "dd_reveal"
  | "dd_wager"
  | "dd_wagered"
  | "reading"
  | "open"
  | "answering"
  | "judged"
  | "response"
  | "interstitial"
  | "end";
type Verdict = { who: Pid; correct: boolean; said: string; delta: number };
type G = {
  round: 0 | 1;
  done: boolean[][];
  scores: Record<Pid, number>;
  control: Pid;
  phase: Phase;
  seq: number;
  pick?: { c: number; r: number };
  wager?: number;
  tried: Pid[];
  answerer?: Pid;
  verdict?: Verdict;
  ended: boolean; // the clue ended on a judged answer
};

const emptyDone = () => Array.from({ length: 6 }, () => [false, false, false, false]);
const START: G = {
  round: 0,
  done: emptyDone().map((col, c) => col.map((_, r) => (r === 0 && [1, 2, 3, 5].includes(c)) || (c === 4 && r <= 1))),
  scores: { alice: 1200, bob: 400, wyatt: -200 },
  control: "alice",
  phase: "board",
  seq: 0,
  tried: [],
  ended: false,
};

// Timing from the gameplay and wagers interaction designs (ms).
const T = {
  readMax: 14000,
  open: 9000,
  answer: 9000,
  judged: 1800,
  response: 6000,
  ddReveal: 2000,
  ddWager: 30000,
  ddWagered: 2000,
  inter: 3000,
  handoff: 10000,
};

const readText = (g: G) => {
  if (!g.pick) return "";
  const R = ROUNDS[g.round];
  const clue = R.clues[g.pick.c][g.pick.r];
  const intro = clue.dd
    ? `For ${(g.wager ?? 0).toLocaleString("en-US")}, here's the clue.`
    : `Here's ${R.cats[g.pick.c]} for ${R.values[g.pick.r]}.`;
  return `${intro} ${clue.q}`;
};
const readMs = (g: G) => Math.min(T.readMax, (readText(g).split(/\s+/).length / 2.5 + 1) * 1000);

function applyJudge(prev: G, p: Pid, correct: boolean, said: string): G {
  const amt = prev.wager ?? ROUNDS[prev.round].values[prev.pick?.r ?? 0];
  const delta = correct ? amt : -amt;
  return {
    ...prev,
    scores: { ...prev.scores, [p]: prev.scores[p] + delta },
    tried: [...prev.tried, p],
    verdict: { who: p, correct, said, delta },
    control: correct ? p : prev.control,
    phase: "judged",
    seq: prev.seq + 1,
  };
}

const available = (g: G) => g.done.flatMap((col, c) => col.flatMap((d, r) => (d ? [] : [[c, r] as [number, number]])));

export default function ClueLoop() {
  const [size, setSize] = useState<HostSize>("844");
  const [viewer, setViewer] = useState<"alice" | "bob">("alice");
  const [autoplay, setAutoplay] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [online, setOnline] = useState<Record<Pid, boolean>>({ alice: true, bob: true, wyatt: true });
  const [micOff, setMicOff] = useState<Record<Pid, boolean>>({ alice: false, bob: false, wyatt: false });
  const [paused, setPaused] = useState(false);
  const [g, setG] = useState<G>(START);
  const [early, setEarly] = useState<Pid[]>([]);
  const [transcript, setTranscript] = useState("");
  const [say, setSay] = useState<"right" | "wrong" | "silent" | null>(null);
  const [confirm, setConfirm] = useState<{ who: Pid; c: number; r: number } | null>(null);
  const [voice, setVoice] = useState<{ who: Pid; listening: boolean; error?: string } | null>(null);

  const R = ROUNDS[g.round];
  const clue = g.pick ? R.clues[g.pick.c][g.pick.r] : undefined;
  const cat = g.pick ? R.cats[g.pick.c] : "";
  const value = g.pick ? R.values[g.pick.r] : 0;
  const dd = !!clue?.dd;
  const ddMax = Math.max(g.scores[g.control], R.values[3]);
  const isSim = (p: Pid) => autoplay && p !== viewer && p !== "wyatt";
  const s = HOST_SIZES[size];

  const live = useRef({ g, online, early, speed });
  live.current = { g, online, early, speed };

  const go = (patch: Partial<G>) => setG((prev) => ({ ...prev, ...patch, seq: prev.seq + 1 }));

  function pick(c: number, r: number) {
    setConfirm(null);
    setVoice(null);
    setSay(null);
    setTranscript("");
    setG((prev) =>
      prev.phase !== "board" || prev.done[c][r]
        ? prev
        : {
            ...prev,
            pick: { c, r },
            tried: [],
            answerer: undefined,
            verdict: undefined,
            ended: false,
            wager: undefined,
            phase: ROUNDS[prev.round].clues[c][r].dd ? "dd_reveal" : "reading",
            seq: prev.seq + 1,
          },
    );
  }

  function buzz(p: Pid) {
    const { g, online, early } = live.current;
    // On the board, the controller's buzzer starts (or cancels) a spoken pick.
    if (g.phase === "board") {
      if (g.control === p && online[p])
        setVoice((v) => (v?.who === p && v.listening ? null : { who: p, listening: true }));
      return;
    }
    const isDD = g.pick && ROUNDS[g.round].clues[g.pick.c][g.pick.r].dd;
    if (!online[p] || isDD || g.tried.includes(p)) return;
    if (g.phase === "reading") {
      setEarly((e) => [...e, p]);
      window.setTimeout(() => setEarly((e) => e.filter((x) => x !== p)), 250);
      return;
    }
    if (g.phase !== "open" || early.includes(p)) return;
    setSay(null);
    setTranscript("");
    setG((prev) =>
      prev.phase === "open" && !prev.tried.includes(p)
        ? { ...prev, phase: "answering", answerer: p, seq: prev.seq + 1 }
        : prev,
    );
  }

  const judge = (p: Pid, correct: boolean, said: string) =>
    setG((prev) => (prev.phase === "answering" && prev.answerer === p ? applyJudge(prev, p, correct, said) : prev));

  const wagerDD = (n: number) =>
    setG((prev) => (prev.phase === "dd_wager" ? { ...prev, wager: n, phase: "dd_wagered", seq: prev.seq + 1 } : prev));

  function finishClue() {
    setG((prev) => {
      const done = prev.done.map((col, c) => col.map((d, r) => d || (c === prev.pick?.c && r === prev.pick?.r)));
      const all = done.every((col) => col.every(Boolean));
      return { ...prev, done, phase: all ? (prev.round === 0 ? "interstitial" : "end") : "board", seq: prev.seq + 1 };
    });
  }

  // The game clock: each phase schedules what comes next. Pausing clears every timer.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the clock re-runs only when the phase changes (seq)
  useEffect(() => {
    if (paused) return;
    const ids: number[] = [];
    const at = (ms: number, fn: () => void) => ids.push(window.setTimeout(fn, ms / speed));
    switch (g.phase) {
      case "board":
        if (isSim(g.control) && online[g.control])
          at(2600, () => {
            const open = available(g);
            const [c, r] = open[Math.floor(Math.random() * open.length)];
            pick(c, r);
          });
        break;
      case "dd_reveal":
        at(T.ddReveal, () => go({ phase: "dd_wager" }));
        break;
      case "dd_wager":
        if (isSim(g.control)) at(2600, () => wagerDD(Math.max(5, Math.round((Math.random() * ddMax) / 100) * 100)));
        at(T.ddWager, () => wagerDD(5));
        break;
      case "dd_wagered":
        at(T.ddWagered, () => go({ phase: "reading" }));
        break;
      case "reading":
        at(readMs(g), () => go(dd ? { phase: "answering", answerer: g.control } : { phase: "open" }));
        break;
      case "open":
        for (const p of ORDER)
          if (isSim(p) && online[p] && !g.tried.includes(p) && Math.random() < 0.7)
            at(700 + Math.random() * 2600, () => buzz(p));
        at(T.open, () => go({ phase: "response", ended: false }));
        break;
      case "answering": {
        const p = g.answerer as Pid;
        if (micOff[p]) {
          at(900, () => judge(p, false, ""));
          break;
        }
        const kind = say ?? (isSim(p) ? (Math.random() < 0.55 ? "right" : "wrong") : null);
        at(T.answer, () => judge(p, false, ""));
        if (!kind) break;
        if (kind === "silent") {
          judge(p, false, "");
          break;
        }
        const text = kind === "right" ? `what is ${clue?.a}` : (clue?.wrong ?? "");
        at(say ? 0 : 1300, () => {
          let i = 0;
          const id = window.setInterval(() => {
            i = Math.min(text.length, i + 2);
            setTranscript(text.slice(0, i));
            if (i >= text.length) {
              window.clearInterval(id);
              at(600, () => judge(p, kind === "right", text));
            }
          }, 45);
          ids.push(id);
        });
        break;
      }
      case "judged":
        at(T.judged, () => {
          const { g: now, online: on } = live.current;
          if (now.verdict?.correct || dd) go({ phase: "response", ended: true });
          else
            go(
              ORDER.some((p) => !now.tried.includes(p) && on[p])
                ? { phase: "open" }
                : { phase: "response", ended: true },
            );
        });
        break;
      case "response":
        at(T.response, finishClue);
        break;
      case "interstitial":
        at(T.inter, () =>
          setG((prev) => ({
            ...prev,
            round: 1,
            done: emptyDone(),
            control: ORDER.reduce((a, b) => (prev.scores[b] < prev.scores[a] ? b : a)),
            pick: undefined,
            phase: "board",
            seq: prev.seq + 1,
          })),
        );
        break;
    }
    return () => {
      for (const id of ids) {
        clearTimeout(id);
        clearInterval(id);
      }
    };
  }, [g.seq, paused, say]);

  // Controller gone for 10 s on the board: control passes to the next connected contestant.
  useEffect(() => {
    if (g.phase !== "board" || online[g.control] || paused) return;
    const i = ORDER.indexOf(g.control);
    const next = [...ORDER.slice(i + 1), ...ORDER.slice(0, i)].find((p) => online[p]);
    if (!next) return;
    const id = window.setTimeout(
      () => setG((prev) => (prev.phase === "board" ? { ...prev, control: next, seq: prev.seq + 1 } : prev)),
      T.handoff / speed,
    );
    return () => clearTimeout(id);
  }, [g.phase, g.control, online, paused, speed]);

  // A pick dialog or voice pick closes when the board goes away or control moves.
  useEffect(() => {
    if (confirm && (g.phase !== "board" || g.control !== confirm.who)) setConfirm(null);
    if (voice && (g.phase !== "board" || g.control !== voice.who)) setVoice(null);
  }, [g.phase, g.control, confirm, voice]);

  // Space bar buzzes for the host.
  const buzzRef = useRef(buzz);
  buzzRef.current = buzz;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space" || (e.target as HTMLElement).closest("input, textarea, button")) return;
      e.preventDefault();
      buzzRef.current("wyatt");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function toggleOnline(p: Pid) {
    const now = !online[p];
    setOnline((o) => ({ ...o, [p]: now }));
    if (now) return;
    setG((prev) => {
      if (prev.phase !== "answering" || prev.answerer !== p) return prev;
      if (dd) return applyJudge(prev, p, false, ""); // no reopen on a Daily Double: −wager
      const left = ORDER.some((x) => x !== p && !prev.tried.includes(x) && online[x]);
      return {
        ...prev,
        tried: [...prev.tried, p],
        answerer: undefined,
        phase: left ? "open" : "response",
        ended: false,
        seq: prev.seq + 1,
      };
    });
  }

  function togglePause() {
    if (!paused) return setPaused(true);
    setPaused(false);
    // Back from a pause mid-clue: read it again from the start; buzzing reopens for those who haven't tried.
    setG((prev) =>
      ["reading", "open", "answering"].includes(prev.phase)
        ? { ...prev, phase: "reading", answerer: undefined, seq: prev.seq + 1 }
        : { ...prev, seq: prev.seq + 1 },
    );
  }

  function voiceSays(kind: "ok" | "played" | "mumble") {
    if (!voice) return;
    if (kind === "ok") {
      const [c, r] = available(g)[available(g).length - 1];
      return pick(c, r);
    }
    setVoice({
      who: voice.who,
      listening: false,
      error: kind === "played" ? "That one's already been played." : "Didn't catch the category.",
    });
  }

  function buzzerFor(p: Pid): BuzzerState {
    if (paused || !online[p]) return "idle";
    if (g.phase === "board" && g.control === p) return voice?.who === p && voice.listening ? "listening" : "pick";
    if (early.includes(p)) return "early";
    if (g.phase === "answering" && g.answerer === p) return "answering";
    if (["reading", "open", "answering", "judged"].includes(g.phase) && g.tried.includes(p)) return "locked";
    if (dd) return "idle";
    if (g.phase === "reading") return "dim";
    if (g.phase === "open") return "lit";
    return "idle";
  }

  const reset = () => {
    setG({ ...START, seq: g.seq + 1 });
    setPaused(false);
    setOnline({ alice: true, bob: true, wyatt: true });
    setConfirm(null);
    setVoice(null);
    setSay(null);
  };

  // ── Host device (TV) ──
  const players: Player[] = ORDER.map((p) => ({
    id: p,
    name: NAME[p],
    score: g.scores[p],
    host: p === "wyatt",
    online: online[p],
  }));
  const header = (
    <ClueHeader
      left={`${cat} · ${dd ? (g.wager !== undefined ? `DD ${money(g.wager)}` : "Daily Double") : money(value)}`}
      speaking={g.phase === "reading" && !paused}
    />
  );
  let stage: ReactNode;
  switch (g.phase) {
    case "board":
      stage = (
        <Board
          cats={R.cats}
          cells={g.done.map((col) => col.map((done, r) => ({ value: R.values[r], done })))}
          hostW={s.w}
          onPick={g.control === "wyatt" ? (c: number, r: number) => setConfirm({ who: "wyatt", c, r }) : undefined}
        />
      );
      break;
    case "dd_reveal":
      stage = (
        <Stage>
          <Center>
            <Text c="#c9cdf7" fw={700} tt="uppercase" style={{ fontSize: "5cqh", letterSpacing: ".12em" }}>
              {cat}
            </Text>
            <Big text="Daily Double" />
          </Center>
        </Stage>
      );
      break;
    case "dd_wager":
      stage = (
        <Stage>
          {header}
          {g.control === "wyatt" ? (
            <div style={{ flex: 1, minHeight: 0, display: "flex", alignItems: "center" }}>
              <div style={{ width: "100%" }}>
                <WagerPad layout="stage" min={5} max={ddMax} confirmLabel="Wager" onConfirm={wagerDD} />
              </div>
            </div>
          ) : (
            <Center>
              <Text ff={DISPLAY} fw={600} c="white" style={{ fontSize: "11cqh" }}>
                {NAME[g.control]} is wagering…
              </Text>
              <Text ff={DISPLAY} fw={700} c="yellow.4" style={{ fontSize: "8cqh" }}>
                {money(5)} – {money(ddMax)}
              </Text>
            </Center>
          )}
          <Bar ms={T.ddWager / speed} runKey={g.seq} paused={paused} />
        </Stage>
      );
      break;
    case "dd_wagered":
      stage = (
        <Stage>
          {header}
          <Center>
            <Text ff={DISPLAY} fw={600} c="white" style={{ fontSize: "10cqh" }}>
              {NAME[g.control]} wagers
            </Text>
            <Big text={money(g.wager ?? 0)} />
          </Center>
        </Stage>
      );
      break;
    case "reading":
    case "open":
    case "answering":
    case "judged": {
      const v = g.verdict;
      stage = (
        <Stage lit={g.phase === "open" && !paused}>
          {header}
          <ClueText q={clue?.q ?? ""} />
          {g.phase === "open" && (
            <>
              {v && !v.correct && <VerdictLine v={v} small />}
              <Bar ms={T.open / speed} runKey={g.seq} paused={paused} />
            </>
          )}
          {g.phase === "answering" && g.answerer && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, minHeight: "12cqh" }}>
              <span
                style={{
                  background: GOLD,
                  color: INK,
                  fontWeight: 800,
                  fontSize: "4.4cqh",
                  padding: "2px 8px",
                  borderRadius: 4,
                  flexShrink: 0,
                }}
              >
                {NAME[g.answerer]}
              </span>
              <Meter h={18} />
              <span
                style={{
                  fontStyle: "italic",
                  fontSize: "6cqh",
                  color: "#fff",
                  overflow: "hidden",
                  whiteSpace: "nowrap",
                  textOverflow: "ellipsis",
                }}
              >
                {micOff[g.answerer] ? (
                  "No microphone"
                ) : transcript ? (
                  `“${transcript}”`
                ) : (
                  <span style={{ color: "#7f87e6" }}>listening…</span>
                )}
              </span>
            </div>
          )}
          {g.phase === "judged" && v && <VerdictLine v={v} />}
        </Stage>
      );
      break;
    }
    case "response":
      stage = (
        <Stage>
          {header}
          <Center>
            {g.ended && g.verdict && <VerdictLine v={g.verdict} />}
            <Text c="#c9cdf7" fw={700} tt="uppercase" mt="3cqh" style={{ fontSize: "4.5cqh", letterSpacing: ".14em" }}>
              Correct response
            </Text>
            <Text
              ff={DISPLAY}
              fw={700}
              c="white"
              tt="uppercase"
              lh={1.05}
              style={{ fontSize: "min(15cqh, 9cqw)", textShadow: "0 3px 0 rgba(0,0,0,.4)" }}
            >
              {clue?.a}
            </Text>
          </Center>
          <Bar ms={T.response / speed} runKey={g.seq} paused={paused} color="rgba(255,255,255,.35)" h={3} />
        </Stage>
      );
      break;
    case "interstitial":
      stage = (
        <Stage>
          <Center>
            <Big text="Double" />
            <Big text="Schmegettes!" />
          </Center>
        </Stage>
      );
      break;
    case "end":
      stage = (
        <Stage>
          <Center>
            <Text ff={DISPLAY} fw={600} c="white" style={{ fontSize: "10cqh" }}>
              The Double board is done
            </Text>
            <Text c="#c9cdf7" style={{ fontSize: "5cqh" }}>
              Final Schmegettes is next: see final / final-schmegettes
            </Text>
          </Center>
        </Stage>
      );
      break;
  }
  const hostVoice = voice?.who === "wyatt";
  const column = (
    <>
      <Tiles
        players={players}
        controlId={g.control}
        tags={g.phase === "dd_wager" ? { [g.control]: "WAGERING" } : undefined}
        deltas={
          g.phase === "judged" && g.verdict ? { [g.verdict.who]: { amount: g.verdict.delta, key: g.seq } } : undefined
        }
      />
      {g.phase === "board" && hostVoice && voice.error && (
        <Text size="10px" c="red.3" ta="center" style={{ flexShrink: 0 }}>
          {voice.error}
        </Text>
      )}
      <Buzzer state={buzzerFor("wyatt")} onBuzz={() => buzz("wyatt")} height={64} />
    </>
  );
  const hostOverlay =
    confirm?.who === "wyatt" ? (
      <Sheet onClose={() => setConfirm(null)}>
        <PickConfirm
          cat={R.cats[confirm.c]}
          value={R.values[confirm.r]}
          onCancel={() => setConfirm(null)}
          onPick={() => pick(confirm.c, confirm.r)}
        />
      </Sheet>
    ) : null;
  const stageWithVeil = (
    <div style={{ position: "relative", flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      {stage}
      {paused && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: 12,
            background: "rgba(3,4,28,.82)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
          }}
        >
          <Loader color="yellow.4" size="sm" />
          <Text ff={DISPLAY} fz={28} fw={600}>
            Paused
          </Text>
          <Text size="sm" c="boardBlue.1">
            Reconnecting to the game…
          </Text>
        </div>
      )}
    </div>
  );

  // ── Contestant phone ──
  const v = viewer;
  const mine = g.control === v;
  const other = NAME[g.control];
  let body: ReactNode;
  let showScore = true;
  const picking = !paused && g.phase === "board" && mine && online[v];
  const phoneHint = picking
    ? voice?.who === v && voice.listening
      ? "Listening… press again to cancel"
      : "Tap a clue, or press and say it"
    : undefined;
  const centered = (children: ReactNode) => (
    <Stack align="center" justify="center" ta="center" gap="xs" style={{ flex: 1 }}>
      {children}
    </Stack>
  );
  const headline = (text: ReactNode, color = "white") => (
    <Text ff={DISPLAY} fw={600} fz={34} lh={1.1} c={color}>
      {text}
    </Text>
  );
  const sub = (text: ReactNode) => (
    <Text size="sm" c="boardBlue.1" maw={300}>
      {text}
    </Text>
  );
  const micWarning = micOff[v] && (
    <Text
      size="sm"
      fw={600}
      c="red.3"
      p="xs"
      style={{ border: "1px solid rgba(240,62,62,.45)", borderRadius: 10, background: "rgba(240,62,62,.1)" }}
    >
      Your microphone is off. If you buzz, it counts as no answer.
    </Text>
  );
  if (paused) {
    body = centered(
      <>
        {headline("Paused")}
        {sub("The host's screen lost its connection. The game picks up where it left off.")}
      </>,
    );
  } else
    switch (g.phase) {
      case "board":
        if (mine) {
          showScore = false;
          const myVoice = voice?.who === v ? voice : null;
          body = (
            <Stack gap="md" mt={6}>
              <Board
                phone
                cats={R.cats}
                cells={g.done.map((col) => col.map((done, r) => ({ value: R.values[r], done })))}
                onPick={(c, r) => setConfirm({ who: v, c, r })}
              />
              {myVoice?.listening && (
                <div
                  style={{
                    padding: 14,
                    borderRadius: 16,
                    background: "rgba(64,192,87,.10)",
                    border: "1px solid rgba(64,192,87,.4)",
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <Meter h={26} color="var(--mantine-color-green-5)" />
                  <div style={{ flex: 1 }}>
                    <Text fw={700}>Listening…</Text>
                    <Text size="xs" c="boardBlue.1">
                      Say a category and value, like “Opera for 600”
                    </Text>
                  </div>
                </div>
              )}
              {myVoice?.error && (
                <Text c="red.3" fw={600} ta="center" size="sm">
                  {myVoice.error} Press the buzzer to try again, or tap a clue.
                </Text>
              )}
              {micWarning}
            </Stack>
          );
        } else
          body = centered(
            <>
              {headline(online[g.control] ? `${other} is picking…` : `${other} is reconnecting…`)}
              {sub("Look at the TV.")}
              {micWarning}
            </>,
          );
        break;
      case "dd_reveal":
        body = centered(
          mine ? (
            <Big text="Daily Double!" phone />
          ) : (
            <>
              {headline(`${other} found a Daily Double`)}
              {sub("Look at the TV.")}
            </>
          ),
        );
        break;
      case "dd_wager":
        body = mine ? (
          <Stack gap="sm" mt={4}>
            <div style={{ textAlign: "center" }}>
              <Text ff={DISPLAY} fw={700} c="yellow.4" fz={24} tt="uppercase">
                Daily Double!
              </Text>
              <Text fw={700}>{cat}</Text>
            </div>
            <WagerPad min={5} max={ddMax} confirmLabel="Wager" onConfirm={wagerDD} />
            <Bar ms={T.ddWager / speed} runKey={g.seq} paused={paused} h={4} />
            <Text size="xs" c="boardBlue.1" ta="center">
              No wager in 30 s means {money(5)}.
            </Text>
          </Stack>
        ) : (
          centered(
            <>
              {headline(`${other} is wagering…`)}
              {sub("Daily Double. Look at the TV.")}
            </>,
          )
        );
        break;
      case "dd_wagered":
        body = centered(
          <>
            {headline(mine ? "You wagered" : `${other} wagers`)}
            <Big text={money(g.wager ?? 0)} phone />
          </>,
        );
        break;
      case "reading":
        body = centered(
          dd ? (
            mine ? (
              <>
                {headline("Listen…")}
                {sub("You'll answer when the clue ends. Nobody else can buzz.")}
                {micWarning}
              </>
            ) : (
              <>
                {headline(`${other} is answering a Daily Double`)}
                {sub("Look at the TV.")}
              </>
            )
          ) : (
            <>
              <Text fz={44}>🔊</Text>
              {headline("Listen…")}
              {sub(
                g.tried.includes(v)
                  ? "You've answered this one."
                  : "Buzz when it lights up. Too early locks you out for a moment.",
              )}
              {micWarning}
            </>
          ),
        );
        break;
      case "open":
        body = centered(
          g.tried.includes(v) ? (
            <>
              {headline("Others can buzz now")}
              {sub("You've answered this one.")}
            </>
          ) : (
            <>
              <Text ff={DISPLAY} fw={700} fz={64} lh={1} c="yellow.4" style={{ animation: "sg-pop 250ms" }}>
                BUZZ IN!
              </Text>
              <div style={{ width: "100%", marginTop: 12 }}>
                <Bar ms={T.open / speed} runKey={g.seq} paused={paused} h={10} />
              </div>
              {micWarning}
            </>
          ),
        );
        break;
      case "answering":
        body = centered(
          g.answerer === v ? (
            <>
              {headline(micOff[v] ? "No microphone" : "Say your answer", micOff[v] ? "red.3" : "white")}
              {!micOff[v] && <Meter color="var(--mantine-color-green-5)" h={48} />}
              <Text fz={24} fs="italic" mih={64} c="white">
                {transcript ? (
                  `“${transcript}”`
                ) : (
                  <span style={{ color: "#7f87e6" }}>{micOff[v] ? "This counts as no answer." : "Listening…"}</span>
                )}
              </Text>
              <div style={{ width: "100%" }}>
                <Bar ms={T.answer / speed} runKey={g.seq} paused={paused} color="var(--mantine-color-green-6)" />
              </div>
              {sub("“What is” is optional. It stops when you go quiet.")}
            </>
          ) : (
            <>
              {headline(
                dd
                  ? `${NAME[g.answerer as Pid]} is answering a Daily Double`
                  : `${NAME[g.answerer as Pid]} is answering…`,
              )}
              {sub("Look at the TV.")}
            </>
          ),
        );
        break;
      case "judged":
        body = centered(
          g.verdict?.who === v ? (
            <div style={{ animation: "sg-pop 260ms" }}>
              <Text ff={DISPLAY} fw={700} fz={96} lh={1} c={g.verdict.correct ? "green.5" : "red.5"}>
                {g.verdict.correct ? "✓" : "✗"}
              </Text>
              <Text ff={DISPLAY} fw={700} fz={44} c={g.verdict.correct ? "green.4" : "red.4"}>
                {g.verdict.delta > 0 ? "+" : ""}
                {money(g.verdict.delta)}
              </Text>
            </div>
          ) : (
            headline("Look at the TV.")
          ),
        );
        break;
      case "response":
        body = centered(headline("Look at the TV."));
        break;
      case "interstitial":
        body = centered(
          <>
            <Big text="Double Schmegettes!" phone />
            {sub("Values double. Look at the TV.")}
          </>,
        );
        break;
      case "end":
        body = centered(
          <>
            {headline("Final Schmegettes is next")}
            {sub("See final / final-schmegettes.")}
          </>,
        );
        break;
    }
  const phoneOverlay = !online[v] ? (
    <div
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 20,
        background: "rgba(3,4,28,.85)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
      }}
    >
      <Loader color="yellow.4" />
      <Text fw={700}>Reconnecting…</Text>
      <Text size="sm" c="boardBlue.1">
        Your score is safe.
      </Text>
    </div>
  ) : confirm?.who === v ? (
    <Sheet bottom onClose={() => setConfirm(null)}>
      <PickConfirm
        phone
        cat={R.cats[confirm.c]}
        value={R.values[confirm.r]}
        onCancel={() => setConfirm(null)}
        onPick={() => pick(confirm.c, confirm.r)}
      />
    </Sheet>
  ) : null;

  // ── Director: what the prototype lets you do next ──
  const userPlays = (p: Pid) => p === viewer || p === "wyatt" || !autoplay;
  const narration = g.phase === "reading" ? readText(g) : g.phase === "dd_reveal" ? "It's a Daily Double." : null;
  const actions: ReactNode[] = [];
  if (voice?.listening) {
    const [c, r] = available(g)[available(g).length - 1] ?? [0, 0];
    actions.push(
      <Button key="v1" size="xs" color="green" variant="light" onClick={() => voiceSays("ok")}>
        Say “{R.cats[c]} for {R.values[r]}”
      </Button>,
      <Button key="v2" size="xs" color="orange" variant="light" onClick={() => voiceSays("played")}>
        Say a clue that's been played
      </Button>,
      <Button key="v3" size="xs" color="red" variant="light" onClick={() => voiceSays("mumble")}>
        Mumble
      </Button>,
    );
  }
  if (g.phase === "board" && !userPlays(g.control))
    actions.push(
      <Button
        key="pick"
        size="xs"
        variant="light"
        onClick={() => {
          const open = available(g);
          const [c, r] = open[Math.floor(Math.random() * open.length)];
          pick(c, r);
        }}
      >
        {NAME[g.control]} picks now
      </Button>,
    );
  if (g.phase === "board")
    actions.push(
      <Button
        key="skip"
        size="xs"
        variant="subtle"
        onClick={() =>
          setG((prev) => {
            const keep = available(prev).find(([c, r]) => !ROUNDS[prev.round].clues[c][r].dd) ?? available(prev)[0];
            return {
              ...prev,
              done: prev.done.map((col, c) => col.map((_, r) => !(keep && keep[0] === c && keep[1] === r))),
              seq: prev.seq + 1,
            };
          })
        }
      >
        Leave one clue (jump to the round's end)
      </Button>,
    );
  if (g.phase === "open")
    for (const p of ORDER)
      if (!g.tried.includes(p) && online[p])
        actions.push(
          <Button key={`b${p}`} size="xs" variant="light" color="yellow" onClick={() => buzz(p)}>
            {NAME[p]} buzzes{p === "wyatt" ? " (Space)" : ""}
          </Button>,
        );
  if (g.phase === "answering" && g.answerer && userPlays(g.answerer) && !micOff[g.answerer])
    actions.push(
      <Button key="s1" size="xs" color="green" variant="light" onClick={() => setSay("right")}>
        {NAME[g.answerer]} says “what is {clue?.a}”
      </Button>,
      <Button key="s2" size="xs" color="red" variant="light" onClick={() => setSay("wrong")}>
        says “{clue?.wrong}”
      </Button>,
      <Button key="s3" size="xs" color="gray" variant="light" onClick={() => setSay("silent")}>
        says nothing (skip the 9 s)
      </Button>,
    );

  const W = s.w + BEZEL * 2 + 40 + PHONE.w + BEZEL * 2;
  const H = 28 + Math.max(s.h, PHONE.h) + BEZEL * 2;

  return (
    <MantineProvider theme={theme} defaultColorScheme="dark">
      <Kit />
      <Stack gap="md" pb={48}>
        <Alert color="yellow" title="PROTOTYPE — not production code" />
        <div>
          <Title order={2}>The clue loop</Title>
          <Text c="dimmed" size="sm" maw={860}>
            A live game, mid-Single round. Pick on {NAME[viewer]}'s phone by tapping a clue or pressing the buzzer and
            saying it; buzz there or on the host's column (or press Space), and choose what gets said.{" "}
            {autoplay
              ? `${NAME[viewer === "alice" ? "bob" : "alice"]} plays on their own.`
              : "Nobody plays on their own."}{" "}
            Volcanoes 600 is a Daily Double.
          </Text>
        </div>
        <Group gap="sm">
          <SegmentedControl
            size="xs"
            value={size}
            onChange={(x) => setSize(x as HostSize)}
            data={Object.entries(HOST_SIZES).map(([value, x]) => ({ value, label: x.label }))}
          />
          <SegmentedControl
            size="xs"
            value={viewer}
            onChange={(x) => setViewer(x as "alice" | "bob")}
            data={[
              { value: "alice", label: "Alice's phone" },
              { value: "bob", label: "Bob's phone" },
            ]}
          />
          <SegmentedControl
            size="xs"
            value={String(speed)}
            onChange={(x) => setSpeed(Number(x))}
            data={[
              { value: "1", label: "Real time" },
              { value: "2", label: "2× speed" },
            ]}
          />
          <Switch
            size="xs"
            label="Others play on their own"
            checked={autoplay}
            onChange={(e) => setAutoplay(e.currentTarget.checked)}
          />
          <Button size="xs" variant="subtle" onClick={reset}>
            Reset
          </Button>
        </Group>
        <Group gap="lg">
          {ORDER.filter((p) => p !== "wyatt").map((p) => (
            <Switch
              key={p}
              size="xs"
              color="red"
              label={`${NAME[p]}'s phone disconnected`}
              checked={!online[p]}
              onChange={() => toggleOnline(p)}
            />
          ))}
          <Switch
            size="xs"
            color="red"
            label={`${NAME[viewer]}'s mic blocked`}
            checked={micOff[viewer]}
            onChange={(e) => setMicOff((m) => ({ ...m, [viewer]: e.currentTarget.checked }))}
          />
          <Switch
            size="xs"
            color="red"
            label="Host device loses connection (pause)"
            checked={paused}
            onChange={togglePause}
          />
        </Group>
        <Paper p="sm" radius="md" withBorder>
          <Group gap="xs" mb={actions.length ? 8 : 0}>
            <Badge variant="filled">{R.name}</Badge>
            <Badge variant="light" color="yellow">
              {paused ? "paused" : g.phase.replace("_", " ")}
            </Badge>
            <Text size="sm" c="dimmed">
              {NAME[g.control]} has control
            </Text>
            {narration && !paused && (
              <Text size="sm" fs="italic">
                🔊 “{narration}”
              </Text>
            )}
          </Group>
          {actions.length > 0 && <Group gap="xs">{actions}</Group>}
        </Paper>
        <Fit width={W} height={H}>
          <div style={{ display: "flex", gap: 40, alignItems: "flex-start" }}>
            <div>
              <DeviceLabel>Host's iPhone, mirrored to the TV (Wyatt hosts and plays)</DeviceLabel>
              <HostDevice size={size} stage={stageWithVeil} column={column} overlay={hostOverlay} />
            </div>
            <div>
              <DeviceLabel>{NAME[viewer]}'s phone</DeviceLabel>
              <PhoneDevice>
                <PhoneScreen
                  top={<PhoneTop score={showScore ? g.scores[v] : undefined} />}
                  buzzer={<Buzzer state={buzzerFor(v)} onBuzz={() => buzz(v)} />}
                  hint={phoneHint}
                >
                  {body}
                </PhoneScreen>
                {phoneOverlay}
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
        fontFamily: DISPLAY,
        fontWeight: 700,
        textTransform: "uppercase",
        color: GOLD,
        lineHeight: 1,
        fontSize: phone ? 48 : "min(24cqh, 13cqw)",
        textShadow: "0 4px 0 rgba(0,0,0,.45)",
        animation: "sg-pop 380ms ease-out",
        display: "block",
      }}
    >
      {text}
    </span>
  );
}

function ClueHeader({ left, speaking }: { left: string; speaking?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        color: "#c9cdf7",
        fontWeight: 700,
        letterSpacing: ".12em",
        fontSize: "4.4cqh",
        textTransform: "uppercase",
        flexShrink: 0,
      }}
    >
      <span>{left}</span>
      {speaking && (
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          🔊 <Meter h={12} color="#c9cdf7" />
        </span>
      )}
    </div>
  );
}

function ClueText({ q }: { q: string }) {
  const h = q.length <= 50 ? 12.5 : q.length <= 85 ? 11 : q.length <= 120 ? 9.5 : 8.2;
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
          textShadow: "0 2px 0 rgba(0,0,0,.4)",
        }}
      >
        {q}
      </span>
    </div>
  );
}

function VerdictLine({ v, small }: { v: Verdict; small?: boolean }) {
  const color = v.correct ? "var(--mantine-color-green-4)" : "var(--mantine-color-red-4)";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "center",
        gap: 10,
        color,
        fontWeight: 700,
        fontSize: small ? "4.6cqh" : "7cqh",
        marginBottom: small ? 6 : 0,
        animation: small ? undefined : "sg-in 220ms ease-out",
        flexShrink: 0,
      }}
    >
      <span>
        {v.correct ? "✓" : "✗"} {NAME[v.who]}: <i style={{ fontWeight: 500 }}>{v.said || "no answer"}</i>
      </span>
      <span style={{ fontFamily: DISPLAY }}>
        {v.delta > 0 ? "+" : ""}
        {money(v.delta)}
      </span>
    </div>
  );
}

function PickConfirm({
  cat,
  value,
  onCancel,
  onPick,
  phone,
}: {
  cat: string;
  value: number;
  onCancel: () => void;
  onPick: () => void;
  phone?: boolean;
}) {
  return (
    <Stack gap="lg">
      <Text ta="center" ff={DISPLAY} fw={600} fz={phone ? 34 : 26} lh={1.1}>
        {cat}
        <br />
        <span style={{ color: GOLD }}>for {money(value)}?</span>
      </Text>
      <Group grow gap="sm">
        <Button size={phone ? "lg" : "md"} variant="default" onClick={onCancel}>
          Cancel
        </Button>
        <GoldButton size={phone ? "lg" : "md"} onClick={onPick}>
          Pick
        </GoldButton>
      </Group>
    </Stack>
  );
}
