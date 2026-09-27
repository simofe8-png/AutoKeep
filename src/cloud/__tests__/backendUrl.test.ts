import { backendUrlAllowed, fetchWithTimeout } from '../backendUrl';

const prod = { dev: false, allowLoopback: false };

describe('release guard for the backend URL (P2A)', () => {
  it('a production build accepts only HTTPS to a real host', () => {
    expect(backendUrlAllowed('https://abc.supabase.co', prod)).toBe(true);
    expect(backendUrlAllowed('http://abc.supabase.co', prod)).toBe(false);
    expect(backendUrlAllowed('http://127.0.0.1:56621', prod)).toBe(false);
    expect(backendUrlAllowed('https://localhost:56621', prod)).toBe(false);
    expect(backendUrlAllowed('ftp://abc.supabase.co', prod)).toBe(false);
    expect(backendUrlAllowed('not a url', prod)).toBe(false);
    expect(backendUrlAllowed(undefined, prod)).toBe(false);
  });

  it('plain HTTP only to loopback, only in development or the rc-local variant', () => {
    expect(backendUrlAllowed('http://127.0.0.1:56621', { dev: true, allowLoopback: false })).toBe(
      true,
    );
    expect(backendUrlAllowed('http://127.0.0.1:56621', { dev: false, allowLoopback: true })).toBe(
      true,
    );
    expect(backendUrlAllowed('http://192.168.1.5:56621', { dev: true, allowLoopback: true })).toBe(
      false,
    );
  });
});

describe('request timeouts', () => {
  it('a hung request is aborted instead of blocking forever', async () => {
    jest.useFakeTimers();
    const hung: typeof fetch = (_i, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      });
    const p = fetchWithTimeout(hung)('https://x.supabase.co/rest/v1/vehicles');
    jest.advanceTimersByTime(30_000);
    await expect(p).rejects.toThrow('aborted');
    jest.useRealTimers();
  });
});
