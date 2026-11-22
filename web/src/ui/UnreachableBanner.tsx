import { env } from "../lib/env";
import type { HealthState } from "../lib/notices";
import { QUIET, SURFACE } from "./tokens";

export function UnreachableBanner({ state }: { state: Exclude<HealthState, "healthy"> }) {
  if (state === "offline") {
    return (
      <div role="status" style={{ ...SURFACE, borderRadius: 18, padding: "14px 16px", color: QUIET }}>
        You're offline.
      </div>
    );
  }
  return (
    <div
      role="alert"
      style={{
        ...SURFACE,
        borderRadius: 18,
        padding: "14px 16px",
        display: "flex",
        gap: 12,
        justifyContent: "space-between",
      }}
    >
      <span>Can't reach Schmegettes right now. If other sites work, it's not your connection.</span>
      {env.statusUrl && (
        <a
          href={env.statusUrl}
          target="_blank"
          rel="noreferrer"
          style={{ color: "#b99aff", whiteSpace: "nowrap", fontWeight: 750 }}
        >
          Status ›
        </a>
      )}
    </div>
  );
}
