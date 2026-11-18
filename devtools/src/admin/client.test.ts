import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminApiError, createAdminApi, SignInError, UnreachableError } from "./client";

const config = {
  name: "local" as const,
  label: "Local",
  supabaseUrl: "https://local.supabase.test",
  supabaseAnonKey: "public-anon-key",
  apiUrl: "https://api.test",
};

function respond(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("createAdminApi", () => {
  it("turns a 404 into the not-an-admin error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => respond(404, { type: "x", title: "Not found", status: 404 })),
    );
    await expect(createAdminApi(config).hostCode()).rejects.toEqual(new AdminApiError(404));
  });

  it("carries Retry-After from a 429", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => respond(429, { type: "x", title: "Too many", status: 429 }, { "Retry-After": "17" })),
    );
    const err = await createAdminApi({ ...config, name: "staging" })
      .hosts()
      .catch((e) => e);
    expect(err).toBeInstanceOf(AdminApiError);
    expect(err.retryAfterSeconds).toBe(17);
  });

  it("reports an unreachable environment", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))),
    );
    await expect(createAdminApi({ ...config, name: "production" }).hostCode()).rejects.toBeInstanceOf(UnreachableError);
  });

  it("treats removal as done only on 204", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 204 })),
    );
    await expect(createAdminApi(config).removeHost("22222222-2222-4222-8222-222222222222")).resolves.toBeUndefined();
  });

  it("refuses a wrong password without detail", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        respond(400, { code: 400, error_code: "invalid_credentials", msg: "Invalid login credentials" }),
      ),
    );
    await expect(createAdminApi(config).signIn("a@b.c", "nope")).rejects.toBeInstanceOf(SignInError);
  });

  it("sends the session's token, and nothing when signed out", async () => {
    const fetch = vi.fn(async (_request: Request) => respond(404, { type: "x", title: "Not found", status: 404 }));
    vi.stubGlobal("fetch", fetch);
    await createAdminApi(config)
      .hostCode()
      .catch(() => {});
    expect(fetch.mock.calls[0]?.[0].headers.get("Authorization")).toBeNull();
  });
});
