import { ACCENT } from "./tokens";

/** A microphone level look-alike: five bars bouncing. Decorative. */
export function Meter({ color = ACCENT, height = 20 }: { color?: string; height?: number }) {
  return (
    <span aria-hidden style={{ display: "inline-flex", alignItems: "center", gap: 3, height, flexShrink: 0 }}>
      {[0, 1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className="sg-meter-bar"
          style={{
            width: 4,
            height: "100%",
            borderRadius: 2,
            background: color,
            animationDuration: `${650 + i * 90}ms`,
            animationDelay: `${i * 110}ms`,
          }}
        />
      ))}
    </span>
  );
}
