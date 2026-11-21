import {
  Alert,
  Group,
  MantineProvider,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Text,
  UnstyledButton,
} from "@mantine/core";
import { useElementSize } from "@mantine/hooks";
import {
  type CSSProperties,
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

// PROTOTYPE — a sleeker pass on Home, My games and Account, five font pairings to compare,
// and a kit sheet for headers, informational text, buttons and forms. Mock data inline.

// ───────────────────────────── Palette (design-system.md) ─────────────────────────────

const theme = {
  primaryColor: "green",
  primaryShade: 4 as const,
  autoContrast: true,
  colors: {
    mauve: [
      "#f3edfe",
      "#e2d6fc",
      "#c9b3f9",
      "#ad8cf6",
      "#9161f2",
      "#7a48e0",
      "#6436c4",
      "#4e2a9c",
      "#3b2075",
      "#2a1754",
    ] as const,
    green: [
      "#eafff4",
      "#cfffe6",
      "#a6ffd2",
      "#8affc3",
      "#6bffb3",
      "#4ff09e",
      "#36d986",
      "#25bd6f",
      "#18a05c",
      "#0e8049",
    ] as const,
    pink: [
      "#fff0f8",
      "#ffd9ef",
      "#ffa6d9",
      "#ff8fce",
      "#ff78c3",
      "#f25eb2",
      "#d9479b",
      "#bd3383",
      "#9e226c",
      "#801655",
    ] as const,
    dark: [
      "#d6cfe6",
      "#bbb0d4",
      "#9f92bf",
      "#75679a",
      "#524478",
      "#3c3060",
      "#2e244d",
      "#241c3e",
      "#1b1433",
      "#140b2b",
    ] as const,
  },
};

const ACCENT = "#6bffb3";
const INK = "#140b2b";
const NIGHT = "#140b2b";
const SOFT = "#ffa6d9";
/** Proposed: body-level secondary text in a cool lavender, so pink is kept for eyebrows and labels. */
const QUIET = "#b8a8d8";
const FAINT = "#8a7aad";
const LINE = "rgba(255,255,255,.08)";
const RED = "#ff8787";
const TEAL = "#38d9a9";
const AMBER = "#ffd43b";

const APP_BG = [
  "radial-gradient(90% 45% at 50% -8%, rgba(145,97,242,.55) 0%, rgba(145,97,242,0) 70%)",
  "radial-gradient(60% 30% at 105% 4%, rgba(255,166,217,.16) 0%, rgba(255,166,217,0) 70%)",
  "linear-gradient(180deg, #24134d 0%, #170d33 45%, #140b2b 100%)",
].join(", ");

/** Film grain over the background: kills gradient banding on phone OLEDs. */
const GRAIN = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 .5 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.35'/%3E%3C/svg%3E")`;

const SURFACE: CSSProperties = {
  background: "linear-gradient(180deg, rgba(255,255,255,.07) 0%, rgba(255,255,255,.035) 100%)",
  border: `1px solid ${LINE}`,
  boxShadow: "inset 0 1px 0 rgba(255,255,255,.06), 0 10px 30px -12px rgba(0,0,0,.6)",
};

// ───────────────────────────── Font pairings ─────────────────────────────

type Pair = {
  id: string;
  name: string;
  vibe: string;
  display: string;
  displayWeight: number;
  displayStretch?: string;
  upper: boolean;
  tracking: string;
  /** Visual size correction so every display face fills the same box. */
  scale: number;
  numFamily: string;
  numWeight: number;
  numStretch?: string;
  body: string;
  buttonUpper: boolean;
};

const PAIRS: Pair[] = [
  {
    id: "classic",
    name: "Oswald + Inter",
    vibe: "Today's pair. Loud, condensed, very game-show.",
    display: "Oswald, Impact, sans-serif",
    displayWeight: 700,
    upper: true,
    tracking: ".02em",
    scale: 1,
    numFamily: "Oswald, Impact, sans-serif",
    numWeight: 600,
    body: "Inter, system-ui, sans-serif",
    buttonUpper: true,
  },
  {
    id: "bricolage",
    name: "Bricolage Grotesque + Geist",
    vibe: "Quirky, warm, current. Condensed width for numbers.",
    display: "'Bricolage Grotesque', system-ui, sans-serif",
    displayWeight: 800,
    upper: false,
    tracking: "-.035em",
    scale: 1,
    numFamily: "'Bricolage Grotesque', system-ui, sans-serif",
    numWeight: 700,
    numStretch: "75%",
    body: "Geist, Inter, system-ui, sans-serif",
    buttonUpper: false,
  },
  {
    id: "unbounded",
    name: "Unbounded + Manrope",
    vibe: "Wide and bubbly. Playful, reads as a toy.",
    display: "Unbounded, system-ui, sans-serif",
    displayWeight: 700,
    upper: false,
    tracking: "-.03em",
    scale: 0.8,
    numFamily: "Unbounded, system-ui, sans-serif",
    numWeight: 600,
    body: "Manrope, system-ui, sans-serif",
    buttonUpper: false,
  },
  {
    id: "shoulders",
    name: "Big Shoulders + Figtree",
    vibe: "Marquee signage. Tall, tight, theatrical.",
    display: "'Big Shoulders Display', Impact, sans-serif",
    displayWeight: 800,
    upper: true,
    tracking: ".01em",
    scale: 1.12,
    numFamily: "'Big Shoulders Display', Impact, sans-serif",
    numWeight: 800,
    body: "Figtree, system-ui, sans-serif",
    buttonUpper: true,
  },
  {
    id: "archivo",
    name: "Archivo, two widths",
    vibe: "One family: expanded for titles, condensed for numbers.",
    display: "Archivo, system-ui, sans-serif",
    displayWeight: 800,
    displayStretch: "125%",
    upper: false,
    tracking: "-.03em",
    scale: 0.86,
    numFamily: "Archivo, system-ui, sans-serif",
    numWeight: 800,
    numStretch: "62%",
    body: "Archivo, system-ui, sans-serif",
    buttonUpper: false,
  },
];

const FONT_URL =
  "https://fonts.googleapis.com/css2?" +
  [
    "family=Oswald:wght@500;600;700",
    "family=Inter:wght@400;500;600;700;800",
    "family=Bricolage+Grotesque:opsz,wdth,wght@12..96,75..100,400..800",
    "family=Geist:wght@400..700",
    "family=Unbounded:wght@500..800",
    "family=Manrope:wght@400..800",
    "family=Big+Shoulders+Display:wght@600..900",
    "family=Figtree:wght@400..800",
    "family=Archivo:wdth,wght@62..125,400..900",
  ].join("&") +
  "&display=swap";

const PairCtx = createContext<Pair>(PAIRS[0]);
const usePair = () => useContext(PairCtx);

function displayStyle(p: Pair, size: number, extra?: CSSProperties): CSSProperties {
  return {
    fontFamily: p.display,
    fontWeight: p.displayWeight,
    fontStretch: p.displayStretch,
    letterSpacing: p.tracking,
    textTransform: p.upper ? "uppercase" : "none",
    fontSize: Math.round(size * p.scale),
    lineHeight: 1.05,
    margin: 0,
    ...extra,
  };
}

function numStyle(p: Pair, size: number, extra?: CSSProperties): CSSProperties {
  return {
    fontFamily: p.numFamily,
    fontWeight: p.numWeight,
    fontStretch: p.numStretch,
    fontVariantNumeric: "tabular-nums",
    fontSize: Math.round(size * (p.id === "unbounded" ? 0.82 : 1)),
    letterSpacing: p.id === "unbounded" ? "-.02em" : 0,
    lineHeight: 1,
    ...extra,
  };
}

// ───────────────────────────── Motion + small CSS ─────────────────────────────

const KIT_CSS = `
@keyframes mt-in { from { opacity: 0; transform: translateY(10px) } to { opacity: 1; transform: none } }
@keyframes mt-sheet { from { transform: translateY(100%) } to { transform: none } }
@keyframes mt-fade { from { opacity: 0 } to { opacity: 1 } }
@keyframes mt-shimmer { from { background-position: -200px 0 } to { background-position: 200px 0 } }
@keyframes mt-caret { 0%,100% { opacity: 1 } 50% { opacity: 0 } }
@keyframes mt-spin { to { transform: rotate(360deg) } }
@keyframes mt-shake { 0%,100% { transform: translateX(0) } 20%,60% { transform: translateX(-6px) } 40%,80% { transform: translateX(6px) } }
.mt-in { animation: mt-in 420ms cubic-bezier(.2,.8,.2,1) both }
.mt-sheet { animation: mt-sheet 380ms cubic-bezier(.2,.9,.25,1) both }
.mt-fade { animation: mt-fade 240ms ease-out both }
.mt-shake { animation: mt-shake 320ms }
.mt-caret { animation: mt-caret 1s steps(1) infinite }
.mt-spin { animation: mt-spin 700ms linear infinite }
.mt-skel { background: linear-gradient(90deg, rgba(255,255,255,.05) 0, rgba(255,255,255,.11) 40px, rgba(255,255,255,.05) 80px) 0 0/200px 100% repeat-x, rgba(255,255,255,.05); animation: mt-shimmer 1.2s linear infinite }
.mt-press { transition: transform 120ms ease, background-color 160ms ease, box-shadow 160ms ease, filter 160ms ease }
.mt-press:not(:disabled):active { transform: scale(.97) }
.mt-press:focus-visible { outline: 2px solid ${ACCENT}; outline-offset: 3px }
.mt-row { transition: background-color 160ms ease }
.mt-row:hover { background-color: rgba(255,255,255,.04) }
.mt-row:active { background-color: rgba(255,255,255,.07) }
.mt-row:focus-visible { outline: 2px solid ${ACCENT}; outline-offset: -2px }
.mt-field { transition: border-color 160ms ease, box-shadow 160ms ease, background-color 160ms ease }
.mt-field:hover { border-color: rgba(255,255,255,.2) }
.mt-field:focus-within { border-color: ${ACCENT} !important; box-shadow: 0 0 0 4px rgba(107,255,179,.16) !important; background-color: rgba(255,255,255,.07) !important }
.mt-field.mt-err:focus-within { border-color: ${RED} !important; box-shadow: 0 0 0 4px rgba(255,135,135,.16) !important }
.mt-field input { all: unset; flex: 1; min-width: 0; color: #fff; font: inherit; font-size: 17px; }
.mt-field input::placeholder { color: ${FAINT} }
.mt-group > * + * { border-top: 1px solid ${LINE} }
.mt-scroll { scrollbar-width: none } .mt-scroll::-webkit-scrollbar { display: none }
.mt-balance { text-wrap: balance } .mt-pretty { text-wrap: pretty }
@media (prefers-reduced-motion: reduce) {
  .mt-in, .mt-sheet, .mt-fade, .mt-shake, .mt-skel, .mt-caret { animation: none }
  .mt-press:not(:disabled):active { transform: none }
}
`;

function Kit() {
  useEffect(() => {
    if (document.getElementById("mt-fonts")) return;
    const link = document.createElement("link");
    link.id = "mt-fonts";
    link.rel = "stylesheet";
    link.href = FONT_URL;
    document.head.appendChild(link);
  }, []);
  return <style>{KIT_CSS}</style>;
}

// ───────────────────────────── Icons (inline, Lucide-style strokes) ─────────────────────────────

const ICONS: Record<string, ReactNode> = {
  right: <path d="m9 18 6-6-6-6" />,
  left: <path d="m15 18-6-6 6-6" />,
  x: (
    <>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </>
  ),
  check: <path d="M20 6 9 17l-5-5" />,
  info: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </>
  ),
  warn: (
    <>
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </>
  ),
  tv: (
    <>
      <rect x="2" y="7" width="20" height="15" rx="2" />
      <path d="m17 2-5 5-5-5" />
    </>
  ),
  eye: (
    <>
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  lock: (
    <>
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </>
  ),
  out: (
    <>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5" />
      <path d="M21 12H9" />
    </>
  ),
  trash: (
    <>
      <path d="M3 6h18" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="5" />
      <path d="M20 21a8 8 0 0 0-16 0" />
    </>
  ),
  mail: (
    <>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </>
  ),
  history: (
    <>
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M12 7v5l4 2" />
    </>
  ),
  key: (
    <>
      <path d="m15.5 7.5 2.3 2.3a1 1 0 0 0 1.4 0l2.1-2.1a1 1 0 0 0 0-1.4L19 4" />
      <path d="m21 2-9.6 9.6" />
      <circle cx="7.5" cy="15.5" r="5.5" />
    </>
  ),
  arrow: (
    <>
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </>
  ),
  pen: (
    <path d="M21.17 6.81a1 1 0 0 0-3.99-3.99L3.84 16.17a2 2 0 0 0-.5.83l-1.32 4.35a.5.5 0 0 0 .62.62l4.35-1.32a2 2 0 0 0 .83-.5z" />
  ),
  showPw: (
    <>
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  hidePw: (
    <>
      <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
      <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
      <path d="M6.61 6.61A13.53 13.53 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
      <path d="m2 2 20 20" />
    </>
  ),
};

function Icon({
  name,
  size = 20,
  color = "currentColor",
  stroke = 2,
}: {
  name: keyof typeof ICONS;
  size?: number;
  color?: string;
  stroke?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      style={{ flexShrink: 0, display: "block" }}
    >
      {ICONS[name]}
    </svg>
  );
}

// ───────────────────────────── Type primitives ─────────────────────────────

function Eyebrow({ children, color = SOFT }: { children: ReactNode; color?: string }) {
  return (
    <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".14em", textTransform: "uppercase", color }}>
      {children}
    </div>
  );
}

