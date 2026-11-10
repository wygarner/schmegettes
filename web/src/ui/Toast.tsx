import { Notification } from "@mantine/core";
import { useEffect } from "react";

/** A short message at the bottom of the screen that goes away by itself. */
export function Toast({ message, onClose, ms = 4000 }: { message: string | null; onClose: () => void; ms?: number }) {
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(onClose, ms);
    return () => clearTimeout(timer);
  }, [message, onClose, ms]);
  if (!message) return null;
  return (
    <Notification
      role="status"
      withBorder
      onClose={onClose}
      style={{ position: "fixed", left: 16, right: 16, bottom: 16, zIndex: 400, maxWidth: 480, margin: "0 auto" }}
    >
      {message}
    </Notification>
  );
}
