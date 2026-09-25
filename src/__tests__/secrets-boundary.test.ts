/**
 * T063 server-side boundary guard: app code must never reference privileged Supabase credentials.
 * Only the anon/publishable key may reach the client (docs/cloud/SUPABASE.md).
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