function LargeTitle({ eyebrow, title, sub }: { eyebrow?: string; title: string; sub?: string }) {
  const p = usePair();
  return (
    <div className="mt-in" style={{ padding: "4px 20px 18px" }}>
      {eyebrow && (
        <div style={{ marginBottom: 8 }}>
          <Eyebrow>{eyebrow}</Eyebrow>
        </div>
      )}
      <h1 style={displayStyle(p, 38)}>{title}</h1>
      {sub && (
        <p className="mt-pretty" style={{ margin: "10px 0 0", color: QUIET, fontSize: 15, lineHeight: 1.45 }}>
          {sub}
        </p>
      )}
    </div>
  );
}

function SectionLabel({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "0 24px 8px" }}>
      <Eyebrow color={QUIET}>{children}</Eyebrow>
      {right}
    </div>
  );
}

function Wordmark({ size }: { size: number }) {
  const p = usePair();
  return (
    <span
      style={{
        ...displayStyle(p, size, { letterSpacing: p.upper ? ".04em" : p.tracking, lineHeight: 0.95 }),
        textTransform: "uppercase",
        display: "inline-block",
        background: "linear-gradient(180deg, #d9ffec 0%, #8affc3 35%, #6bffb3 60%, #36d986 100%)",
        WebkitBackgroundClip: "text",
        backgroundClip: "text",
        color: "transparent",
        filter: "drop-shadow(0 3px 0 rgba(0,0,0,.45)) drop-shadow(0 0 24px rgba(107,255,179,.25))",
      }}
    >
      Schmegettes
    </span>
  );
}

// ───────────────────────────── Buttons ─────────────────────────────

type BtnKind = "primary" | "secondary" | "ghost" | "danger" | "danger-solid";
type BtnSize = "lg" | "md" | "sm";

function Btn({
  kind = "primary",
  size = "lg",
  full,
  loading,
  disabled,
  icon,
  trailing,
  onClick,
  type = "button",
  children,
}: {
  kind?: BtnKind;
  size?: BtnSize;
  full?: boolean;
  loading?: boolean;
  disabled?: boolean;
  icon?: keyof typeof ICONS;
  trailing?: keyof typeof ICONS;
  onClick?: () => void;
  type?: "button" | "submit";
  children: ReactNode;
}) {
  const p = usePair();
  const h = { lg: 56, md: 46, sm: 36 }[size];
  const fs = { lg: 17, md: 15, sm: 14 }[size];
  const upper = p.buttonUpper && kind === "primary";
  const look: Record<BtnKind, CSSProperties> = {
    primary: {
      background: "linear-gradient(180deg, #a6ffd2 0%, #6bffb3 45%, #4ff09e 100%)",
      color: INK,
      boxShadow:
        "inset 0 1px 0 rgba(255,255,255,.7), inset 0 -2px 0 rgba(14,128,73,.35), 0 10px 28px -10px rgba(107,255,179,.7)",
    },
    secondary: {
      background: "rgba(145,97,242,.2)",
      color: "#ece4ff",
      boxShadow: "inset 0 0 0 1px rgba(173,140,246,.38), inset 0 1px 0 rgba(255,255,255,.08)",
    },
    ghost: { background: "transparent", color: "#e2d6fc" },
    danger: { background: "rgba(255,107,107,.12)", color: RED, boxShadow: "inset 0 0 0 1px rgba(255,135,135,.25)" },
    "danger-solid": {
      background: "linear-gradient(180deg, #ff8f8f, #fa5252)",
      color: "#fff",
      boxShadow: "inset 0 1px 0 rgba(255,255,255,.35), 0 10px 24px -10px rgba(250,82,82,.7)",
    },
  };
  const off = disabled || loading;
  return (
    <UnstyledButton
      type={type}
      className="mt-press"
      disabled={off}
      aria-busy={loading || undefined}
      onClick={onClick}
      style={{
        ...look[kind],
        ...(disabled && !loading
          ? {
              background: "rgba(255,255,255,.06)",
              color: "rgba(255,255,255,.32)",
              boxShadow: "inset 0 0 0 1px rgba(255,255,255,.06)",
            }
          : null),
        height: h,
        padding: `0 ${size === "sm" ? 14 : 22}px`,
        width: full ? "100%" : undefined,
        borderRadius: 999,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        fontFamily: upper ? p.display : p.body,
        fontStretch: upper ? p.displayStretch : undefined,
        fontWeight: upper ? p.displayWeight : 650,
        fontSize: upper ? Math.round(fs * (p.id === "shoulders" ? 1.2 : 1.05)) : fs,
        letterSpacing: upper ? ".08em" : "-.005em",
        textTransform: upper ? "uppercase" : "none",
        cursor: off ? "default" : "pointer",
        whiteSpace: "nowrap",
        position: "relative",
      }}
    >
      {loading ? (
        <span
          className="mt-spin"
          style={{
            width: 18,
            height: 18,
            borderRadius: "50%",
            border: "2.5px solid currentColor",
            borderRightColor: "transparent",
            opacity: 0.8,
          }}
        />
      ) : (
        <>
          {icon && <Icon name={icon} size={size === "sm" ? 16 : 18} stroke={2.4} />}
          {children}
          {trailing && <Icon name={trailing} size={size === "sm" ? 16 : 18} stroke={2.4} />}
        </>
      )}
    </UnstyledButton>
  );
}

function IconBtn({ icon, label, onClick }: { icon: keyof typeof ICONS; label: string; onClick?: () => void }) {
  return (
    <UnstyledButton
      className="mt-press"
      aria-label={label}
      onClick={onClick}
      style={{
        width: 36,
        height: 36,
        borderRadius: 999,
        display: "grid",
        placeItems: "center",
        background: "rgba(255,255,255,.08)",
        color: "#e2d6fc",
      }}
    >
      <Icon name={icon} size={18} stroke={2.4} />
    </UnstyledButton>
  );
}

// ───────────────────────────── Informational text ─────────────────────────────

type Tone = "info" | "success" | "warn" | "danger";
const TONES: Record<Tone, { c: string; bg: string; icon: keyof typeof ICONS }> = {
  info: { c: "#c9b3f9", bg: "rgba(145,97,242,.14)", icon: "info" },
  success: { c: TEAL, bg: "rgba(56,217,169,.1)", icon: "check" },
  warn: { c: AMBER, bg: "rgba(255,212,59,.09)", icon: "warn" },
  danger: { c: RED, bg: "rgba(255,107,107,.1)", icon: "warn" },
};

