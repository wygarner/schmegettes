import { Progress } from "@mantine/core";
import { useEffect, useState } from "react";

/** A bar that empties until deadlineAt (server ms). Hidden when there is no deadline. */
export function Countdown({ deadlineAt, total }: { deadlineAt?: number; total: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!deadlineAt) return;
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [deadlineAt]);
  if (!deadlineAt) return null;
  const left = Math.max(0, deadlineAt - now);
  return <Progress value={Math.min(100, (left / total) * 100)} size="sm" aria-label="Time left" />;
}
