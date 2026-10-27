import type { ApiPaths } from "@schmegettes/shared";
import createClient, { type Middleware } from "openapi-fetch";
import { env } from "./env";
import { getAccessToken } from "./supabase";

const auth: Middleware = {
  async onRequest({ request }) {
    request.headers.set("Authorization", `Bearer ${await getAccessToken()}`);
    return request;
  },
};

/** Typed client for api/, generated from shared/openapi.yaml. */
export const api = createClient<ApiPaths>({ baseUrl: env.apiUrl });
api.use(auth);
