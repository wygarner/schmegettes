// Grafana Faro: web errors, Web Vitals and a few custom events
// (docs/system-docs/operations/observability.md). On only when VITE_FARO_URL is set.
// Privacy (logging-conventions.md §5): no session replay, no fetch tracing, no user set (an
// anonymous session id only), query strings stripped and long values dropped before anything
// leaves the device, so player text (answers, names) never does.
import {
  ConsoleInstrumentation,
  ErrorsInstrumentation,
  type Faro,
  initializeFaro,
  LogLevel,
  SessionInstrumentation,
  type TransportItem,
  WebVitalsInstrumentation,
} from "@grafana/faro-web-sdk";

declare const __COMMIT__: string;

/** Values longer than this are dropped: they are more likely player text than a code. */
export const MAX_VALUE_LENGTH = 500;
export const DROPPED = "[dropped: longer than 500 characters]";

let faro: Faro | undefined;

/** Starts Faro when the build has a collector URL. Returns whether it started. */
export function initFaro(url = import.meta.env.VITE_FARO_URL): boolean {
  if (!url || faro) return Boolean(faro);
  faro = initializeFaro({
    url,
    app: {
      name: "schmegettes-web",
      version: typeof __COMMIT__ === "string" ? __COMMIT__ : "unknown",
      environment: import.meta.env.VITE_ENV ?? (import.meta.env.DEV ? "local" : "production"),
    },
    // Only these: no replay, no fetch/XHR tracing, no performance or user-action capture.
    instrumentations: [
      new ErrorsInstrumentation(),
      new ConsoleInstrumentation(),
      new WebVitalsInstrumentation(),
      new SessionInstrumentation(),
    ],
    consoleInstrumentation: {
      disabledLevels: [LogLevel.TRACE, LogLevel.DEBUG, LogLevel.INFO, LogLevel.LOG],
    },
    sessionTracking: { enabled: true, persistent: false },
    beforeSend: scrub,
  });
  return true;
}

/** Sends a custom event when Faro is on. Attributes must never carry player text. */
export function track(name: string, attributes: Record<string, string> = {}): void {
  faro?.api.pushEvent(name, attributes);
}

const QUERY = /(https?:\/\/[^\s?#"']*)[?#][^\s"']*/g;

/** Removes query strings and fragments from every URL in s. */
export function stripQuery(s: string): string {
  return s.replace(QUERY, "$1");
}

function clean(value: unknown): unknown {
  if (typeof value !== "string") return value;
  return value.length > MAX_VALUE_LENGTH ? DROPPED : stripQuery(value);
}

function cleanRecord(rec: unknown): void {
  if (!rec || typeof rec !== "object") return;
  const r = rec as Record<string, unknown>;
  for (const key of Object.keys(r)) {
    if (typeof r[key] === "string" && (r[key] as string).length > MAX_VALUE_LENGTH) delete r[key];
    else r[key] = clean(r[key]);
  }
}

/** Faro's beforeSend: strips query strings and drops long values from every item. */
export function scrub(item: TransportItem): TransportItem {
  const payload = item.payload as unknown as Record<string, unknown>;
  for (const field of ["value", "message"]) {
    if (field in payload) payload[field] = clean(payload[field]);
  }
  cleanRecord(payload.context);
  cleanRecord(payload.attributes);
  const frames = (payload.stacktrace as { frames?: { filename?: string }[] } | undefined)?.frames;
  for (const frame of frames ?? []) {
    if (frame.filename) frame.filename = stripQuery(frame.filename);
  }
  const page = item.meta.page;
  if (page?.url) page.url = stripQuery(page.url);
  return item;
}

/** Test hook: forgets the running instance. */
export function resetFaroForTests(): void {
  faro = undefined;
}

declare global {
  interface ImportMetaEnv {
    readonly VITE_FARO_URL?: string;
  }
}
