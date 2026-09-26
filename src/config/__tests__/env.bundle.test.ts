import { transformFileSync } from '@babel/core';

/**
 * Release-build regression (found on device, G3): EXPO_PUBLIC_* values reach a release bundle only
 * through literal `process.env.EXPO_PUBLIC_X` expressions that the Expo Babel preset inlines. Reading
 * them from a `process.env` object passed around left the cloud configuration empty in release.
 */
it('the production transform inlines every client env value into the bundle', () => {
  const saved = { ...process.env };
  process.env.EXPO_PUBLIC_SUPABASE_URL = 'http://inlined.test:1';
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'inlined-anon-key';
  process.env.EXPO_PUBLIC_PROVIDER_MODE = 'inlined-mode';
  try {
    const out = transformFileSync('src/config/env.ts', {
      babelrc: false,
      configFile: false,
      filename: 'src/config/env.ts',
      presets: ['babel-preset-expo'],
      caller: { name: 'metro', platform: 'android', isDev: false, bundler: 'metro' } as never,
      envName: 'production',
    });
    const code = out?.code ?? '';
    expect(code).toContain('http://inlined.test:1');
    expect(code).toContain('inlined-anon-key');
    expect(code).toContain('inlined-mode');
  } finally {
    process.env = saved;
  }
});
