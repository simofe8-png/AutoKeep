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

export function readClientEnv(source: Record<string, string | undefined> = process.env): ClientEnv {
  const mode = source.EXPO_PUBLIC_PROVIDER_MODE;
  return {
    supabaseUrl: source.EXPO_PUBLIC_SUPABASE_URL || undefined,
    supabaseAnonKey: source.EXPO_PUBLIC_SUPABASE_ANON_KEY || undefined,
    providerMode: mode === 'real' ? 'real' : 'mock',
  };
}
