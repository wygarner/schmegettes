// The menu screens' kit: Home, My games, Account and the sheets they open
// (docs/product-docs/architecture/design-system.md, "Menu screens").
// Reference: devtools/src/designs/system/menus-and-type.tsx.
import { UnstyledButton } from "@mantine/core";
import { type CSSProperties, type ReactNode, useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router";
import { ACCENT, DISPLAY, FAINT, INK, LINE, MENU_BG, QUIET, RED, SOFT, SURFACE } from "./tokens";

const TEAL = "var(--mantine-color-teal-4)";
const AMBER = "var(--mantine-color-yellow-4)";

// ───────────── Icons (Lucide-style strokes, inline) ─────────────

const ICONS = {
  right: <path d="m9 18 6-6-6-6" />,
  left: <path d="m15 18-6-6 6-6" />,
  x: (
    <>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </>
  ),
  check: <path d="M20 6 9 17l-5-5" />,
  info: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </>
  ),
  warn: (
    <>
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </>
  ),
  tv: (
    <>
      <rect x="2" y="7" width="20" height="15" rx="2" />
      <path d="m17 2-5 5-5-5" />
    </>
  ),
  eye: (
    <>
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  eyeOff: (
    <>
      <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
      <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
      <path d="M6.61 6.61A13.53 13.53 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
      <path d="m2 2 20 20" />
    </>
  ),
  lock: (
    <>
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </>
  ),
  out: (
    <>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5" />
      <path d="M21 12H9" />
    </>
  ),
  trash: (
    <>
      <path d="M3 6h18" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="5" />
      <path d="M20 21a8 8 0 0 0-16 0" />
    </>
  ),
  mail: (
    <>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </>
  ),
  history: (
    <>
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M12 7v5l4 2" />
    </>
  ),
  key: (
    <>
      <path d="m15.5 7.5 2.3 2.3a1 1 0 0 0 1.4 0l2.1-2.1a1 1 0 0 0 0-1.4L19 4" />
      <path d="m21 2-9.6 9.6" />
      <circle cx="7.5" cy="15.5" r="5.5" />
    </>
  ),
  home: (
    <>
      <path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" />
      <path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </>
  ),
  arrow: (
    <>
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </>
  ),
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 20, stroke = 2 }: { name: IconName; size?: number; stroke?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      style={{ flexShrink: 0, display: "block" }}
    >
      {ICONS[name]}
    </svg>
  );
}

export function Spinner({ size = 18, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <span
      className="mn-spin"
      aria-hidden
      style={{
        display: "inline-block",
        width: size,
        height: size,
        borderRadius: "50%",
        border: `2.5px solid ${color}`,
        borderRightColor: "transparent",
        opacity: 0.8,
      }}
    />
  );
}

// ───────────── Type ─────────────

/** Oswald 700, uppercase: large titles, sheet titles, headlines. */
export function display(size: number, extra?: CSSProperties): CSSProperties {
  return {
    fontFamily: DISPLAY,
    fontWeight: 700,
    letterSpacing: ".02em",
    textTransform: "uppercase",
    fontSize: size,
    lineHeight: 1.05,
    margin: 0,
    ...extra,
  };
}

/** Oswald 600 with tabular figures, so scores line up. */
export function numbers(size: number, extra?: CSSProperties): CSSProperties {
  return {
    fontFamily: DISPLAY,
    fontWeight: 600,
    fontVariantNumeric: "tabular-nums",
    fontSize: size,
    lineHeight: 1,
    ...extra,
  };
}

export function Eyebrow({ children, color = SOFT }: { children: ReactNode; color?: string }) {
  return (
    <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".14em", textTransform: "uppercase", color }}>
      {children}
    </div>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div style={{ padding: "0 24px 8px" }}>
      <Eyebrow color={QUIET}>{children}</Eyebrow>
    </div>
  );
}

// ───────────── Screen + top bar ─────────────

type Back = { label: string; to: string };

/**
 * A menu screen: the menu background, a top bar with an optional back link, and a large title
 * that collapses into the frosted top bar once it scrolls away.
 */
