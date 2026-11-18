// The design system's tokens (docs/product-docs/architecture/design-system.md).
// Palette: light mauve #9161F2 (backgrounds, as a deep mauve scale), Venice green #6BFFB3
// (accent), Corinthian pink #FFA6D9 (secondary text). The buzzer stays red.

export const DISPLAY = "Oswald, Impact, sans-serif";
/** The accent: values, scores, the control ring, the main action. Venice green #6BFFB3. */
export const ACCENT = "var(--mantine-color-green-4)";
/** Text on the accent: the darkest mauve. */
export const INK = "#140b2b";
/** Board cells and category headers: deep mauve. */
export const CELL = "var(--mantine-color-mauve-9)";
/** Secondary text and labels on mauve: Corinthian pink. */
export const SOFT = "#ffa6d9";
/** Quieter secondary text (dates, hints). */
export const MUTED = "#d6a3c8";
/** Placeholder and "listening…" text. */
export const DIM = "#9a7aad";
/** The host screen behind the stage and board. */
export const NIGHT = "#140b2b";
export const STAGE_BG = "radial-gradient(120% 140% at 50% 0%, #5a36b4 0%, #2a1754 45%, #1a0f38 100%)";
export const PHONE_BG = "linear-gradient(180deg, #4a2b94 0%, #261650 38%, #140b2b 100%)";
export const TILE_BG = "linear-gradient(180deg, #3d2478 0%, #2a1754 55%, #22124a 100%)";
export const BEVEL = "inset 0 1px 0 rgba(255,255,255,.14), inset 0 -3px 0 rgba(0,0,0,.35)";
/** Correct verdicts. Mantine teal, so right/wrong still reads at a glance. */
export const GREEN = "var(--mantine-color-teal-4)";
export const RED = "var(--mantine-color-red-4)";

// Menu screens: Home, My games, Account and their sheets (design-system.md, "Menu screens").
/** Secondary body text on the menu screens: subtitles, sheet descriptions, info-box text. */
export const QUIET = "#b8a8d8";
/** Captions, hints under fields, chevrons. */
export const FAINT = "#8a7aad";
/** Hairlines on and between surfaces. */
export const LINE = "rgba(255,255,255,.08)";
export const AMBER = "var(--mantine-color-yellow-4)";
/** The menu background: a light-mauve glow at the top, a faint pink one top right, over NIGHT. */
export const MENU_BG = [
  "radial-gradient(90% 45% at 50% -8%, rgba(145,97,242,.55) 0%, rgba(145,97,242,0) 70%)",
  "radial-gradient(60% 30% at 105% 4%, rgba(255,166,217,.16) 0%, rgba(255,166,217,0) 70%)",
  "linear-gradient(180deg, #24134d 0%, #170d33 45%, #140b2b 100%)",
].join(", ");
/** Cards and grouped lists on the menu screens. */
export const SURFACE = {
  background: "linear-gradient(180deg, rgba(255,255,255,.07) 0%, rgba(255,255,255,.035) 100%)",
  border: `1px solid ${LINE}`,
  boxShadow: "inset 0 1px 0 rgba(255,255,255,.06), 0 10px 30px -12px rgba(0,0,0,.6)",
} as const;