function Callout({
  tone = "info",
  title,
  children,
  action,
  onClose,
}: {
  tone?: Tone;
  title?: string;
  children?: ReactNode;
  action?: ReactNode;
  onClose?: () => void;
}) {
  const t = TONES[tone];
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className="mt-in"
      style={{
        display: "flex",
        gap: 12,
        padding: "14px 14px 14px 14px",
        borderRadius: 18,
        background: t.bg,
        boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${t.c} 28%, transparent)`,
        alignItems: "flex-start",
      }}
    >
      <span
        style={{
          width: 28,
          height: 28,
          borderRadius: 999,
          flexShrink: 0,
          display: "grid",
          placeItems: "center",
          background: `color-mix(in srgb, ${t.c} 20%, transparent)`,
          color: t.c,
        }}
      >
        <Icon name={t.icon} size={16} stroke={2.4} />
      </span>
      <div style={{ flex: 1, minWidth: 0, paddingTop: 3 }}>
        {title && <div style={{ fontWeight: 650, fontSize: 15, color: "#fff", lineHeight: 1.3 }}>{title}</div>}
        {children && (
          <div className="mt-pretty" style={{ fontSize: 14, color: QUIET, lineHeight: 1.45, marginTop: title ? 3 : 0 }}>
            {children}
          </div>
        )}
        {action && <div style={{ marginTop: 10 }}>{action}</div>}
      </div>
      {onClose && (
        <UnstyledButton aria-label="Dismiss" onClick={onClose} style={{ color: FAINT, padding: 2 }}>
          <Icon name="x" size={18} />
        </UnstyledButton>
      )}
    </div>
  );
}

function Hint({
  icon = "info",
  children,
  color = QUIET,
}: {
  icon?: keyof typeof ICONS;
  children: ReactNode;
  color?: string;
}) {
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "flex-start", fontSize: 13, color, lineHeight: 1.4 }}>
      <span style={{ marginTop: 1 }}>
        <Icon name={icon} size={15} />
      </span>
      <span className="mt-pretty">{children}</span>
    </div>
  );
}

function Chip({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "accent" | "warn" }) {
  const c = { neutral: "#d6cfe6", accent: ACCENT, warn: AMBER }[tone];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        height: 20,
        padding: "0 8px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: ".04em",
        color: c,
        background: `color-mix(in srgb, ${c} 12%, transparent)`,
        boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${c} 30%, transparent)`,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

// ───────────────────────────── Forms ─────────────────────────────

function Field({
  label,
  hint,
  error,
  value,
  onChange,
  placeholder,
  type = "text",
  autoFocus,
  maxLength,
  icon,
  counter,
  autoComplete,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: "text" | "password" | "email";
  autoFocus?: boolean;
  maxLength?: number;
  icon?: keyof typeof ICONS;
  counter?: boolean;
  autoComplete?: string;
}) {
  const [shown, setShown] = useState(false);
  const id = useRef(`f-${Math.random().toString(36).slice(2, 8)}`).current;
  const isPw = type === "password";
  const inputRef = useRef<HTMLInputElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: focus once, on open
  useEffect(() => {
    if (autoFocus) inputRef.current?.focus({ preventScroll: true });
  }, []);
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
        <label htmlFor={id} style={{ fontSize: 14, fontWeight: 600, color: "#ece4ff" }}>
          {label}
        </label>
        {counter && maxLength && (
          <span
            style={{
              fontSize: 12,
              color: value.length >= maxLength ? AMBER : FAINT,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {value.length}/{maxLength}
          </span>
        )}
      </div>
      <div
        className={`mt-field${error ? " mt-err mt-shake" : ""}`}
        key={error ?? "ok"}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          height: 54,
          padding: "0 16px",
          borderRadius: 16,
          background: "rgba(255,255,255,.05)",
          border: `1px solid ${error ? RED : "rgba(255,255,255,.12)"}`,
          color: FAINT,
        }}
      >
        {icon && <Icon name={icon} size={18} />}
        <input
          id={id}
          type={isPw && !shown ? "password" : type === "password" ? "text" : type}
          value={value}
          placeholder={placeholder}
          maxLength={maxLength}
          ref={inputRef}
          autoComplete={autoComplete}
          aria-invalid={!!error || undefined}
          aria-describedby={`${id}-d`}
          onChange={(e) => onChange(e.currentTarget.value)}
        />
        {isPw && (
          <UnstyledButton
            aria-label={shown ? "Hide password" : "Show password"}
            onClick={() => setShown((s) => !s)}
            style={{ color: QUIET }}
          >
            <Icon name={shown ? "hidePw" : "showPw"} size={18} />
          </UnstyledButton>
        )}
      </div>
      <div id={`${id}-d`} style={{ marginTop: 8, minHeight: hint || error ? undefined : 0 }}>
        {error ? (
          <Hint icon="warn" color={RED}>
            {error}
          </Hint>
        ) : hint ? (
          <div style={{ fontSize: 13, color: FAINT, lineHeight: 1.4 }}>{hint}</div>
        ) : null}
      </div>
    </div>
  );
}

/** Password length meter: four segments filling toward the 8-character minimum and beyond. */
function Strength({ value, min = 8 }: { value: string; min?: number }) {
  const n = value.length;
  const level = n === 0 ? 0 : n < min ? 1 : n < 12 ? 2 : n < 16 ? 3 : 4;
  const color = [FAINT, RED, AMBER, TEAL, ACCENT][level];
  const words = ["", `${min - n} more character${min - n === 1 ? "" : "s"}`, "Good", "Strong", "Very strong"];
  return (
    <div style={{ marginTop: -2 }}>
      <div style={{ display: "flex", gap: 4 }}>
        {[1, 2, 3, 4].map((i) => (
          <span
            key={i}
            style={{
              flex: 1,
              height: 4,
              borderRadius: 2,
              background: i <= level ? color : "rgba(255,255,255,.1)",
              transition: "background-color 200ms",
            }}
          />
        ))}
      </div>
      <div style={{ fontSize: 12, color: level ? color : FAINT, marginTop: 6, minHeight: 16 }}>
        {level === 0 ? `At least ${min} characters` : words[level]}
      </div>
    </div>
  );
}

/** Five letter boxes over one real input: paste, autocorrect-off, and one caret. */
function CodeInput({
  value,
  onChange,
  error,
  onSubmit,
}: {
  value: string;
  onChange: (v: string) => void;
  error?: boolean;
  onSubmit?: () => void;
}) {
  const p = usePair();
  const [focused, setFocused] = useState(false);
  return (
    <label
      className={error ? "mt-shake" : undefined}
      key={error ? "err" : "ok"}
      style={{ position: "relative", display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8, cursor: "text" }}
    >
      <input
        aria-label="Room code"
        value={value}
        autoCapitalize="characters"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        inputMode="text"
        enterKeyHint="go"
        maxLength={5}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && value.length === 5) onSubmit?.();
        }}
        onChange={(e) =>
          onChange(
            e.currentTarget.value
              .toUpperCase()
              .replace(/[^A-Z0-9]/g, "")
              .slice(0, 5),
          )
        }
        style={{ position: "absolute", inset: 0, opacity: 0, width: "100%", fontSize: 16 }}
      />
      {[0, 1, 2, 3, 4].map((i) => {
        const ch = value[i];
        const active = focused && (i === value.length || (value.length === 5 && i === 4));
        return (
          <span
            key={i}
            style={{
              height: 64,
              borderRadius: 16,
              display: "grid",
              placeItems: "center",
              background: ch ? "rgba(107,255,179,.08)" : "rgba(255,255,255,.05)",
              border: `1px solid ${error ? RED : active ? ACCENT : ch ? "rgba(107,255,179,.35)" : "rgba(255,255,255,.12)"}`,
              boxShadow: active ? "0 0 0 4px rgba(107,255,179,.16)" : "inset 0 1px 0 rgba(255,255,255,.05)",
              transition: "border-color 140ms, box-shadow 140ms, background-color 140ms",
              ...numStyle(p, 30, { color: ch ? "#fff" : FAINT, fontStretch: p.numStretch ? "100%" : undefined }),
            }}
          >
            {ch ??
              (active ? (
                <span className="mt-caret" style={{ width: 2, height: 28, background: ACCENT, borderRadius: 1 }} />
              ) : (
                ""
              ))}
          </span>
        );
      })}
    </label>
  );
}

// ───────────────────────────── Device + chrome ─────────────────────────────

const PHONE_W = 390;
const PHONE_H = 844;

function Fit({ width, height, children }: { width: number; height: number; children: ReactNode }) {
  const { ref, width: avail } = useElementSize();
  const scale = avail > 0 ? Math.min(1, avail / width) : 1;
  return (
    <div ref={ref} style={{ width: "100%", display: "flex", justifyContent: "center" }}>
      <div style={{ width: width * scale, height: height * scale }}>
        <div style={{ width, height, transform: `scale(${scale})`, transformOrigin: "top left" }}>{children}</div>
      </div>
    </div>
  );
}

type Overlay = { sheet: ReactNode | null; toast: string | null };
const OverlayCtx = createContext<{
  openSheet: (n: ReactNode) => void;
  closeSheet: () => void;
  toast: (m: string) => void;
}>({ openSheet: () => {}, closeSheet: () => {}, toast: () => {} });
const useOverlay = () => useContext(OverlayCtx);

