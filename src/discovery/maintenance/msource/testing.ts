import { htmlTextReader } from '../htmlText';
import type { SourceSystem } from '../registry/sourceSystem';
import type { AccessContext } from './accessEngine';
import type { DiscoveryAdapter } from './adapters';
import type { GuardedFetchDeps } from './netGuard';
import type { RunnerDeps } from './run';

/**
 * Test-only fake web for M-SOURCE (fixtures, never real sources). Pages are synthetic documents
 * written for the tests; robots.txt, redirects, status codes and content types are simulated so
 * the real guard / access / acquisition code runs unchanged.
 */

export interface FakePage {
  status?: number;
  contentType?: string;
  body?: string | Uint8Array;
  location?: string;
}

export class FakeWeb {
  readonly requested: string[] = [];
  constructor(readonly pages: Record<string, FakePage>) {}

  fetch = (async (url: string) => {
    this.requested.push(url);
    const p = this.pages[url];
    if (!p) return fakeResponse(404, 'text/plain', 'not found');
    if (p.location)
      return fakeResponse(p.status ?? 302, 'text/plain', '', { location: p.location });
    return fakeResponse(p.status ?? 200, p.contentType ?? 'text/html', p.body ?? '');
  }) as unknown as typeof fetch;

  net(extra: Partial<GuardedFetchDeps> = {}): GuardedFetchDeps {
    return {
      fetch: this.fetch,
      userAgent: 'AutoKeepBot/test',
      sleep: async () => undefined,
      ...extra,
    };
  }
}

export function fakeResponse(
  status: number,
  contentType: string,
  body: string | Uint8Array,
  headers: Record<string, string> = {},
): Response {
  const bytes = typeof body === 'string' ? new TextEncoder().encode(body) : body;
  const h: Record<string, string> = { 'content-type': contentType, ...headers };
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (k: string) => h[k.toLowerCase()] ?? null },
    body: null,
    arrayBuffer: async () =>
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  } as unknown as Response;
}

export const ALLOW_ALL = 'User-agent: *\nAllow: /\n';

export function fakeAccess(web: FakeWeb, registry: readonly SourceSystem[] = []): AccessContext {
  let t = 0;
  return {
    registry,
    net: web.net(),
    now: () => new Date(Date.UTC(2026, 9, 2, 8, 0, t++)).toISOString(),
    robots: new Map(),
  };
}

export async function fakeSha256(b: Uint8Array): Promise<string> {
  // Deterministic non-cryptographic stand-in for tests (64 hex chars).
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (const x of b) {
    h1 = Math.imul(h1 ^ x, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ x, 0x85ebca6b) >>> 0;
  }
  const part = (h1.toString(16) + h2.toString(16)).padStart(16, '0');
  return part.repeat(4).slice(0, 64);
}

export function fakeDeps(
  web: FakeWeb,
  adapters: DiscoveryAdapter[],
  over: Partial<RunnerDeps> = {},
): RunnerDeps {
  const access = fakeAccess(web, over.access?.registry ?? []);
  return {
    runId: 'run-test',
    vehicleRef: 'veh-test',
    adapters,
    access,
    net: web.net(),
    readers: { pdf: null, html: htmlTextReader },
    sha256: fakeSha256,
    today: '2026-10-02' as RunnerDeps['today'],
    now: access.now,
    ...over,
    limits: { hostGapMs: 0, ...over.limits },
  };
}

/** A minimal, valid single-page PDF with one text line per entry (uncompressed). */
export function minimalPdf(lines: string[]): Uint8Array {
  const esc = (s: string) => s.replace(/[\\()]/g, (c) => `\\${c}`);
  const content = [
    'BT',
    '/F1 10 Tf',
    ...lines.map((l, i) => `1 0 0 1 40 ${780 - i * 16} Tm (${esc(l)}) Tj`),
    'ET',
  ].join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 800] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) out += `${String(o).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(out);
}
