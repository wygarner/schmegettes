// The admin page's only way to reach an environment: Supabase Auth (email + password) and the
// api's /v1/admin routes. Tokens stay inside the Supabase client and the Authorization header.
import type { ApiComponents, ApiPaths } from "@schmegettes/shared";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import createOpenApiClient, { type Client } from "openapi-fetch";
import type { EnvironmentConfig } from "./env";

export type AdminHost = ApiComponents["schemas"]["AdminHost"];
export type AdminHostCode = ApiComponents["schemas"]["AdminHostCode"];
export type AdminNotice = ApiComponents["schemas"]["AdminNotice"];
export type NoticeInput = ApiComponents["schemas"]["NoticeInput"];
export type NoticePatch = ApiPaths["/v1/admin/notices/{id}"]["patch"]["requestBody"]["content"]["application/json"];

/** The api answered with an error status. 404 covers every "not an admin here" case. */
export class AdminApiError extends Error {
  constructor(
    readonly status: number,
    readonly retryAfterSeconds = 0,
  ) {
    super(`Admin API returned ${status}`);
  }
}

/** The environment could not be reached at all. */
export class UnreachableError extends Error {}

/** Email and password were refused. Deliberately carries no detail. */
export class SignInError extends Error {}

export interface AdminApi {
  signIn(email: string, password: string): Promise<{ email: string }>;
  /** The signed-in account's email, or null when there is no session. */
  currentEmail(): Promise<string | null>;
  signOut(): Promise<void>;
  hostCode(): Promise<AdminHostCode>;
  hosts(): Promise<AdminHost[]>;
  rotate(expectedCode: string): Promise<AdminHostCode>;
  setNote(userId: string, note: string | null): Promise<AdminHost>;
  removeHost(userId: string): Promise<void>;
  notices(days?: number): Promise<AdminNotice[]>;
  postNotice(input: NoticeInput): Promise<AdminNotice>;
  editNotice(id: string, patch: NoticePatch): Promise<AdminNotice>;
  resolveNotice(id: string, resolution: string): Promise<AdminNotice>;
  syncNotice(id: string): Promise<AdminNotice>;
}

function failure(response: Response): never {
  const retry = Number(response.headers.get("Retry-After") ?? 0);
  throw new AdminApiError(response.status, Number.isFinite(retry) ? retry : 0);
}

// fetch rejects (instead of resolving with a status) when the host can't be reached.
async function reach<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (err) {
    if (err instanceof TypeError) throw new UnreachableError();
    throw err;
  }
}

/** A client for one environment. Each environment keeps its own session in localStorage. */
export function createAdminApi(config: EnvironmentConfig): AdminApi {
  const auth: SupabaseClient = createSupabaseClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: { storageKey: `schmegettes-admin-${config.name}`, persistSession: true, autoRefreshToken: true },
  });
  const api: Client<ApiPaths> = createOpenApiClient<ApiPaths>({ baseUrl: config.apiUrl });
  api.use({
    async onRequest({ request }) {
      const { data } = await auth.auth.getSession();
      if (data.session) request.headers.set("Authorization", `Bearer ${data.session.access_token}`);
      return request;
    },
  });

  return {
    async signIn(email, password) {
      const { data, error } = await reach(() => auth.auth.signInWithPassword({ email, password }));
      if (error?.status === 0 || error?.name === "AuthRetryableFetchError") throw new UnreachableError();
      if (error || !data.user?.email) throw new SignInError();
      return { email: data.user.email };
    },
    async currentEmail() {
      const { data } = await auth.auth.getSession();
      return data.session?.user.email ?? null;
    },
    async signOut() {
      await auth.auth.signOut({ scope: "local" });
    },
    async hostCode() {
      const result = await reach(() => api.GET("/v1/admin/host-code"));
      if (!result.data) failure(result.response);
      return result.data;
    },
    async hosts() {
      const result = await reach(() => api.GET("/v1/admin/hosts"));
      if (!result.data) failure(result.response);
      return result.data.hosts;
    },
    async rotate(expectedCode) {
      const result = await reach(() => api.POST("/v1/admin/host-code/rotate", { body: { expectedCode } }));
      if (!result.data) failure(result.response);
      return result.data;
    },
    async setNote(userId, note) {
      const result = await reach(() =>
        api.PATCH("/v1/admin/hosts/{userId}", { params: { path: { userId } }, body: { note } }),
      );
      if (!result.data) failure(result.response);
      return result.data;
    },
    async removeHost(userId) {
      const result = await reach(() => api.DELETE("/v1/admin/hosts/{userId}", { params: { path: { userId } } }));
      if (result.response.status !== 204) failure(result.response);
    },
    async notices(days = 30) {
      const result = await reach(() => api.GET("/v1/admin/notices", { params: { query: { days } } }));
      if (!result.data) failure(result.response);
      return result.data;
    },
    async postNotice(input) {
      const result = await reach(() => api.POST("/v1/admin/notices", { body: input }));
      if (!result.data) failure(result.response);
      return result.data;
    },
    async editNotice(id, patch) {
      const result = await reach(() => api.PATCH("/v1/admin/notices/{id}", { params: { path: { id } }, body: patch }));
      if (!result.data) failure(result.response);
      return result.data;
    },
    async resolveNotice(id, resolution) {
      const result = await reach(() =>
        api.POST("/v1/admin/notices/{id}/resolve", { params: { path: { id } }, body: { resolution } }),
      );
      if (!result.data) failure(result.response);
      return result.data;
    },
    async syncNotice(id) {
      const result = await reach(() => api.POST("/v1/admin/notices/{id}/sync", { params: { path: { id } } }));
      if (!result.data) failure(result.response);
      return result.data;
    },
  };
}
