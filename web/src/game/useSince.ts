import { useEffect, useState } from "react";

/** Milliseconds since `key` last changed, updated every `every` ms while under `until`. */
export function useSince(key: string, until: number, every = 250): number {
  const [start, setStart] = useState(() => ({ key, at: Date.now() }));
  const [now, setNow] = useState(Date.now());
  if (start.key !== key) setStart({ key, at: Date.now() });
  const since = now - start.at;
  useEffect(() => {
    if (since >= until) return;
    const id = setTimeout(() => setNow(Date.now()), every);
    return () => clearTimeout(id);
  }, [since, until, every]);
  return Math.max(0, since);
}
