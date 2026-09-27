/**
 * P2A release guard: which backend URLs a build may talk to. A production build only accepts
 * HTTPS to a non-loopback host; plain HTTP to a loopback host is allowed only in development and
 * in the rc-local test variant (app.config.js). Anything else disables the cloud (local-only),
 * failing closed instead of sending sessions or documents over an insecure channel.
 */
const LOOPBACK = /^(localhost|127(?:\.\d{1,3}){3}|\[::1\])$/i;

export function backendUrlAllowed(
  url: string | undefined,
  opts: { dev: boolean; allowLoopback: boolean },
): boolean {
  if (!url) return false;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  const loopback = LOOPBACK.test(u.hostname);
  if (u.protocol === 'https:') return !loopback || opts.dev || opts.allowLoopback;
  if (u.protocol === 'http:') return loopback && (opts.dev || opts.allowLoopback);
  return false;
}

/** Request timeouts: a hung call becomes a transient failure (retried with backoff). */
export const REQUEST_TIMEOUT_MS = 30_000;
export const UPLOAD_TIMEOUT_MS = 10 * 60_000;

export function fetchWithTimeout(fetchImpl: typeof fetch): typeof fetch {
  return async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const method = (init?.method ?? 'GET').toUpperCase();
    const upload = method === 'POST' && url.includes('/storage/v1/object/');
    const ms = upload ? UPLOAD_TIMEOUT_MS : REQUEST_TIMEOUT_MS;
    const controller = new AbortController();
    const outer = init?.signal;
    if (outer) {
      if (outer.aborted) controller.abort();
      else outer.addEventListener('abort', () => controller.abort(), { once: true });
    }
    const timer = setTimeout(() => controller.abort(), ms);
    try {
      return await fetchImpl(input, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  };
}
