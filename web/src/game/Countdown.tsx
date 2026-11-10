import { useEffect, useState } from "react";
import { GOLD } from "../ui/tokens";

/** A bar that empties until deadlineAt (server ms). Hidden when there is no deadline. */
export function Countdown({
  deadlineAt,
  total,
  color = GOLD,
  height = 6,
}: {
  deadlineAt?: number;
  total: number;
  color?: string;
  height?: number;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!deadlineAt) return;
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [deadlineAt]);
  if (!deadlineAt) return null;
  const left = Math.max(0, deadlineAt - now);
  const pct = Math.min(100, (left / total) * 100);
  return (
    <div
      role="progressbar"
      aria-label="Time left"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      style={{
        height,
        borderRadius: height,
        background: "rgba(255,255,255,.12)",
        overflow: "hidden",
        flexShrink: 0,
        width: "100%",
      }}
    >
      <div style={{ height: "100%", width: `${pct}%`, background: color, transition: "width 100ms linear" }} />
    </div>
  );
}