function Phone({ children }: { children: (scrolled: boolean) => ReactNode }) {
  const p = usePair();
  const [scrolled, setScrolled] = useState(false);
  const [ov, setOv] = useState<Overlay>({ sheet: null, toast: null });
  const openSheet = useCallback((n: ReactNode) => setOv((o) => ({ ...o, sheet: n })), []);
  const closeSheet = useCallback(() => setOv((o) => ({ ...o, sheet: null })), []);
  const toast = useCallback((m: string) => setOv((o) => ({ ...o, toast: m })), []);

  useEffect(() => {
    if (!ov.toast) return;
    const t = setTimeout(() => setOv((o) => ({ ...o, toast: null })), 2600);
    return () => clearTimeout(t);
  }, [ov.toast]);

  useEffect(() => {
    if (!ov.sheet) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeSheet();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ov.sheet, closeSheet]);

  return (
    <OverlayCtx.Provider value={{ openSheet, closeSheet, toast }}>
      <div
        style={{
          width: PHONE_W + 24,
          height: PHONE_H + 24,
          padding: 12,
          borderRadius: 64,
          background: "#0b0b10",
          boxShadow: "0 0 0 2px #2a2a33, 0 40px 80px -20px rgba(0,0,0,.7)",
        }}
      >
        <div
          style={{
            position: "relative",
            width: PHONE_W,
            height: PHONE_H,
            borderRadius: 52,
            overflow: "hidden",
            background: NIGHT,
            color: "#fff",
            fontFamily: p.body,
            fontSize: 16,
            WebkitFontSmoothing: "antialiased",
          }}
        >
          <div style={{ position: "absolute", inset: 0, background: APP_BG }} />
          <div
            style={{
              position: "absolute",
              inset: 0,
              backgroundImage: GRAIN,
              opacity: 0.18,
              mixBlendMode: "overlay",
              pointerEvents: "none",
            }}
          />
          {/* status bar */}
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: 54,
              zIndex: 20,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "6px 34px 0 40px",
              fontSize: 16,
              fontWeight: 600,
              pointerEvents: "none",
              fontFamily: "system-ui, -apple-system, sans-serif",
            }}
          >
            <span>9:41</span>
            <span
              style={{
                width: 124,
                height: 36,
                borderRadius: 20,
                background: "#000",
                position: "absolute",
                left: "50%",
                top: 11,
                transform: "translateX(-50%)",
              }}
            />
            <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span style={{ width: 17, height: 11, display: "flex", gap: 1.5, alignItems: "flex-end" }}>
                {[4, 6, 8, 11].map((h) => (
                  <span key={h} style={{ width: 3, height: h, background: "#fff", borderRadius: 1 }} />
                ))}
              </span>
              <span
                style={{
                  width: 25,
                  height: 12,
                  borderRadius: 4,
                  border: "1.5px solid rgba(255,255,255,.5)",
                  padding: 1.5,
                }}
              >
                <span
                  style={{ display: "block", width: "80%", height: "100%", background: "#fff", borderRadius: 1.5 }}
                />
              </span>
            </span>
          </div>
          <div
            className="mt-scroll"
            onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 48)}
            style={{ position: "absolute", inset: 0, overflowY: "auto", overflowX: "hidden" }}
          >
            {children(scrolled)}
            <div style={{ height: 40 }} />
          </div>
          {/* home indicator */}
          <div
            style={{
              position: "absolute",
              bottom: 8,
              left: "50%",
              transform: "translateX(-50%)",
              width: 134,
              height: 5,
              borderRadius: 3,
              background: "rgba(255,255,255,.7)",
              zIndex: 40,
            }}
          />

          {ov.sheet && (
            <div style={{ position: "absolute", inset: 0, zIndex: 30, display: "flex", alignItems: "flex-end" }}>
              <UnstyledButton
                aria-label="Close"
                tabIndex={-1}
                onClick={closeSheet}
                className="mt-fade"
                style={{ position: "absolute", inset: 0, background: "rgba(8,4,20,.55)", backdropFilter: "blur(6px)" }}
              />
              <div
                role="dialog"
                aria-modal="true"
                className="mt-sheet"
                style={{
                  position: "relative",
                  width: "100%",
                  background: "linear-gradient(180deg, #2b1a57 0%, #1d1240 40%, #170d33 100%)",
                  borderRadius: "32px 32px 0 0",
                  padding: "10px 20px 40px",
                  boxShadow: "0 -1px 0 rgba(255,255,255,.12), 0 -30px 60px rgba(0,0,0,.5)",
                  maxHeight: "88%",
                  overflowY: "auto",
                }}
              >
                <div
                  style={{
                    width: 40,
                    height: 5,
                    borderRadius: 3,
                    background: "rgba(255,255,255,.22)",
                    margin: "0 auto 14px",
                  }}
                />
                {ov.sheet}
              </div>
            </div>
          )}

          {ov.toast && (
            <div
              role="status"
              key={ov.toast}
              className="mt-in"
              style={{
                position: "absolute",
                left: 16,
                right: 16,
                top: 60,
                zIndex: 50,
                display: "flex",
                gap: 10,
                alignItems: "center",
                padding: "12px 14px",
                borderRadius: 18,
                background: "rgba(36,22,74,.85)",
                backdropFilter: "blur(20px) saturate(1.4)",
                boxShadow: "inset 0 0 0 1px rgba(255,255,255,.12), 0 12px 30px rgba(0,0,0,.45)",
                fontSize: 15,
                fontWeight: 550,
              }}
            >
              <span
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 999,
                  background: TEAL,
                  color: INK,
                  display: "grid",
                  placeItems: "center",
                }}
              >
                <Icon name="check" size={14} stroke={3} />
              </span>
              {ov.toast}
            </div>
          )}
        </div>
      </div>
    </OverlayCtx.Provider>
  );
}

/** Sticky top bar: transparent at rest, frosted with a centered compact title once the large title scrolls away. */
function NavBar({
  scrolled,
  title,
  back,
  right,
}: {
  scrolled: boolean;
  title?: string;
  back?: { label: string; onClick: () => void };
  right?: ReactNode;
}) {
  const p = usePair();
  return (
    <div
      style={{
        position: "sticky",
        top: 0,
        zIndex: 10,
        padding: "54px 12px 0",
        background: scrolled ? "rgba(23,13,51,.72)" : "transparent",
        backdropFilter: scrolled ? "blur(24px) saturate(1.5)" : undefined,
        borderBottom: `1px solid ${scrolled ? LINE : "transparent"}`,
        transition: "background-color 200ms, border-color 200ms",
      }}
    >
      <div style={{ height: 48, display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center" }}>
        <div>
          {back && (
            <UnstyledButton
              className="mt-press"
              onClick={back.onClick}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 2,
                color: "#e2d6fc",
                fontSize: 16,
                fontWeight: 550,
                padding: "6px 8px 6px 2px",
                borderRadius: 999,
              }}
            >
              <Icon name="left" size={22} stroke={2.4} />
              {back.label}
            </UnstyledButton>
          )}
        </div>
        <div
          style={{
            ...displayStyle(p, 17, { lineHeight: 1 }),
            opacity: scrolled ? 1 : 0,
            transform: scrolled ? "none" : "translateY(4px)",
            transition: "opacity 180ms, transform 180ms",
          }}
        >
          {title}
        </div>
        <div style={{ justifySelf: "end", paddingRight: 4 }}>{right}</div>
      </div>
    </div>
  );
}

// ───────────────────────────── Grouped list (settings-style) ─────────────────────────────

function Group_({ children }: { children: ReactNode }) {
  return (
    <div className="mt-group" style={{ margin: "0 16px", borderRadius: 22, overflow: "hidden", ...SURFACE }}>
      {children}
    </div>
  );
}

function Row({
  icon,
  iconTint = "#c9b3f9",
  title,
  sub,
  value,
  onClick,
  danger,
  chevron = true,
}: {
  icon?: keyof typeof ICONS;
  iconTint?: string;
  title: string;
  sub?: string;
  value?: ReactNode;
  onClick?: () => void;
  danger?: boolean;
  chevron?: boolean;
}) {
  const inner = (
    <>
      {icon && (
        <span
          style={{
            width: 34,
            height: 34,
            borderRadius: 11,
            display: "grid",
            placeItems: "center",
            background: `color-mix(in srgb, ${danger ? RED : iconTint} 16%, transparent)`,
            color: danger ? RED : iconTint,
            flexShrink: 0,
          }}
        >
          <Icon name={icon} size={18} />
        </span>
      )}
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 16, fontWeight: 550, color: danger ? RED : "#fff" }}>{title}</span>
        {sub && <span style={{ display: "block", fontSize: 13, color: FAINT, marginTop: 2 }}>{sub}</span>}
      </span>
      {value && (
        <span
          style={{
            fontSize: 15,
            color: QUIET,
            maxWidth: 170,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {value}
        </span>
      )}
      {onClick && chevron && (
        <span style={{ color: FAINT }}>
          <Icon name="right" size={18} />
        </span>
      )}
    </>
  );
  const style: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 12,
    width: "100%",
    minHeight: 58,
    padding: "10px 16px",
    color: "#fff",
  };
  return onClick ? (
    <UnstyledButton className="mt-row" onClick={onClick} style={style}>
      {inner}
    </UnstyledButton>
  ) : (
    <div style={style}>{inner}</div>
  );
}

function SheetHead({ title, sub }: { title: string; sub?: string }) {
  const p = usePair();
  const { closeSheet } = useOverlay();
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 20 }}>
      <div style={{ flex: 1 }}>
        <h2 style={displayStyle(p, 26)}>{title}</h2>
        {sub && (
          <p className="mt-pretty" style={{ margin: "8px 0 0", fontSize: 15, color: QUIET, lineHeight: 1.45 }}>
            {sub}
          </p>
        )}
      </div>
      <IconBtn icon="x" label="Close" onClick={closeSheet} />
    </div>
  );
}

// ───────────────────────────── Mock data ─────────────────────────────

type Game = {
  id: string;
  month: string;
  when: string;
  place?: number;
  score?: number;
  players: string[];
  unfinished?: boolean;
};

const GAMES: Game[] = [
  {
    id: "g1",
    month: "November 2026",
    when: "Today · 8:14 PM",
    place: 4,
    score: -400,
    players: ["Alice", "Bob", "You", "Dev"],
  },
  {
    id: "g2",
    month: "November 2026",
    when: "Sat, Nov 14 · 9:02 PM",
    place: 1,
    score: 12400,
    players: ["You", "Bob", "Carol", "Former player"],
  },
  {
    id: "g3",
    month: "November 2026",
    when: "Sun, Nov 8 · 7:40 PM",
    place: 2,
    score: 3200,
    players: ["Alice", "You"],
    unfinished: true,
  },
  { id: "g4", month: "November 2026", when: "Mon, Nov 2 · 8:30 PM", players: ["Eun-ji", "Farah", "Gus"] },
  {
    id: "g5",
    month: "October 2026",
    when: "Mon, Oct 26 · 8:14 PM",
    place: 1,
    score: 8800,
    players: ["Priya", "You", "Marco"],
  },
  {
    id: "g6",
    month: "October 2026",
    when: "Mon, Oct 19 · 7:30 PM",
    place: 3,
    score: 1600,
    players: ["Alice", "Bob", "You", "Carol", "Dev"],
  },
  {
    id: "g7",
    month: "October 2026",
    when: "Sun, Oct 11 · 6:05 PM",
    place: 2,
    score: 5000,
    players: ["You", "Marco", "Priya"],
  },
];
const MORE: Game[] = [
  {
    id: "g8",
    month: "September 2026",
    when: "Mon, Sep 28 · 9:15 PM",
    place: 1,
    score: 9200,
    players: ["You", "Alice", "Bob"],
  },
  {
    id: "g9",
    month: "September 2026",
    when: "Sun, Sep 20 · 7:00 PM",
    place: 2,
    score: 4400,
    players: ["Carol", "You", "Gus"],
  },
  {
    id: "g10",
    month: "September 2026",
    when: "Sun, Sep 6 · 8:45 PM",
    place: 4,
    score: -1200,
    players: ["Farah", "Eun-ji", "Dev", "You"],
  },
];