export function MenuScreen({
  title,
  back,
  right,
  children,
}: {
  title?: string;
  back?: Back;
  right?: ReactNode;
  children: ReactNode;
}) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 48);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="mn-bg" style={{ minHeight: "100dvh", background: MENU_BG, color: "#fff", position: "relative" }}>
      <div style={{ maxWidth: 520, margin: "0 auto", position: "relative", paddingBottom: 48 }}>
        <div
          style={{
            position: "sticky",
            top: 0,
            zIndex: 10,
            padding: "env(safe-area-inset-top) 12px 0",
            background: scrolled && title ? "rgba(23,13,51,.72)" : "transparent",
            backdropFilter: scrolled && title ? "blur(24px) saturate(1.5)" : undefined,
            WebkitBackdropFilter: scrolled && title ? "blur(24px) saturate(1.5)" : undefined,
            borderBottom: `1px solid ${scrolled && title ? LINE : "transparent"}`,
            transition: "background-color 200ms, border-color 200ms",
          }}
        >
          <div style={{ height: 52, display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center" }}>
            <div>
              {back && (
                <UnstyledButton
                  component={Link}
                  to={back.to}
                  className="mn-press"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 2,
                    color: "#e2d6fc",
                    fontSize: 16,
                    fontWeight: 550,
                    padding: "6px 8px 6px 2px",
                    borderRadius: 999,
                  }}
                >
                  <Icon name="left" size={22} stroke={2.4} />
                  {back.label}
                </UnstyledButton>
              )}
            </div>
            <div
              aria-hidden
              style={{
                ...display(17, { lineHeight: 1 }),
                opacity: scrolled ? 1 : 0,
                transform: scrolled ? "none" : "translateY(4px)",
                transition: "opacity 180ms, transform 180ms",
              }}
            >
              {title}
            </div>
            <div style={{ justifySelf: "end", paddingRight: 4 }}>{right}</div>
          </div>
        </div>
        {title && (
          <div className="sg-in" style={{ padding: "4px 20px 18px" }}>
            <h1 style={display(38)}>{title}</h1>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

// ───────────── Buttons ─────────────

export type ButtonKind = "primary" | "secondary" | "ghost" | "danger" | "danger-solid";

const LOOK: Record<ButtonKind, CSSProperties> = {
  primary: {
    background: "linear-gradient(180deg, #a6ffd2 0%, #6bffb3 45%, #4ff09e 100%)",
    color: INK,
    boxShadow:
      "inset 0 1px 0 rgba(255,255,255,.7), inset 0 -2px 0 rgba(14,128,73,.35), 0 10px 28px -10px rgba(107,255,179,.7)",
  },
  secondary: {
    background: "rgba(145,97,242,.2)",
    color: "#ece4ff",
    boxShadow: "inset 0 0 0 1px rgba(173,140,246,.38), inset 0 1px 0 rgba(255,255,255,.08)",
  },
  ghost: { background: "transparent", color: "#e2d6fc" },
  danger: { background: "rgba(255,107,107,.12)", color: RED, boxShadow: "inset 0 0 0 1px rgba(255,135,135,.25)" },
  "danger-solid": {
    background: "linear-gradient(180deg, #ff8f8f, #fa5252)",
    color: "#fff",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,.35), 0 10px 24px -10px rgba(250,82,82,.7)",
  },
};

const DISABLED: CSSProperties = {
  background: "rgba(255,255,255,.06)",
  color: "rgba(255,255,255,.32)",
  boxShadow: "inset 0 0 0 1px rgba(255,255,255,.06)",
};

/** A pill button. Loading keeps the label (hidden) so the width and the accessible name stay. */
export function MenuButton({
  kind = "primary",
  size = "lg",
  full,
  loading,
  disabled,
  trailing,
  onClick,
  type = "button",
  children,
}: {
  kind?: ButtonKind;
  size?: "lg" | "md" | "sm";
  full?: boolean;
  loading?: boolean;
  disabled?: boolean;
  trailing?: IconName;
  onClick?: () => void;
  type?: "button" | "submit";
  children: ReactNode;
}) {
  const h = { lg: 56, md: 46, sm: 36 }[size];
  const fs = { lg: 17, md: 15, sm: 14 }[size];
  const primary = kind === "primary";
  return (
    <UnstyledButton
      type={type}
      className="mn-press"
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      onClick={onClick}
      style={{
        ...LOOK[kind],
        ...(disabled && !loading ? DISABLED : null),
        position: "relative",
        height: h,
        padding: `0 ${size === "sm" ? 14 : 22}px`,
        width: full ? "100%" : undefined,
        borderRadius: 999,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: primary ? DISPLAY : undefined,
        fontWeight: primary ? 700 : 650,
        fontSize: primary ? Math.round(fs * 1.05) : fs,
        letterSpacing: primary ? ".08em" : "-.005em",
        textTransform: primary ? "uppercase" : "none",
        whiteSpace: "nowrap",
        flexShrink: 0,
      }}
    >
      <span
        style={{ display: "inline-flex", alignItems: "center", gap: 8, visibility: loading ? "hidden" : undefined }}
      >
        {children}
        {trailing && <Icon name={trailing} size={size === "sm" ? 16 : 18} stroke={2.4} />}
      </span>
      {loading && (
        <span style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
          <Spinner />
        </span>
      )}
    </UnstyledButton>
  );
}

export function IconButton({ icon, label, onClick }: { icon: IconName; label: string; onClick?: () => void }) {
  return (
    <UnstyledButton
      className="mn-press"
      aria-label={label}
      onClick={onClick}
      style={{
        width: 36,
        height: 36,
        borderRadius: 999,
        display: "grid",
        placeItems: "center",
        background: "rgba(255,255,255,.08)",
        color: "#e2d6fc",
        flexShrink: 0,
      }}
    >
      <Icon name={icon} size={18} stroke={2.4} />
    </UnstyledButton>
  );
}

// ───────────── Informational text ─────────────

export type Tone = "info" | "success" | "warn" | "danger";
const TONES: Record<Tone, { c: string; bg: string; icon: IconName }> = {
  info: { c: "#c9b3f9", bg: "rgba(145,97,242,.14)", icon: "info" },
  success: { c: TEAL, bg: "rgba(56,217,169,.1)", icon: "check" },
  warn: { c: AMBER, bg: "rgba(255,212,59,.09)", icon: "warn" },
  danger: { c: RED, bg: "rgba(255,107,107,.1)", icon: "warn" },
};

/** An info box: tinted surface, icon chip, optional title, text, action and dismiss. */
export function Callout({
  tone = "info",
  title,
  children,
  action,
  onClose,
}: {
  tone?: Tone;
  title?: string;
  children?: ReactNode;
  action?: ReactNode;
  onClose?: () => void;
}) {
  const t = TONES[tone];
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className="sg-in"
      style={{
        display: "flex",
        gap: 12,
        padding: 14,
        borderRadius: 18,
        background: t.bg,
        boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${t.c} 28%, transparent)`,
        alignItems: "flex-start",
      }}
    >
      <span
        style={{
          width: 28,
          height: 28,
          borderRadius: 999,
          flexShrink: 0,
          display: "grid",
          placeItems: "center",
          background: `color-mix(in srgb, ${t.c} 20%, transparent)`,
          color: t.c,
        }}
      >
        <Icon name={t.icon} size={16} stroke={2.4} />
      </span>
      <div style={{ flex: 1, minWidth: 0, paddingTop: 3 }}>
        {title && <div style={{ fontWeight: 650, fontSize: 15, lineHeight: 1.3 }}>{title}</div>}
        {children && (
          <div className="mn-pretty" style={{ fontSize: 14, color: QUIET, lineHeight: 1.45, marginTop: title ? 3 : 0 }}>
            {children}
          </div>
        )}
        {action && <div style={{ marginTop: 10 }}>{action}</div>}
      </div>
      {onClose && (
        <UnstyledButton aria-label="Dismiss" onClick={onClose} style={{ color: FAINT, padding: 2 }}>
          <Icon name="x" size={18} />
        </UnstyledButton>
      )}
    </div>
  );
}

export function Hint({
  icon = "info",
  color = QUIET,
  children,
}: {
  icon?: IconName;
  color?: string;
  children: ReactNode;
}) {
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "flex-start", fontSize: 13, color, lineHeight: 1.4 }}>
      <span style={{ marginTop: 1 }}>
        <Icon name={icon} size={15} />
      </span>
      <span className="mn-pretty">{children}</span>
    </div>
  );
}

export function Chip({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "accent" | "warn" }) {
  const c = { neutral: "#d6cfe6", accent: ACCENT, warn: AMBER }[tone];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        height: 20,
        padding: "0 8px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: ".04em",
        color: c,
        background: `color-mix(in srgb, ${c} 12%, transparent)`,
        boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${c} 30%, transparent)`,
        whiteSpace: "nowrap",
        flexShrink: 0,
      }}
    >
      {children}
    </span>
  );
}

