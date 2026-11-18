import { UnstyledButton } from "@mantine/core";
import { useEffect } from "react";
import { Icon } from "./menu";
import { INK } from "./tokens";

/** A short message in a frosted pill at the top of the screen that goes away by itself. */
export function Toast({ message, onClose, ms = 4000 }: { message: string | null; onClose: () => void; ms?: number }) {
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(onClose, ms);
    return () => clearTimeout(timer);
  }, [message, onClose, ms]);
  if (!message) return null;
  return (
    <div
      role="status"
      key={message}
      className="sg-in"
      style={{
        position: "fixed",
        left: 16,
        right: 16,
        top: "max(16px, env(safe-area-inset-top))",
        zIndex: 400,
        maxWidth: 480,
        margin: "0 auto",
        display: "flex",
        gap: 10,
        alignItems: "center",
        padding: "12px 12px 12px 14px",
        borderRadius: 18,
        color: "#fff",
        fontSize: 15,
        fontWeight: 550,
        background: "rgba(36,22,74,.85)",
        backdropFilter: "blur(20px) saturate(1.4)",
        WebkitBackdropFilter: "blur(20px) saturate(1.4)",
        boxShadow: "inset 0 0 0 1px rgba(255,255,255,.12), 0 12px 30px rgba(0,0,0,.45)",
      }}
    >
      <span
        style={{
          width: 24,
          height: 24,
          borderRadius: 999,
          flexShrink: 0,
          display: "grid",
          placeItems: "center",
          background: "var(--mantine-color-teal-4)",
          color: INK,
        }}
      >
        <Icon name="check" size={14} stroke={3} />
      </span>
      <span style={{ flex: 1 }}>{message}</span>
      <UnstyledButton aria-label="Dismiss" onClick={onClose} style={{ color: "#8a7aad", padding: 2 }}>
        <Icon name="x" size={16} />
      </UnstyledButton>
    </div>
  );
}