const money = (n: number) => `${n < 0 ? "−" : ""}$${Math.abs(n).toLocaleString("en-US")}`;
const ordinal = (n: number) =>
  `${n}${["th", "st", "nd", "rd"][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10 < 4 ? n % 10 : 0]}`;
const PLACE: Record<number, { c: string; glow: string }> = {
  1: { c: ACCENT, glow: "0 0 18px -2px rgba(107,255,179,.55)" },
  2: { c: "#dfe3f0", glow: "none" },
  3: { c: "#e8ad7a", glow: "none" },
};

// ───────────────────────────── Screens: Home ─────────────────────────────

type HomeState = "guest" | "signed-in" | "signed-out";

function Home({ state, hostAccess, go }: { state: HomeState; hostAccess: boolean; go: (v: View) => void }) {
  const p = usePair();
  const { openSheet, closeSheet, toast } = useOverlay();
  const [code, setCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [joinErr, setJoinErr] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [banner, setBanner] = useState(true);

  function join() {
    if (code.length !== 5 || joining) return;
    setJoinErr(null);
    setJoining(true);
    setTimeout(() => {
      setJoining(false);
      if (code === "ZZZZZ") setJoinErr("No room with that code. Check the TV and try again.");
      else toast(`Joining room ${code}…`);
    }, 900);
  }

  function host() {
    setChecking(true);
    setTimeout(() => {
      setChecking(false);
      openSheet(
        hostAccess ? (
          <NameSheet
            onDone={(n) => {
              closeSheet();
              toast(`Room K7RXM is ready, ${n}.`);
            }}
          />
        ) : (
          <HostCodeSheet
            onUnlocked={() =>
              openSheet(
                <NameSheet
                  onDone={(n) => {
                    closeSheet();
                    toast(`Room K7RXM is ready, ${n}.`);
                  }}
                />,
              )
            }
          />
        ),
      );
    }, 700);
  }

  return (
    <div style={{ position: "relative" }}>
      <div
        style={{
          padding: "54px 16px 0",
          height: 102,
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
        }}
      >
        {state === "signed-in" ? (
          <UnstyledButton
            className="mt-press"
            aria-label="Account"
            onClick={() => go("account")}
            style={{
              width: 40,
              height: 40,
              borderRadius: 999,
              padding: 2,
              background: `conic-gradient(from 200deg, ${ACCENT}, #9161f2, ${SOFT}, ${ACCENT})`,
            }}
          >
            <span
              style={{
                display: "grid",
                placeItems: "center",
                width: "100%",
                height: "100%",
                borderRadius: 999,
                background: "#2a1754",
                ...displayStyle(p, 17, { textTransform: "uppercase", letterSpacing: 0 }),
              }}
            >
              P
            </span>
          </UnstyledButton>
        ) : (
          <Btn kind="secondary" size="sm" onClick={() => toast("Sign-in sheet opens")}>
            Sign in
          </Btn>
        )}
      </div>

      <div className="mt-in" style={{ textAlign: "center", padding: "18px 20px 30px" }}>
        <Wordmark size={54} />
        <p
          className="mt-balance"
          style={{ margin: "14px auto 0", maxWidth: 260, color: QUIET, fontSize: 16, lineHeight: 1.4 }}
        >
          The quiz show for your living room
        </p>
      </div>

      <Stack gap={14} px={16}>
        {state === "signed-out" && banner && (
          <Callout
            tone="warn"
            title="You've been signed out"
            onClose={() => setBanner(false)}
            action={
              <Btn kind="secondary" size="sm" onClick={() => toast("Sign-in sheet opens")}>
                Sign in
              </Btn>
            }
          >
            Sign in to get your games back. You can still play as a guest.
          </Callout>
        )}

        {/* Join: the hero card */}
        <div className="mt-in" style={{ ...SURFACE, borderRadius: 28, padding: 20, animationDelay: "60ms" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
            <Eyebrow>Join a game</Eyebrow>
            <span style={{ fontSize: 13, color: FAINT }}>Enter the code on the TV</span>
          </div>
          <CodeInput
            value={code}
            onChange={(v) => {
              setCode(v);
              setJoinErr(null);
            }}
            error={!!joinErr}
            onSubmit={join}
          />
          {joinErr && (
            <div style={{ marginTop: 10 }}>
              <Hint icon="warn" color={RED}>
                {joinErr}
              </Hint>
            </div>
          )}
          <div style={{ marginTop: 16 }}>
            <Btn full disabled={code.length !== 5} loading={joining} onClick={join} trailing="arrow">
              Join
            </Btn>
          </div>
        </div>

        {/* Host + My games: quiet secondary cards */}
        <div className="mt-in" style={{ ...SURFACE, borderRadius: 24, overflow: "hidden", animationDelay: "120ms" }}>
          <UnstyledButton
            className="mt-row"
            onClick={host}
            disabled={checking}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              width: "100%",
              padding: "16px 16px",
              color: "#fff",
            }}
          >
            <span
              style={{
                width: 44,
                height: 44,
                borderRadius: 14,
                display: "grid",
                placeItems: "center",
                background: "rgba(145,97,242,.22)",
                color: "#c9b3f9",
              }}
            >
              <Icon name="tv" size={22} />
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", fontSize: 17, fontWeight: 650 }}>Host a game</span>
              <span style={{ display: "block", fontSize: 13, color: FAINT, marginTop: 2, lineHeight: 1.35 }}>
                On the device you'll put on the TV
              </span>
            </span>
            {checking ? (
              <span
                className="mt-spin"
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: "50%",
                  border: `2.5px solid ${QUIET}`,
                  borderRightColor: "transparent",
                }}
              />
            ) : (
              <span style={{ color: FAINT }}>
                <Icon name="right" size={20} />
              </span>
            )}
          </UnstyledButton>
          <div style={{ height: 1, background: LINE, marginLeft: 74 }} />
          <UnstyledButton
            className="mt-row"
            onClick={() => go("games")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              width: "100%",
              padding: "16px 16px",
              color: "#fff",
            }}
          >
            <span
              style={{
                width: 44,
                height: 44,
                borderRadius: 14,
                display: "grid",
                placeItems: "center",
                background: "rgba(255,166,217,.14)",
                color: SOFT,
              }}
            >
              <Icon name="history" size={22} />
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", fontSize: 17, fontWeight: 650 }}>My games</span>
              <span style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, color: FAINT, marginTop: 2 }}>
                Last: Today ·<span style={{ ...numStyle(p, 14), color: RED }}>{money(-400)}</span>
              </span>
            </span>
            <span style={{ color: FAINT }}>
              <Icon name="right" size={20} />
            </span>
          </UnstyledButton>
        </div>
      </Stack>
    </div>
  );
}

function NameSheet({ onDone }: { onDone: (name: string) => void }) {
  const [name, setName] = useState("Priya");
  const [busy, setBusy] = useState(false);
  const valid = name.trim().length > 0;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid) return;
        setBusy(true);
        setTimeout(() => onDone(name.trim()), 900);
      }}
    >
      <SheetHead title="What's your name?" sub="Shown on the TV as “Hosted by …”." />
      <Stack gap={18}>
        <Field
          label="Your name"
          value={name}
          onChange={setName}
          maxLength={20}
          counter
          autoFocus
          icon="user"
          error={valid ? null : "Enter a name to continue."}
        />
        <Btn type="submit" full loading={busy} disabled={!valid}>
          Create room
        </Btn>
      </Stack>
    </form>
  );
}

function HostCodeSheet({ onUnlocked }: { onUnlocked: () => void }) {
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setBusy(true);
        setErr(null);
        setTimeout(() => {
          setBusy(false);
          if (code.trim().toUpperCase() === "PARTY") onUnlocked();
          else setErr("That code didn't work. Codes change, so ask for the current one.");
        }, 800);
      }}
    >
      <SheetHead
        title="Enter your host code"
        sub="Hosting is invite-only. Ask the person who runs Schmegettes for a code."
      />
      <Stack gap={18}>
        <Field
          label="Host code"
          placeholder="Try PARTY"
          value={code}
          onChange={(v) => {
            setCode(v);
            setErr(null);
          }}
          autoFocus
          icon="key"
          error={err}
        />
        <Btn type="submit" full loading={busy} disabled={!code.trim()}>
          Unlock hosting
        </Btn>
        <Hint>One code, any device. You'll only enter it once on this phone.</Hint>
      </Stack>
    </form>
  );
}

// ───────────────────────────── Screens: My games ─────────────────────────────

type GamesState = "list" | "guest" | "loading" | "empty" | "error";