/** An empty or error state: tilted icon tile, headline, a line of text, one action. */
export function EmptyState({
  icon,
  tint,
  title,
  children,
  action,
}: {
  icon: IconName;
  tint: string;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="sg-in" style={{ padding: "32px 24px", textAlign: "center" }}>
      <div
        style={{
          width: 88,
          height: 88,
          margin: "0 auto",
          borderRadius: 28,
          display: "grid",
          placeItems: "center",
          color: tint,
          background: `radial-gradient(circle at 50% 30%, color-mix(in srgb, ${tint} 28%, transparent), transparent 70%), rgba(255,255,255,.04)`,
          boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${tint} 30%, transparent), 0 20px 40px -16px color-mix(in srgb, ${tint} 50%, transparent)`,
          transform: "rotate(-6deg)",
        }}
      >
        <Icon name={icon} size={38} stroke={1.8} />
      </div>
      <h2 style={display(26, { marginTop: 20 })}>{title}</h2>
      {children && (
        <p
          className="mn-balance"
          style={{ color: QUIET, fontSize: 15, margin: "10px auto 0", lineHeight: 1.45, maxWidth: 290 }}
        >
          {children}
        </p>
      )}
      {action && <div style={{ marginTop: 24 }}>{action}</div>}
    </div>
  );
}

// ───────────── Forms ─────────────

/** A labelled field: label above, hint or error below, a show/hide eye for passwords. */
export function Field({
  label,
  hint,
  error,
  value,
  onChange,
  placeholder,
  type = "text",
  autoFocus,
  maxLength,
  icon,
  counter,
  autoComplete,
  inputProps,
  inputStyle,
}: {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: "text" | "password" | "email";
  autoFocus?: boolean;
  maxLength?: number;
  icon?: IconName;
  counter?: boolean;
  autoComplete?: string;
  inputProps?: React.InputHTMLAttributes<HTMLInputElement>;
  inputStyle?: CSSProperties;
}) {
  const id = useId();
  const [shown, setShown] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const isPassword = type === "password";

  // biome-ignore lint/correctness/useExhaustiveDependencies: focus once, when the field appears
  useEffect(() => {
    if (autoFocus) input.current?.focus({ preventScroll: true });
  }, []);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
        <label htmlFor={id} style={{ fontSize: 14, fontWeight: 600, color: "#ece4ff" }}>
          {label}
        </label>
        {counter && maxLength && (
          <span
            aria-hidden
            style={{
              fontSize: 12,
              color: value.length >= maxLength ? AMBER : FAINT,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {value.length}/{maxLength}
          </span>
        )}
      </div>
      <div
        key={error ?? ""}
        className={`mn-field${error ? " mn-err mn-shake" : ""}`}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          height: 54,
          padding: "0 16px",
          borderRadius: 16,
          background: "rgba(255,255,255,.05)",
          border: `1px solid ${error ? RED : "rgba(255,255,255,.12)"}`,
          color: FAINT,
        }}
      >
        {icon && <Icon name={icon} size={18} />}
        <input
          ref={input}
          id={id}
          type={isPassword ? (shown ? "text" : "password") : type}
          value={value}
          placeholder={placeholder}
          maxLength={maxLength}
          autoComplete={autoComplete}
          aria-invalid={error ? true : undefined}
          aria-describedby={hint || error ? `${id}-d` : undefined}
          onChange={(e) => onChange(e.currentTarget.value)}
          style={inputStyle}
          {...inputProps}
        />
        {isPassword && (
          <UnstyledButton
            aria-label={shown ? "Hide password" : "Show password"}
            onClick={() => setShown((s) => !s)}
            style={{ color: QUIET }}
          >
            <Icon name={shown ? "eyeOff" : "eye"} size={18} />
          </UnstyledButton>
        )}
      </div>
      {(error || hint) && (
        <div id={`${id}-d`} style={{ marginTop: 8 }}>
          {error ? (
            <Hint icon="warn" color={RED}>
              {error}
            </Hint>
          ) : (
            <div style={{ fontSize: 13, color: FAINT, lineHeight: 1.4 }}>{hint}</div>
          )}
        </div>
      )}
    </div>
  );
}

/** A new password's length: four segments toward the minimum and beyond. */
export function Strength({ value, min }: { value: string; min: number }) {
  const n = value.length;
  const level = n === 0 ? 0 : n < min ? 1 : n < 12 ? 2 : n < 16 ? 3 : 4;
  const color = [FAINT, RED, AMBER, TEAL, ACCENT][level];
  const short = min - n;
  const words = ["", `${short} more character${short === 1 ? "" : "s"}`, "Good", "Strong", "Very strong"];
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: "flex", gap: 4 }} aria-hidden>
        {[1, 2, 3, 4].map((i) => (
          <span
            key={i}
            style={{
              flex: 1,
              height: 4,
              borderRadius: 2,
              background: i <= level ? color : "rgba(255,255,255,.1)",
              transition: "background-color 200ms",
            }}
          />
        ))}
      </div>
      <div style={{ fontSize: 12, color: level ? color : FAINT, marginTop: 6 }}>
        {level === 0 ? `At least ${min} characters.` : words[level]}
      </div>
    </div>
  );
}

/** Five letter boxes over one real input: pasting fills them all, Enter submits. */
export function CodeInput({
  value,
  onChange,
  onSubmit,
  error,
  length = 5,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit?: () => void;
  error?: boolean;
  length?: number;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <label
      key={error ? "error" : "ok"}
      className={error ? "mn-shake" : undefined}
      style={{
        position: "relative",
        display: "grid",
        gridTemplateColumns: `repeat(${length}, 1fr)`,
        gap: 8,
        cursor: "text",
      }}
    >
      <input
        aria-label="Room code"
        value={value}
        autoCapitalize="characters"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="go"
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && value.length === length) onSubmit?.();
        }}
        onChange={(e) => onChange(e.currentTarget.value)}
        style={{ position: "absolute", inset: 0, opacity: 0, width: "100%", fontSize: 16 }}
      />
      {Array.from({ length }, (_, i) => {
        const ch = value[i];
        const active = focused && (i === value.length || (value.length === length && i === length - 1));
        return (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: one box per position
            key={i}
            aria-hidden
            style={{
              height: 64,
              borderRadius: 16,
              display: "grid",
              placeItems: "center",
              background: ch ? "rgba(107,255,179,.08)" : "rgba(255,255,255,.05)",
              border: `1px solid ${error ? RED : active ? ACCENT : ch ? "rgba(107,255,179,.35)" : "rgba(255,255,255,.12)"}`,
              boxShadow: active ? "0 0 0 4px rgba(107,255,179,.16)" : "inset 0 1px 0 rgba(255,255,255,.05)",
              transition: "border-color 140ms, box-shadow 140ms, background-color 140ms",
              ...numbers(30, { fontWeight: 700 }),
            }}
          >
            {ch ??
              (active ? (
                <span className="mn-caret" style={{ width: 2, height: 28, background: ACCENT, borderRadius: 1 }} />
              ) : (
                ""
              ))}
          </span>
        );
      })}
    </label>
  );
}

/** Styles for Mantine's SegmentedControl on the menu screens: a frosted track with a lit thumb. */
export const SEGMENTED = {
  root: { background: "rgba(255,255,255,.06)", padding: 4 },
  indicator: { background: "rgba(255,255,255,.14)", boxShadow: "inset 0 1px 0 rgba(255,255,255,.12)" },
  label: { color: "#e2d6fc", fontWeight: 600 },
} as const;

// ───────────── Grouped rows ─────────────

/** Rows in one surface, divided by hairlines. `inset`: 16 px side margins (off inside a padded stack). */
export function GroupList({ children, inset = true }: { children: ReactNode; inset?: boolean }) {
  return (
    <div
      className="mn-group"
      style={{ margin: inset ? "0 16px" : 0, borderRadius: 22, overflow: "hidden", ...SURFACE }}
    >
      {children}
    </div>
  );
}

/** A settings-style row; a button when it has onClick, a link when it has `to`. */
export function Row({
  icon,
  tint = "#c9b3f9",
  title,
  sub,
  value,
  onClick,
  to,
  danger,
  trailing,
}: {
  icon?: IconName;
  tint?: string;
  title: string;
  sub?: ReactNode;
  value?: ReactNode;
  onClick?: () => void;
  to?: string;
  danger?: boolean;
  trailing?: ReactNode;
}) {
  const subId = useId();
  const tappable = Boolean(onClick || to);
  const inner = (
    <>
      {icon && (
        <span
          style={{
            width: 34,
            height: 34,
            borderRadius: 11,
            display: "grid",
            placeItems: "center",
            background: `color-mix(in srgb, ${danger ? RED : tint} 16%, transparent)`,
            color: danger ? RED : tint,
            flexShrink: 0,
          }}
        >
          <Icon name={icon} size={18} />
        </span>
      )}
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 16, fontWeight: 550, color: danger ? RED : "#fff" }}>{title}</span>
        {sub && (
          <span id={subId} style={{ display: "block", fontSize: 13, color: FAINT, marginTop: 2, lineHeight: 1.35 }}>
            {sub}
          </span>
        )}
      </span>
      {value && (
        <span
          style={{
            fontSize: 15,
            color: QUIET,
            maxWidth: "55%",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {value}
        </span>
      )}
      {trailing ??
        (tappable && (
          <span style={{ color: FAINT }}>
            <Icon name="right" size={18} />
          </span>
        ))}
    </>
  );
  const style: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 12,
    width: "100%",
    minHeight: 58,
    padding: "10px 16px",
    color: "#fff",
  };
  // The title names the control; the subtitle describes it.
  const a11y = { "aria-label": title, "aria-describedby": sub ? subId : undefined };
  if (to)
    return (
      <UnstyledButton component={Link} to={to} className="mn-row" style={style} {...a11y}>
        {inner}
      </UnstyledButton>
    );
  if (onClick)
    return (
      <UnstyledButton className="mn-row" onClick={onClick} style={style} {...a11y}>
        {inner}
      </UnstyledButton>
    );
  return <div style={style}>{inner}</div>;
}

// ───────────── Sheets ─────────────

/**
 * A sheet that slides up from the bottom: grab handle, title with a close button, an optional
 * description, then the content. A tap outside or Escape closes it.
 */
export function MenuSheet({
  opened,
  onClose,
  title,
  description,
  centered,
  children,
}: {
  opened: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  /** A confirmation: icon tile, title and text centered. */
  centered?: { icon: IconName; danger?: boolean };
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
        alignItems: "flex-end",
        justifyContent: "center",
      }}
    >
      <UnstyledButton
        aria-label="Close"
        tabIndex={-1}
        onClick={onClose}
        className="mn-fade"
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(8,4,20,.55)",
          backdropFilter: "blur(6px)",
          WebkitBackdropFilter: "blur(6px)",
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="mn-sheet"
        style={{
          position: "relative",
          width: "100%",
          maxWidth: 520,
          maxHeight: "92dvh",
          overflowY: "auto",
          background: "linear-gradient(180deg, #2b1a57 0%, #1d1240 40%, #170d33 100%)",
          color: "#fff",
          borderRadius: "32px 32px 0 0",
          padding: "10px 20px max(32px, env(safe-area-inset-bottom))",
          boxShadow: "0 -1px 0 rgba(255,255,255,.12), 0 -30px 60px rgba(0,0,0,.5)",
        }}
      >
        <div
          style={{ width: 40, height: 5, borderRadius: 3, background: "rgba(255,255,255,.22)", margin: "0 auto 14px" }}
        />
        {centered ? (
          <div style={{ textAlign: "center", marginBottom: 24 }}>
            <span
              style={{
                width: 56,
                height: 56,
                borderRadius: 18,
                margin: "0 auto 16px",
                display: "grid",
                placeItems: "center",
                color: centered.danger ? RED : "#c9b3f9",
                background: centered.danger ? "rgba(255,107,107,.14)" : "rgba(145,97,242,.2)",
              }}
            >
              <Icon name={centered.icon} size={26} />
            </span>
            <h2 className="mn-balance" style={display(26)}>
              {title}
            </h2>
            {description && (
              <p
                className="mn-balance"
                style={{ margin: "10px auto 0", fontSize: 15, color: QUIET, lineHeight: 1.5, maxWidth: 330 }}
              >
                {description}
              </p>
            )}
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 20 }}>
            <div style={{ flex: 1 }}>
              <h2 className="mn-balance" style={display(26)}>
                {title}
              </h2>
              {description && (
                <p className="mn-pretty" style={{ margin: "8px 0 0", fontSize: 15, color: QUIET, lineHeight: 1.45 }}>
                  {description}
                </p>
              )}
            </div>
            <IconButton icon="x" label="Close" onClick={onClose} />
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

/** Avatar: the name's initial in a green–mauve–pink ring. */
export function Avatar({ name, size }: { name: string | null; size: number }) {
  return (
    <span
      aria-hidden
      style={{
        display: "inline-block",
        width: size,
        height: size,
        borderRadius: 999,
        padding: size > 48 ? 3 : 2,
        background: `conic-gradient(from 200deg, ${ACCENT}, #9161f2, ${SOFT}, ${ACCENT})`,
        flexShrink: 0,
      }}
    >
      <span
        style={{
          display: "grid",
          placeItems: "center",
          width: "100%",
          height: "100%",
          borderRadius: 999,
          background: "#2a1754",
          color: "#fff",
          ...display(Math.round(size * 0.44), { letterSpacing: 0, lineHeight: 1 }),
        }}
      >
        {(name ?? "?").charAt(0).toUpperCase()}
      </span>
    </span>
  );
}
