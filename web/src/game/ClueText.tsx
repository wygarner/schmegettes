import { DISPLAY } from "../ui/tokens";

/** Clue text sized by its length, so a long clue still fits the 667 × 320 host screen. */
export function ClueText({ text, scale = 1 }: { text: string; scale?: number }) {
  const h = (text.length <= 50 ? 12.5 : text.length <= 85 ? 11 : text.length <= 120 ? 9.5 : 8.2) * scale;
  return (
    <section
      aria-label="Clue"
      style={{
        fontFamily: DISPLAY,
        fontWeight: 500,
        textTransform: "uppercase",
        color: "#fff",
        fontSize: `min(${h}cqh, ${h * 0.55}cqw)`,
        lineHeight: 1.18,
        textShadow: "0 2px 0 rgba(0,0,0,.4)",
        padding: "0 3cqw",
      }}
    >
      {text}
    </section>
  );
}