function MyGames({ state, go }: { state: GamesState; go: (v: View) => void }) {
  const p = usePair();
  const { toast } = useOverlay();
  const [filter, setFilter] = useState<"all" | "played" | "watched">("all");
  const [games, setGames] = useState(GAMES);
  const [loadingMore, setLoadingMore] = useState(false);
  const [phase, setPhase] = useState<"loading" | "ready">(state === "loading" ? "loading" : "ready");

  useEffect(() => {
    setGames(GAMES);
    setPhase(state === "loading" ? "loading" : "ready");
    if (state !== "loading") return;
    const t = setTimeout(() => setPhase("ready"), 1800);
    return () => clearTimeout(t);
  }, [state]);

  const visible = games.filter((g) =>
    filter === "all" ? true : filter === "watched" ? g.place == null : g.place != null,
  );
  const months = [...new Set(visible.map((g) => g.month))];
  const played = games.filter((g) => g.place != null);
  const wins = played.filter((g) => g.place === 1).length;
  const best = Math.max(...played.map((g) => g.score ?? 0));

  return (
    <PhoneBody title="My games" back={{ label: "Home", onClick: () => go("home") }}>
      <LargeTitle title="My games" />
      {state === "error" ? (
        <div style={{ padding: "40px 24px", textAlign: "center" }}>
          <EmptyArt icon="warn" tint={AMBER} />
          <h2 style={displayStyle(p, 24, { marginTop: 18 })}>Couldn't load your games</h2>
          <p className="mt-pretty" style={{ color: QUIET, fontSize: 15, margin: "10px 0 22px", lineHeight: 1.45 }}>
            Check your connection, then try again.
          </p>
          <Btn kind="secondary" onClick={() => toast("Retrying…")}>
            Try again
          </Btn>
        </div>
      ) : state === "empty" ? (
        <div style={{ padding: "40px 24px", textAlign: "center" }}>
          <EmptyArt icon="history" tint={SOFT} />
          <h2 style={displayStyle(p, 26, { marginTop: 18 })}>No games yet</h2>
          <p
            className="mt-balance"
            style={{ color: QUIET, fontSize: 15, margin: "10px auto 24px", lineHeight: 1.45, maxWidth: 280 }}
          >
            Games you play or watch show up here, with everyone's scores.
          </p>
          <Btn onClick={() => go("home")} trailing="arrow">
            Join a game
          </Btn>
        </div>
      ) : (
        <>
          {/* Summary strip */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, padding: "0 16px 18px" }}>
            {phase === "loading"
              ? [0, 1, 2].map((i) => <div key={i} className="mt-skel" style={{ height: 76, borderRadius: 20 }} />)
              : (
                  [
                    ["Games", String(games.length), "#fff"],
                    ["Wins", String(wins), ACCENT],
                    ["Best", money(best), "#fff"],
                  ] as const
                ).map(([k, v, c], i) => (
                  <div
                    key={k}
                    className="mt-in"
                    style={{ ...SURFACE, borderRadius: 20, padding: "14px 14px 12px", animationDelay: `${i * 50}ms` }}
                  >
                    <div
                      style={{
                        fontSize: 12,
                        color: FAINT,
                        fontWeight: 600,
                        letterSpacing: ".06em",
                        textTransform: "uppercase",
                      }}
                    >
                      {k}
                    </div>
                    <div style={{ ...numStyle(p, 24), color: c, marginTop: 8 }}>{v}</div>
                  </div>
                ))}
          </div>

          {/* Filter */}
          <div style={{ padding: "0 16px 18px" }}>
            <SegmentedControl
              fullWidth
              radius="xl"
              size="sm"
              value={filter}
              onChange={(v) => setFilter(v as typeof filter)}
              data={[
                { value: "all", label: "All" },
                { value: "played", label: "Played" },
                { value: "watched", label: "Watched" },
              ]}
              styles={{
                root: { background: "rgba(255,255,255,.06)", padding: 4 },
                indicator: { background: "rgba(255,255,255,.14)", boxShadow: "inset 0 1px 0 rgba(255,255,255,.12)" },
                label: { color: "#e2d6fc", fontWeight: 600, fontFamily: p.body },
              }}
            />
          </div>

          {phase === "loading" ? (
            <div style={{ padding: "0 16px" }}>
              <div className="mt-skel" style={{ width: 120, height: 12, borderRadius: 6, margin: "0 8px 12px" }} />
              <div style={{ ...SURFACE, borderRadius: 22, overflow: "hidden" }}>
                {[0, 1, 2, 3].map((i) => (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      gap: 12,
                      alignItems: "center",
                      padding: "14px 16px",
                      borderTop: i ? `1px solid ${LINE}` : undefined,
                    }}
                  >
                    <div className="mt-skel" style={{ width: 48, height: 48, borderRadius: 14 }} />
                    <div style={{ flex: 1 }}>
                      <div className="mt-skel" style={{ width: "60%", height: 12, borderRadius: 6 }} />
                      <div className="mt-skel" style={{ width: "85%", height: 10, borderRadius: 5, marginTop: 9 }} />
                    </div>
                    <div className="mt-skel" style={{ width: 54, height: 16, borderRadius: 6 }} />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <Stack gap={22}>
              {months.map((m) => (
                <div key={m}>
                  <SectionLabel>{m}</SectionLabel>
                  <ol
                    aria-label={m}
                    style={{
                      listStyle: "none",
                      margin: "0 16px",
                      padding: 0,
                      borderRadius: 22,
                      overflow: "hidden",
                      ...SURFACE,
                    }}
                  >
                    {visible
                      .filter((g) => g.month === m)
                      .map((g, i) => (
                        <li
                          key={g.id}
                          className="mt-in"
                          style={{ borderTop: i ? `1px solid ${LINE}` : undefined, animationDelay: `${i * 40}ms` }}
                        >
                          <GameRow game={g} onOpen={() => toast(`Opens the ${g.when.split(" ·")[0]} scoreboard`)} />
                        </li>
                      ))}
                  </ol>
                </div>
              ))}
              {visible.length === 0 && (
                <p style={{ textAlign: "center", color: QUIET, fontSize: 15, margin: "20px 24px" }}>
                  No {filter} games.
                </p>
              )}
              {games.length === GAMES.length && (
                <div style={{ display: "flex", justifyContent: "center" }}>
                  <Btn
                    kind="ghost"
                    size="md"
                    loading={loadingMore}
                    onClick={() => {
                      setLoadingMore(true);
                      setTimeout(() => {
                        setGames((g) => [...g, ...MORE]);
                        setLoadingMore(false);
                      }, 900);
                    }}
                  >
                    Show more
                  </Btn>
                </div>
              )}
              {state === "guest" && (
                <div style={{ padding: "0 16px" }}>
                  <Callout
                    tone="info"
                    title="These games live on this phone"
                    action={
                      <Btn kind="secondary" size="sm" onClick={() => toast("Sign-in sheet opens")}>
                        Sign in to keep them
                      </Btn>
                    }
                  >
                    Played without an account. Sign in to keep them on any phone.
                  </Callout>
                </div>
              )}
            </Stack>
          )}
        </>
      )}
    </PhoneBody>
  );
}

function EmptyArt({ icon, tint }: { icon: keyof typeof ICONS; tint: string }) {
  return (
    <div
      style={{
        width: 88,
        height: 88,
        margin: "0 auto",
        borderRadius: 28,
        display: "grid",
        placeItems: "center",
        color: tint,
        background: `radial-gradient(circle at 50% 30%, color-mix(in srgb, ${tint} 28%, transparent), transparent 70%), rgba(255,255,255,.04)`,
        boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${tint} 30%, transparent), 0 20px 40px -16px color-mix(in srgb, ${tint} 50%, transparent)`,
        transform: "rotate(-6deg)",
      }}
    >
      <Icon name={icon} size={38} stroke={1.8} />
    </div>
  );
}

function GameRow({ game, onOpen }: { game: Game; onOpen: () => void }) {
  const p = usePair();
  const placement = game.place;
  const score = game.score ?? 0;
  const watched = placement == null;
  const place = PLACE[placement ?? 0];
  return (
    <UnstyledButton
      className="mt-row"
      onClick={onOpen}
      aria-label={`${game.when}${watched ? ", watched" : `, ${ordinal(placement ?? 0)}, ${money(score)}`}${game.unfinished ? ", unfinished" : ""}`}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        width: "100%",
        padding: "12px 14px 12px 12px",
        color: "#fff",
      }}
    >
      <span
        style={{
          width: 48,
          height: 48,
          flexShrink: 0,
          borderRadius: 14,
          display: "grid",
          placeItems: "center",
          background: watched ? "rgba(255,255,255,.05)" : "linear-gradient(180deg, #3b2075, #2a1754)",
          boxShadow: watched
            ? "inset 0 0 0 1px rgba(255,255,255,.08)"
            : `inset 0 1px 0 rgba(255,255,255,.14), inset 0 -3px 0 rgba(0,0,0,.35), ${place?.glow ?? "none"}`,
          color: watched ? FAINT : (place?.c ?? "#fff"),
        }}
      >
        {watched ? (
          <Icon name="eye" size={20} />
        ) : (
          <span style={numStyle(p, 19, { fontStretch: p.numStretch ? "87%" : undefined })}>
            {ordinal(placement ?? 0)}
          </span>
        )}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span
            style={{
              fontSize: 15,
              fontWeight: 650,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {game.when}
          </span>
          {game.unfinished && <Chip tone="warn">Unfinished</Chip>}
          {watched && <Chip>Watched</Chip>}
        </span>
        <span
          style={{
            display: "block",
            fontSize: 13,
            color: FAINT,
            marginTop: 3,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {game.players.map((n, i) => (
            <span key={n}>
              {i > 0 && ", "}
              <span
                style={{
                  color: n === "You" ? "#ece4ff" : undefined,
                  fontWeight: n === "You" ? 600 : undefined,
                  fontStyle: n === "Former player" ? "italic" : undefined,
                }}
              >
                {n}
              </span>
            </span>
          ))}
        </span>
      </span>
      {!watched && <span style={{ ...numStyle(p, 19), color: score < 0 ? RED : ACCENT }}>{money(score)}</span>}
      <span style={{ color: FAINT, marginLeft: -4 }}>
        <Icon name="right" size={18} />
      </span>
    </UnstyledButton>
  );
}

// ───────────────────────────── Screens: Account ─────────────────────────────

type AccountState = "signed-in" | "guest" | "in-game";

function Account({ state, go }: { state: AccountState; go: (v: View) => void }) {
  const p = usePair();
  const { openSheet, closeSheet, toast } = useOverlay();
  const [name, setName] = useState("Priya");
  const [err, setErr] = useState<string | null>(null);

  if (state === "guest") {
    return (
      <PhoneBody title="Account" back={{ label: "Home", onClick: () => go("home") }}>
        <LargeTitle title="Account" />
        <div style={{ padding: "24px 24px", textAlign: "center" }}>
          <EmptyArt icon="user" tint="#c9b3f9" />
          <h2 style={displayStyle(p, 26, { marginTop: 20 })}>You're playing as a guest</h2>
          <p
            className="mt-balance"
            style={{ color: QUIET, fontSize: 15, margin: "10px auto 24px", lineHeight: 1.45, maxWidth: 290 }}
          >
            An account keeps your games and host access on any phone. Playing stays free of sign-ups.
          </p>
          <Stack gap={10}>
            <Btn full onClick={() => toast("Create-account sheet opens")}>
              Create account
            </Btn>
            <Btn full kind="ghost" onClick={() => toast("Sign-in sheet opens")}>
              I have an account
            </Btn>
          </Stack>
        </div>
      </PhoneBody>
    );
  }

  return (
    <PhoneBody title="Account" back={{ label: "Home", onClick: () => go("home") }}>
      <LargeTitle title="Account" />

      {/* Profile header */}
      <div
        className="mt-in"
        style={{
          margin: "0 16px 24px",
          padding: 18,
          borderRadius: 26,
          display: "flex",
          gap: 16,
          alignItems: "center",
          ...SURFACE,
          background:
            "radial-gradient(120% 120% at 0% 0%, rgba(145,97,242,.35), transparent 60%), rgba(255,255,255,.04)",
        }}
      >
        <span
          style={{
            width: 64,
            height: 64,
            borderRadius: 999,
            padding: 3,
            background: `conic-gradient(from 200deg, ${ACCENT}, #9161f2, ${SOFT}, ${ACCENT})`,
            flexShrink: 0,
          }}
        >
          <span
            style={{
              display: "grid",
              placeItems: "center",
              width: "100%",
              height: "100%",
              borderRadius: 999,
              background: "#2a1754",
              ...displayStyle(p, 28, { textTransform: "uppercase", letterSpacing: 0 }),
            }}
          >
            {name.charAt(0)}
          </span>
        </span>
        <div style={{ minWidth: 0 }}>
          <div style={displayStyle(p, 26)}>{name}</div>
          <div
            style={{
              fontSize: 14,
              color: QUIET,
              marginTop: 6,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            priya.r@example.com
          </div>
        </div>
      </div>

      {err && (
        <div style={{ margin: "0 16px 18px" }}>
          <Callout tone="danger" title="Couldn't delete your account" onClose={() => setErr(null)}>
            {err}
          </Callout>
        </div>
      )}

      <SectionLabel>Profile</SectionLabel>
      <Group_>
        <Row
          icon="user"
          title="Name"
          value={name}
          onClick={() =>
            openSheet(
              <RenameSheet
                initial={name}
                onSaved={(n) => {
                  setName(n);
                  closeSheet();
                  toast("Name saved.");
                }}
              />,
            )
          }
        />
        <Row icon="mail" title="Email" value="priya.r@example.com" />
      </Group_>
      <p className="mt-pretty" style={{ fontSize: 13, color: FAINT, margin: "8px 28px 24px", lineHeight: 1.4 }}>
        Your email is your username. It can't be changed.
      </p>

      <SectionLabel>Security</SectionLabel>
      <Group_>
        <Row
          icon="lock"
          title="Change password"
          onClick={() =>
            openSheet(
              <PasswordSheet
                onDone={() => {
                  closeSheet();
                  toast("Password changed.");
                }}
              />,
            )
          }
        />
        <Row
          icon="out"
          title="Sign out"
          sub="Your games stay in your account"
          onClick={() =>
            openSheet(
              <ConfirmSheet
                kind="sign-out"
                onConfirm={() => {
                  closeSheet();
                  go("home");
                }}
              />,
            )
          }
        />
      </Group_>

      <div style={{ height: 32 }} />
      <Group_>
        <Row
          icon="trash"
          danger
          title="Delete account"
          onClick={() =>
            openSheet(
              <ConfirmSheet
                kind="delete"
                onConfirm={() => {
                  closeSheet();
                  if (state === "in-game") setErr("Finish or leave your game first.");
                  else go("home");
                }}
              />,
            )
          }
        />
      </Group_>
      <p style={{ textAlign: "center", fontSize: 12, color: FAINT, margin: "28px 0 0" }}>Schmegettes · v0.9</p>
    </PhoneBody>
  );
}

function RenameSheet({ initial, onSaved }: { initial: string; onSaved: (n: string) => void }) {
  const [v, setV] = useState(initial);
  const [busy, setBusy] = useState(false);
  const ok = v.trim().length > 0;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!ok) return;
        setBusy(true);
        setTimeout(() => onSaved(v.trim()), 700);
      }}
    >
      <SheetHead title="Your name" sub="Used when you join or host. Past scoreboards keep the name you had then." />
      <Stack gap={18}>
        <Field
          label="Name"
          value={v}
          onChange={setV}
          maxLength={20}
          counter
          autoFocus
          error={ok ? null : "Enter a name."}
        />
        <Btn type="submit" full loading={busy} disabled={!ok || v.trim() === initial}>
          Save
        </Btn>
      </Stack>
    </form>
  );
}

