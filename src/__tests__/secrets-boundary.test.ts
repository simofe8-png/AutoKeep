/**
 * Boundary guards (T063, local-first ADR-0023): app code holds no credentials, and there is no
 * AutoKeep backend — no cloud client, account, sync or upload of user data exists in the app.
 */
declare const require: (id: string) => unknown;

const fs = require('fs') as {
  readdirSync(p: string, o: { withFileTypes: true }): { name: string; isDirectory(): boolean }[];
  readFileSync(p: string, enc: 'utf8'): string;
};

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory())
      return e.name === '__tests__' || e.name === 'testing' ? [] : sourceFiles(p);
    return /\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [p] : [];
  });
}

describe('client secret boundary', () => {
  const files = sourceFiles('src');

  it('scans the app sources', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it.each([
    ['service role key', /service_role|SERVICE_ROLE/],
    ['secret key', /sb_secret_|SUPABASE_SECRET/],
    ['JWT secret', /JWT_SECRET/],
    ['public EXPO var carrying a secret', /EXPO_PUBLIC_[A-Z_]*(SECRET|SERVICE)/],
  ])('no %s in app code', (_label, pattern) => {
    const offenders = files.filter((f) => pattern.test(fs.readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });
});

/**
 * Every app file that can open a network connection (docs/security/NETWORK.md): the public
 * Ministry of Transport registry (the plate the owner typed) and the OS connectivity state.
 */
const EXPECTED_NETWORK_FILES = [
  'src/providers/network/netInfoNetwork.ts',
  'src/providers/registry/dataGovIl.ts',
];

describe('local-first: no AutoKeep user-data backend', () => {
  const files = sourceFiles('src');

  it.each([
    ['a Supabase client or reference', /supabase/i],
    ['a backend URL variable', /EXPO_PUBLIC_[A-Z_]*(URL|KEY|ENDPOINT|BACKEND)/],
    ['a cloud/sync/account module', /from '@\/(cloud|sync|account)\//],
    ['a key/session store for an account', /expo-secure-store/],
  ])('no %s in app code', (_label, pattern) => {
    const offenders = files.filter((f) => pattern.test(fs.readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('the only network clients are the public registry and the connectivity check', () => {
    const network = files.filter((f) =>
      /\bfetch\(|XMLHttpRequest|axios/.test(fs.readFileSync(f, 'utf8')),
    );
    expect(network.sort()).toEqual(EXPECTED_NETWORK_FILES);
  });
});
