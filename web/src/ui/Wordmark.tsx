import { ACCENT, DISPLAY } from "./tokens";

export function Wordmark({ size }: { size: number | string }) {
  return (
    <span
      style={{
        fontFamily: DISPLAY,
        fontWeight: 700,
        fontSize: size,
        lineHeight: 1,
        color: ACCENT,
        letterSpacing: ".04em",
        textShadow: "0 3px 0 rgba(0,0,0,.45)",
      }}
    >
      SCHMEGETTES
    </span>
  );
}
