import { UnstyledButton } from "@mantine/core";
import { useState } from "react";
import { money } from "../lib/money";
import { GoldButton } from "../ui/GoldButton";
import { ACCENT, DISPLAY, RED } from "../ui/tokens";

const DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

/**
 * A number pad for a wager: digits, backspace, Min and Max. Confirm is disabled until the
 * amount is in range. `layout`: a single column on a phone; on the host device it sits on the
 * stage, amount and confirm on the left, keys on the right. `masked` hides the amount (the
 * host's Final wager, on the TV): a fixed `$ •••••`, keys that never highlight, and a hint
 * that doesn't name the limits.
 */
export function WagerPad({
  min,
  max,
  masked = false,
  layout = "phone",
  confirmLabel,
  onWager,
}: {
  min: number;
  max: number;
  masked?: boolean;
  layout?: "phone" | "stage";
  confirmLabel: string;
  onWager: (amount: number) => void;
}) {
  const [digits, setDigits] = useState("");
  // How many digits in a row were refused for going past the limit; it replays the shake.
  const [refused, setRefused] = useState(0);
  const amount = digits === "" ? undefined : Number(digits);
  const inRange = amount !== undefined && amount >= min && amount <= max;
  const phone = layout === "phone";

  const set = (next: string) => {
    setRefused(0);
    setDigits(next);
  };
  const press = (key: string) => {
    if (key === "⌫") return set(digits.slice(0, -1));
    const next = String(Number(digits + key)); // drops leading zeros
    // A digit that would pass the limit isn't added: the amount shakes instead.
    if (Number(next) > max) setRefused((n) => n + 1);
    else set(next);
  };

  let hint = masked ? "" : `${money(min)} – ${money(max)}`;
  const bad = refused > 0 || (amount !== undefined && !inRange);
  if (refused > 0) hint = masked ? "Over the limit" : `At most ${money(max)}`;
  else if (bad) hint = masked ? "Out of range" : `At least ${money(min)}`;

  const key = (label: string, onClick: () => void, name = label) => (
    <UnstyledButton
      key={name}
      aria-label={name}
      onClick={onClick}
      className={masked ? "sg-key-still" : "sg-key"}
      style={{
        height: phone ? 54 : "clamp(26px, 9cqh, 40px)",
        borderRadius: 12,
        color: "#fff",
        fontFamily: DISPLAY,
        fontWeight: 600,
        fontSize: label.length > 1 ? (phone ? 16 : 13) : phone ? 24 : 18,
        letterSpacing: label.length > 1 ? ".08em" : 0,
        textTransform: "uppercase",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "transform 60ms",
      }}
    >
      {label}
    </UnstyledButton>
  );

  const display = (
    <div style={{ textAlign: phone ? "center" : "left" }}>
      <output
        key={refused}
        aria-label="Wager amount"
        className={refused > 0 ? "sg-shake" : undefined}
        style={{
          display: "block",
          fontFamily: DISPLAY,
          fontWeight: 700,
          fontSize: phone ? 58 : "clamp(22px, 11cqh, 40px)",
          lineHeight: 1,
          color: amount === undefined ? "rgba(255,255,255,.28)" : ACCENT,
        }}
      >
        {masked ? (amount === undefined ? "$" : "$ •••••") : amount === undefined ? "$" : money(amount)}
      </output>
      {hint && (
        <div
          style={{ marginTop: 6, fontSize: phone ? 14 : 12, fontWeight: bad ? 700 : 500, color: bad ? RED : "#d6a3c8" }}
        >
          {hint}
        </div>
      )}
    </div>
  );
  const minMax = (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
      {key("Min", () => set(String(min)))}
      {key("Max", () => set(String(max)))}
    </div>
  );
  const pad = (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: phone ? 8 : 6 }}>
      {DIGITS.map((d) => key(d, () => press(d)))}
      <span />
      {key("0", () => press("0"))}
      {key("⌫", () => press("⌫"), "Delete")}
    </div>
  );
  const confirm = (
    <GoldButton
      size={phone ? "xl" : "md"}
      fullWidth
      disabled={!inRange}
      onClick={() => amount !== undefined && onWager(amount)}
    >
      {confirmLabel}
    </GoldButton>
  );

  if (phone) {
    return (
      <section aria-label="Wager" style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%" }}>
        {display}
        {minMax}
        {pad}
        {confirm}
      </section>
    );
  }
  return (
    <section
      aria-label="Wager"
      style={{ display: "grid", gridTemplateColumns: "1fr 1.1fr", gap: 14, alignItems: "center", width: "100%" }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {display}
        {minMax}
        {confirm}
      </div>
      {pad}
    </section>
  );
}