function PasswordSheet({ onDone }: { onDone: () => void }) {
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const ok = cur.length > 0 && next.length >= 8;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!ok) return;
        setBusy(true);
        setErr(null);
        setTimeout(() => {
          setBusy(false);
          if (cur === "wrong") {
            setErr("That password isn't right.");
            setCur("");
          } else onDone();
        }, 900);
      }}
    >
      <SheetHead title="Change password" sub="Type “wrong” as the current password to see the error." />
      <Stack gap={16}>
        <Field
          label="Current password"
          type="password"
          value={cur}
          onChange={(v) => {
            setCur(v);
            setErr(null);
          }}
          autoComplete="current-password"
          autoFocus
          error={err}
        />
        <div>
          <Field label="New password" type="password" value={next} onChange={setNext} autoComplete="new-password" />
          <Strength value={next} />
        </div>
        <Btn type="submit" full loading={busy} disabled={!ok}>
          Save password
        </Btn>
      </Stack>
    </form>
  );
}

function ConfirmSheet({ kind, onConfirm }: { kind: "sign-out" | "delete"; onConfirm: () => void }) {
  const { closeSheet } = useOverlay();
  const [busy, setBusy] = useState(false);
  const del = kind === "delete";
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
        <span
          style={{
            width: 56,
            height: 56,
            borderRadius: 18,
            display: "grid",
            placeItems: "center",
            color: del ? RED : "#c9b3f9",
            background: del ? "rgba(255,107,107,.14)" : "rgba(145,97,242,.2)",
          }}
        >
          <Icon name={del ? "trash" : "out"} size={26} />
        </span>
      </div>
      <SheetCenter
        title={del ? "Delete your account?" : "Sign out?"}
        body={
          del
            ? "Your stats and leaderboard spot are deleted. Past scoreboards will show you as Former player. This can't be undone."
            : "Your games stay in your account. This phone starts fresh as a guest."
        }
      />
      <Stack gap={10} mt={24}>
        <Btn
          full
          kind={del ? "danger-solid" : "primary"}
          loading={busy}
          onClick={() => {
            setBusy(true);
            setTimeout(onConfirm, 800);
          }}
        >
          {del ? "Delete account" : "Sign out"}
        </Btn>
        <Btn full kind="ghost" onClick={closeSheet}>
          Cancel
        </Btn>
      </Stack>
    </div>
  );
}

function SheetCenter({ title, body }: { title: string; body: string }) {
  const p = usePair();
  return (
    <div style={{ textAlign: "center" }}>
      <h2 style={displayStyle(p, 26)}>{title}</h2>
      <p
        className="mt-balance"
        style={{ margin: "10px auto 0", fontSize: 15, color: QUIET, lineHeight: 1.5, maxWidth: 310 }}
      >
        {body}
      </p>
    </div>
  );
}

function PhoneBody({
  title,
  back,
  children,
}: {
  title: string;
  back?: { label: string; onClick: () => void };
  children: ReactNode;
}) {
  return (
    <ScrolledCtx.Consumer>
      {(scrolled) => (
        <>
          <NavBar scrolled={scrolled} title={title} back={back} />
          {children}
        </>
      )}
    </ScrolledCtx.Consumer>
  );
}
const ScrolledCtx = createContext(false);

// ───────────────────────────── Kit sheet (desktop width) ─────────────────────────────

