import type { TransportItem } from "@grafana/faro-web-sdk";
import { afterEach, expect, test, vi } from "vitest";

const initializeFaro = vi.fn((_config: unknown) => ({ api: { pushEvent: vi.fn() } }));
vi.mock("@grafana/faro-web-sdk", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@grafana/faro-web-sdk")>()),
  initializeFaro: (config: unknown) => initializeFaro(config),
}));

const { DROPPED, initFaro, resetFaroForTests, scrub, stripQuery, track } = await import("./faro");

afterEach(() => {
  resetFaroForTests();
  initializeFaro.mockClear();
});

function item(payload: Record<string, unknown>, url = "https://schmegettes.test/join/ABCDE?code=1#x"): TransportItem {
  return { type: "exception", payload, meta: { page: { url } } } as unknown as TransportItem;
}

test("Faro stays off without VITE_FARO_URL", () => {
  expect(initFaro("")).toBe(false);
  expect(initializeFaro).not.toHaveBeenCalled();
  track("socket_reconnect"); // a no-op, not a throw
});

test("Faro starts with errors, console, web vitals and session only: no replay, no tracing", () => {
  expect(initFaro("https://faro.test/collect/abc")).toBe(true);
  const [config] = initializeFaro.mock.calls[0] as unknown as [
    { app: { name: string; version: string }; instrumentations: { name: string }[]; beforeSend: unknown },
  ];
  expect(config.app.name).toBe("schmegettes-web");
  expect(config.app.version).toBeTruthy();
  expect(config.beforeSend).toBe(scrub);
  const names = config.instrumentations.map((i) => i.name).join(",");
  expect(names).toMatch(/errors/);
  expect(names).toMatch(/console/);
  expect(names).toMatch(/web-vitals|webVitals/i);
  expect(names).toMatch(/session/);
  expect(names).not.toMatch(/replay|tracing|performance|user-action/i);
  expect(config).not.toHaveProperty("user");
});

test("stripQuery removes query strings and fragments from URLs", () => {
  expect(stripQuery("at https://a.test/x.js?v=1:2:3 and https://b.test/p#frag")).toBe(
    "at https://a.test/x.js and https://b.test/p",
  );
});

test("scrub strips query strings and drops values longer than 500 characters", () => {
  const long = "a".repeat(501);
  const out = scrub(
    item({
      value: "failed to fetch https://api.test/v1/rooms?code=ABCDE",
      context: { short: "ok", long, url: "https://x.test/?token=t" },
      stacktrace: { frames: [{ filename: "https://app.test/assets/index.js?v=2" }] },
    }),
  );
  const p = out.payload as unknown as {
    value: string;
    context: Record<string, string>;
    stacktrace: { frames: { filename: string }[] };
  };
  expect(p.value).toBe("failed to fetch https://api.test/v1/rooms");
  expect(p.context).toEqual({ short: "ok", url: "https://x.test/" });
  expect(p.stacktrace.frames[0]?.filename).toBe("https://app.test/assets/index.js");
  expect(out.meta.page?.url).toBe("https://schmegettes.test/join/ABCDE");

  const tooLong = scrub(item({ message: long }));
  expect((tooLong.payload as unknown as { message: string }).message).toBe(DROPPED);
});
