/**
 * Client-visible configuration. Only EXPO_PUBLIC_* variables are available here and they
 * are embedded in the app bundle, so they must never contain secrets.
 */
export type ProviderMode = 'mock' | 'real';

export interface ClientEnv {
  supabaseUrl: string | undefined;
  supabaseAnonKey: string | undefined;
  providerMode: ProviderMode;
}

/**
 * Release bundles only contain EXPO_PUBLIC_* values that are read as LITERAL
 * `process.env.EXPO_PUBLIC_X` expressions (inlined at build time). Passing `process.env` around as
 * an object works under Metro in development but is empty in a release build, so the default
 * source spells every variable out.
 */
function bundledEnv(): Record<string, string | undefined> {
  return {
    EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
    EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    EXPO_PUBLIC_PROVIDER_MODE: process.env.EXPO_PUBLIC_PROVIDER_MODE,
  };
}

export function readClientEnv(
  source: Record<string, string | undefined> = bundledEnv(),
): ClientEnv {
  const mode = source.EXPO_PUBLIC_PROVIDER_MODE;
  return {
    supabaseUrl: source.EXPO_PUBLIC_SUPABASE_URL || undefined,
    supabaseAnonKey: source.EXPO_PUBLIC_SUPABASE_ANON_KEY || undefined,
    providerMode: mode === 'real' ? 'real' : 'mock',
  };
}
