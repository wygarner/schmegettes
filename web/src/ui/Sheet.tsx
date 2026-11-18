import { UnstyledButton } from "@mantine/core";
import { type ReactNode, useEffect } from "react";

/**
 * A dialog inside the screen: centered on the host device, sliding up from the bottom on
 * phones (thumb reach). A tap outside or Escape closes it.
 */
export function Sheet({
  opened,
  onClose,
  bottom = false,
  label,
  children,
}: {
  opened: boolean;
  onClose: () => void;
  bottom?: boolean;
  label?: string;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!opened) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [opened, onClose]);

  if (!opened) return null;
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 300,
        display: "flex",
        alignItems: bottom ? "flex-end" : "center",
        justifyContent: "center",
        padding: bottom ? 0 : 16,
      }}
    >
      <UnstyledButton
        aria-label="Close"
        tabIndex={-1}
        onClick={onClose}
        style={{ position: "absolute", inset: 0, background: "rgba(2,3,20,.7)" }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className={bottom ? "sg-in" : "sg-pop"}
        style={{
          position: "relative",
          width: bottom ? "100%" : 360,
          maxWidth: bottom ? 520 : "100%",
          background: "#0b0e3d",
          color: "#fff",
          borderRadius: bottom ? "24px 24px 0 0" : 16,
          padding: bottom ? "22px 20px max(28px, env(safe-area-inset-bottom))" : 18,
          boxShadow: "0 0 0 1px rgba(255,255,255,.1), 0 20px 40px rgba(0,0,0,.5)",
        }}
      >
        {children}
      </div>
    </div>
  );
}
