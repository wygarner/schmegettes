function required(name: keyof ImportMetaEnv): string {
  const value = import.meta.env[name];
  if (!value) throw new Error(`${name} is not set. Copy web/.env.example to web/.env.local.`);
  return value;
}

export const env = {
  supabaseUrl: required("VITE_SUPABASE_URL"),
  supabaseAnonKey: required("VITE_SUPABASE_ANON_KEY"),
  apiUrl: required("VITE_API_URL"),
  statusUrl: import.meta.env.VITE_STATUS_URL ?? "",
};

declare global {
  interface ImportMetaEnv {
    readonly VITE_SUPABASE_URL: string;
    readonly VITE_SUPABASE_ANON_KEY: string;
    readonly VITE_API_URL: string;
    readonly VITE_STATUS_URL?: string;
  }
}
