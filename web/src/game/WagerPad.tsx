import { UnstyledButton } from "@mantine/core";
import { useState } from "react";
import { money } from "../lib/money";
import { GoldButton } from "../ui/GoldButton";
import { DISPLAY, GOLD, RED } from "../ui/tokens";

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
  const amount = digits === "" ? undefined : Number(digits);
  const inRange = amount !== undefined && amount >= min && amount <= max;
  const phone = layout === "phone";

  const press = (key: string) => {
    if (key === "⌫") setDigits((d) => d.slice(0, -1));
    else setDigits((d) => String(Number(d + key)).slice(0, 7)); // drops leading zeros
  };

  let hint = masked ? "" : `${money(min)} – ${money(max)}`;
  const bad = amount !== undefined && !inRange;
  if (bad) {
    if (masked) hint = "Out of range";
    else hint = amount > max ? `At most ${money(max)}` : `At least ${money(min)}`;
  }

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
        aria-label="Wager amount"
        style={{
          display: "block",
          fontFamily: DISPLAY,
          fontWeight: 700,
          fontSize: phone ? 58 : "clamp(22px, 11cqh, 40px)",
          lineHeight: 1,
          color: amount === undefined ? "rgba(255,255,255,.28)" : GOLD,
        }}
      >
        {masked ? (amount === undefined ? "$" : "$ •••••") : amount === undefined ? "$" : money(amount)}
      </output>
      {hint && (
        <div
          style={{ marginTop: 6, fontSize: phone ? 14 : 12, fontWeight: bad ? 700 : 500, color: bad ? RED : "#a5abee" }}
        >
          {hint}
        </div>
      )}
    </div>
  );
  const minMax = (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
      {key("Min", () => setDigits(String(min)))}
      {key("Max", () => setDigits(String(max)))}
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
