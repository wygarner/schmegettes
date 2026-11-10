import { UnstyledButton } from "@mantine/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { GoldButton } from "../ui/GoldButton";
import { GOLD } from "../ui/tokens";
import { DRAFT_DEBOUNCE_MS } from "./timing";

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const MAX = 200;

/**
 * The host's Final answer, on the stage. The host device is mirrored to the TV, and the iOS
 * keyboard pops up each key as it's pressed, so this keypad replaces it: there is no text
 * input (nothing can open a native keyboard), keys never highlight, and the field shows only
 * dots. Drafts go to the server like the phone's (debounced, always ending with the latest).
 */
export function BlindKeypad({
  onDraft,
  onSubmit,
}: {
  onDraft: (text: string) => void;
  onSubmit: (text: string) => void;
}) {
  const [text, setText] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latest = useRef({ text: "", sent: "", onDraft });
  latest.current.onDraft = onDraft;

  const flush = useCallback(() => {
    clearTimeout(timer.current);
    const l = latest.current;
    if (l.text !== l.sent) {
      l.sent = l.text;
      l.onDraft(l.text);
    }
  }, []);
  // Send the last draft if the keypad goes away (time's up, phase change).
  useEffect(() => flush, [flush]);

  const change = (next: string) => {
    const v = next.slice(0, MAX);
    setText(v);
    latest.current.text = v;
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, DRAFT_DEBOUNCE_MS);
  };

  const submit = () => {
    if (!text.trim()) return;
    clearTimeout(timer.current);
    latest.current.sent = text;
    onSubmit(text);
  };

  const key = (label: string, name: string, onClick: () => void) => (
    <UnstyledButton
      key={name}
      aria-label={name}
      onClick={onClick}
      // No hover, focus ring or pressed state: the TV must not show which key was pressed.
      style={{
        height: "clamp(22px, 8.5cqh, 34px)",
        borderRadius: 6,
        background: "rgba(255,255,255,.08)",
        color: "#fff",
        fontWeight: 700,
        fontSize: "clamp(11px, 4.4cqh, 16px)",
        outline: "none",
        WebkitTapHighlightColor: "transparent",
      }}
    >
      {label}
    </UnstyledButton>
  );

  return (
    <section
      aria-label="Your answer (hidden)"
      style={{ display: "flex", flexDirection: "column", gap: 6, width: "100%" }}
    >
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <output
          aria-label="Answer length"
          style={{
            flex: 1,
            height: 30,
            borderRadius: 8,
            background: "rgba(0,0,0,.3)",
            border: "1px solid rgba(255,255,255,.15)",
            display: "flex",
            alignItems: "center",
            padding: "0 10px",
            color: GOLD,
            letterSpacing: ".2em",
            fontWeight: 800,
            overflow: "hidden",
            whiteSpace: "nowrap",
          }}
        >
          {text ? (
            "•".repeat(Math.min(text.length, 40))
          ) : (
            <span style={{ color: "#7f87e6", letterSpacing: 0, fontWeight: 500, fontSize: 13 }}>
              Type your answer (hidden from the TV)
            </span>
          )}
        </output>
        <GoldButton size="sm" disabled={!text.trim()} onClick={submit}>
          Submit
        </GoldButton>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(14, 1fr)", gap: 4 }}>
        {LETTERS.map((l) => key(l, l, () => change(text + l.toLowerCase())))}
        {key("␣", "Space", () => change(`${text} `))}
        {key("⌫", "Delete", () => change(text.slice(0, -1)))}
      </div>
    </section>
  );
}
