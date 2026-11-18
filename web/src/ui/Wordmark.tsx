import { ACCENT, DISPLAY } from "./tokens";

/** SCHMEGETTES in the accent. `gradient`: the menu screens' version, a vertical green gradient with a faint glow. */
export function Wordmark({ size, gradient }: { size: number | string; gradient?: boolean }) {
  return (
    <span
      style={{
        fontFamily: DISPLAY,
        fontWeight: 700,
        fontSize: size,
        lineHeight: 1,
        letterSpacing: ".04em",
        ...(gradient
          ? {
              display: "inline-block",
              background: "linear-gradient(180deg, #d9ffec 0%, #8affc3 35%, #6bffb3 60%, #36d986 100%)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
              filter: "drop-shadow(0 3px 0 rgba(0,0,0,.45)) drop-shadow(0 0 24px rgba(107,255,179,.25))",
            }
          : { color: ACCENT, textShadow: "0 3px 0 rgba(0,0,0,.45)" }),
      }}
    >
      SCHMEGETTES
    </span>
  );
}
