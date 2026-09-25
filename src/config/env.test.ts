import { readClientEnv } from './env';

describe('readClientEnv', () => {
  it('defaults to mock providers and undefined cloud config', () => {
    expect(readClientEnv({})).toEqual({
      supabaseUrl: undefined,
      supabaseAnonKey: undefined,
      providerMode: 'mock',
    });
  });

  it('only accepts "real" explicitly', () => {
    expect(readClientEnv({ EXPO_PUBLIC_PROVIDER_MODE: 'REAL' }).providerMode).toBe('mock');
    expect(readClientEnv({ EXPO_PUBLIC_PROVIDER_MODE: 'real' }).providerMode).toBe('real');
  });
});
