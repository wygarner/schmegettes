export type EnvironmentName = "local" | "staging" | "production";

export interface EnvironmentConfig {
  name: EnvironmentName;
  label: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  apiUrl: string;
}

const value = (name: string): string => (import.meta.env[name] as string | undefined)?.trim() ?? "";

export const environments: Record<EnvironmentName, EnvironmentConfig> = {
  local: {
    name: "local",
    label: "Local",
    supabaseUrl: value("VITE_LOCAL_SUPABASE_URL"),
    supabaseAnonKey: value("VITE_LOCAL_SUPABASE_ANON_KEY"),
    apiUrl: value("VITE_LOCAL_API_URL"),
  },
  staging: {
    name: "staging",
    label: "Staging",
    supabaseUrl: value("VITE_STAGING_SUPABASE_URL"),
    supabaseAnonKey: value("VITE_STAGING_SUPABASE_ANON_KEY"),
    apiUrl: value("VITE_STAGING_API_URL"),
  },
  production: {
    name: "production",
    label: "Production",
    supabaseUrl: value("VITE_PRODUCTION_SUPABASE_URL"),
    supabaseAnonKey: value("VITE_PRODUCTION_SUPABASE_ANON_KEY"),
    apiUrl: value("VITE_PRODUCTION_API_URL"),
  },
};

export function configured(config: EnvironmentConfig): boolean {
  return Boolean(config.supabaseUrl && config.supabaseAnonKey && config.apiUrl);
}