function KitSheet() {
  const p = usePair();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("sam@example");
  const [pw, setPw] = useState("hunter2");
  const [code, setCode] = useState("K7R");
  return (
    <div
      style={{
        background: APP_BG,
        borderRadius: 28,
        padding: 28,
        color: "#fff",
        fontFamily: p.body,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: GRAIN,
          opacity: 0.15,
          mixBlendMode: "overlay",
          pointerEvents: "none",
        }}
      />
      <div style={{ position: "relative" }}>
        <SimpleGrid cols={{ base: 1, md: 2 }} spacing={28}>
          <KitCard
            title="Headers"
            note="Eyebrow → display title → lavender subtitle with balanced wrapping. Large titles collapse into a frosted bar on scroll."
          >
            <Eyebrow>Round 2 · Double Schmegettes</Eyebrow>
            <h1 style={displayStyle(p, 44, { marginTop: 10 })}>My games</h1>
            <p className="mt-balance" style={{ color: QUIET, fontSize: 16, lineHeight: 1.45, margin: "10px 0 22px" }}>
              Every game you played or watched, with everyone's scores.
            </p>
            <div style={{ display: "grid", gap: 14 }}>
              {[
                ["Display", 44, "Schmegettes"],
                ["Title", 32, "Account"],
                ["Headline", 24, "No games yet"],
              ].map(([k, s, t]) => (
                <div key={k as string} style={{ display: "flex", alignItems: "baseline", gap: 16 }}>
                  <span style={{ width: 72, fontSize: 12, color: FAINT, fontWeight: 600 }}>{k}</span>
                  <span style={displayStyle(p, s as number)}>{t}</span>
                </div>
              ))}
              <div style={{ display: "flex", alignItems: "baseline", gap: 16 }}>
                <span style={{ width: 72, fontSize: 12, color: FAINT, fontWeight: 600 }}>Body</span>
                <span style={{ fontSize: 17, lineHeight: 1.45 }}>The quiz show for your living room.</span>
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 16 }}>
                <span style={{ width: 72, fontSize: 12, color: FAINT, fontWeight: 600 }}>Caption</span>
                <span style={{ fontSize: 13, color: FAINT }}>Today · 8:14 PM</span>
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 16 }}>
                <span style={{ width: 72, fontSize: 12, color: FAINT, fontWeight: 600 }}>Numbers</span>
                <span style={{ display: "grid", gap: 4 }}>
                  <span style={{ ...numStyle(p, 30), color: ACCENT }}>$12,400</span>
                  <span style={{ ...numStyle(p, 30), color: RED }}>−$1,200</span>
                  <span style={{ ...numStyle(p, 30), color: "#fff" }}>$8,800</span>
                </span>
              </div>
            </div>
          </KitCard>

          <KitCard
            title="Buttons"
            note="Pill shape, a lit top edge and a soft colored shadow on the main action; tonal secondary; ghost for low-stakes; red only for irreversible. Press scales to 97 %."
          >
            <Stack gap={14}>
              <Group gap={10}>
                <Btn trailing="arrow">Join</Btn>
                <Btn kind="secondary">Host a game</Btn>
                <Btn kind="ghost">Cancel</Btn>
              </Group>
              <Group gap={10}>
                <Btn loading>Join</Btn>
                <Btn disabled>Join</Btn>
                <Btn kind="danger" icon="trash">
                  Delete
                </Btn>
              </Group>
              <Group gap={10} align="center">
                <Btn size="md">Medium</Btn>
                <Btn size="sm" kind="secondary">
                  Small
                </Btn>
                <IconBtn icon="x" label="Close" />
                <IconBtn icon="pen" label="Edit" />
              </Group>
              <Btn full kind="danger-solid">
                Delete account
              </Btn>
            </Stack>
          </KitCard>

          <KitCard
            title="Forms"
            note="Label above, 54 px fields, a green focus ring, hints in faint lavender, errors with an icon and a small shake. One action per form, full width."
          >
            <Stack gap={16}>
              <CodeInput value={code} onChange={setCode} />
              <Field
                label="Your name"
                placeholder="e.g. Priya"
                hint="Shown on the TV as “Hosted by …”."
                value={name}
                onChange={setName}
                maxLength={20}
                counter
                icon="user"
              />
              <Field
                label="Email"
                type="email"
                value={email}
                onChange={setEmail}
                icon="mail"
                error={email.includes(".") ? null : "That doesn't look like an email address."}
              />
              <div>
                <Field label="New password" type="password" value={pw} onChange={setPw} />
                <Strength value={pw} />
              </div>
            </Stack>
          </KitCard>

          <KitCard
            title="Informational text"
            note="Tinted surface + icon chip, never a full-saturation block. Body copy in lavender, pink only for labels. Inline hints for small notes."
          >
            <Stack gap={12}>
              <Callout tone="info" title="These games live on this phone">
                Sign in to keep them on any phone.
              </Callout>
              <Callout tone="success" title="Signed in">
                Added 3 games from this phone.
              </Callout>
              <Callout
                tone="warn"
                title="You've been signed out"
                onClose={() => {}}
                action={
                  <Btn kind="secondary" size="sm">
                    Sign in
                  </Btn>
                }
              >
                Sign in to get your games back.
              </Callout>
              <Callout tone="danger">Couldn't create a room. Try again.</Callout>
              <Hint>Host on the device you'll put on the TV.</Hint>
              <Group gap={6}>
                <Chip tone="accent">Picking</Chip>
                <Chip>Host</Chip>
                <Chip tone="warn">Unfinished</Chip>
              </Group>
            </Stack>
          </KitCard>
        </SimpleGrid>
      </div>
    </div>
  );
}

function KitCard({ title, note, children }: { title: string; note: string; children: ReactNode }) {
  return (
    <div style={{ ...SURFACE, borderRadius: 24, padding: 22 }}>
      <Eyebrow color={ACCENT}>{title}</Eyebrow>
      <p className="mt-pretty" style={{ fontSize: 13, color: FAINT, margin: "6px 0 20px", lineHeight: 1.45 }}>
        {note}
      </p>
      {children}
    </div>
  );
}

// ───────────────────────────── Shell ─────────────────────────────

type View = "home" | "games" | "account" | "kit";

const STATES: Record<Exclude<View, "kit">, { value: string; label: string }[]> = {
  home: [
    { value: "guest", label: "Guest" },
    { value: "signed-in", label: "Signed in" },
    { value: "signed-out", label: "Signed out" },
    { value: "guest-no-host", label: "No host access" },
  ],
  games: [
    { value: "list", label: "List" },
    { value: "guest", label: "Guest" },
    { value: "loading", label: "Loading" },
    { value: "empty", label: "Empty" },
    { value: "error", label: "Error" },
  ],
  account: [
    { value: "signed-in", label: "Signed in" },
    { value: "in-game", label: "Delete fails" },
    { value: "guest", label: "Guest" },
  ],
};

const NOTES: Record<View, string[]> = {
  home: [
    "Join is the hero: five letter boxes (paste works, Enter joins), the one green button on the screen.",
    "Host and My games drop to a quiet grouped card, each with an icon tile and a one-line hint. My games previews the last result.",
    "Wordmark gets a vertical green gradient and a faint glow; the tagline is balanced across lines.",
    "Try code ZZZZZ for the not-found error. Host code is PARTY.",
  ],
  games: [
    "A three-number summary, then a filter, then games grouped under sticky month labels.",
    "Rows sit inside one card with hairline dividers instead of eight floating boxes: calmer, denser, more native.",
    "Placement tiles keep the board bevel; 1st glows green. Watched games get an eye, not a cramped WATCHED label.",
    "Skeletons replace the spinner. Scroll to see the large title collapse into the frosted top bar.",
  ],
  account: [
    "Profile card up top, then settings-style grouped rows with tinted icon tiles.",
    "Delete sits alone at the bottom, red only there. Sign-out and delete confirm in bottom sheets (thumb reach), not centered modals.",
    "Change password: show/hide toggle, a length meter, and an inline error (type “wrong”).",
    "Guest state gets a proper empty state with Create account as the main action.",
  ],
  kit: [
    "Pick a pairing above: every screen and this sheet re-render in it.",
    "Numbers always use tabular figures so scores line up in lists.",
  ],
};

export default function MenusAndType() {
  const [view, setView] = useState<View>("home");
  const [pairId, setPairId] = useState("classic");
  const [sub, setSub] = useState<Record<string, string>>({ home: "guest", games: "list", account: "signed-in" });
  const pair = PAIRS.find((x) => x.id === pairId) ?? PAIRS[0];
  const state = view === "kit" ? "" : sub[view];

  const appTheme = { ...theme, fontFamily: pair.body, headings: { fontFamily: pair.display } };

  return (
    <MantineProvider theme={appTheme} defaultColorScheme="dark">
      <Kit />
      <PairCtx.Provider value={pair}>
        <Stack gap="lg" p="md" maw={1180} mx="auto">
          <Alert color="yellow" title="PROTOTYPE — not production code">
            A sleeker pass on Home, My games and Account, five font pairings, and a kit for headers, informational text,
            buttons and forms. Fonts load from Google Fonts here; production would self-host the winner.
          </Alert>

          {/* Font pairings */}
          <div>
            <Text size="xs" fw={700} tt="uppercase" c="dimmed" mb={8} style={{ letterSpacing: ".1em" }}>
              Font pairing
            </Text>
            <SimpleGrid cols={{ base: 2, sm: 3, lg: 5 }} spacing={10}>
              {PAIRS.map((x) => {
                const on = x.id === pairId;
                return (
                  <UnstyledButton
                    key={x.id}
                    onClick={() => setPairId(x.id)}
                    aria-pressed={on}
                    className="mt-press"
                    style={{
                      padding: 14,
                      borderRadius: 18,
                      textAlign: "left",
                      background: on ? "rgba(107,255,179,.08)" : "rgba(255,255,255,.04)",
                      boxShadow: on ? `inset 0 0 0 1.5px ${ACCENT}` : `inset 0 0 0 1px ${LINE}`,
                      color: "#fff",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                      <span style={displayStyle(x, 30, { lineHeight: 1 })}>Aa</span>
                      <span style={numStyle(x, 20, { color: ACCENT })}>$1,200</span>
                    </div>
                    <div style={{ fontFamily: x.body, fontWeight: 650, fontSize: 13, marginTop: 10 }}>{x.name}</div>
                    <div style={{ fontFamily: x.body, fontSize: 12, color: FAINT, marginTop: 3, lineHeight: 1.35 }}>
                      {x.vibe}
                    </div>
                  </UnstyledButton>
                );
              })}
            </SimpleGrid>
          </div>

          <Group gap="sm" wrap="wrap">
            <SegmentedControl
              value={view}
              onChange={(v) => setView(v as View)}
              data={[
                { value: "home", label: "Home" },
                { value: "games", label: "My games" },
                { value: "account", label: "Account" },
                { value: "kit", label: "Type & kit" },
              ]}
            />
            {view !== "kit" && (
              <SegmentedControl
                size="xs"
                value={state}
                onChange={(v) => setSub((s) => ({ ...s, [view]: v }))}
                data={STATES[view]}
              />
            )}
          </Group>

          {view === "kit" ? (
            <KitSheet />
          ) : (
            <div style={{ display: "flex", gap: 32, flexWrap: "wrap", alignItems: "flex-start" }}>
              <div style={{ flex: "1 1 414px", maxWidth: 414 }}>
                <Fit width={PHONE_W + 24} height={PHONE_H + 24}>
                  <Phone key={`${view}-${state}`}>
                    {(scrolled) => (
                      <ScrolledCtx.Provider value={scrolled}>
                        {view === "home" && (
                          <Home
                            state={(state === "guest-no-host" ? "guest" : state) as HomeState}
                            hostAccess={state !== "guest-no-host"}
                            go={setView}
                          />
                        )}
                        {view === "games" && <MyGames state={state as GamesState} go={setView} />}
                        {view === "account" && <Account state={state as AccountState} go={setView} />}
                      </ScrolledCtx.Provider>
                    )}
                  </Phone>
                </Fit>
              </div>
              <div style={{ flex: "1 1 280px", maxWidth: 520 }}>
                <Text size="xs" fw={700} tt="uppercase" c="dimmed" mb={10} style={{ letterSpacing: ".1em" }}>
                  What changed
                </Text>
                <Stack gap={12}>
                  {NOTES[view].map((n) => (
                    <div key={n} style={{ display: "flex", gap: 10, fontSize: 14, lineHeight: 1.5, color: "#d6cfe6" }}>
                      <span style={{ color: ACCENT, marginTop: 3 }}>
                        <Icon name="check" size={15} stroke={2.6} />
                      </span>
                      <span>{n}</span>
                    </div>
                  ))}
                </Stack>
              </div>
            </div>
          )}
        </Stack>
      </PairCtx.Provider>
    </MantineProvider>
  );
}
