import { PdfBridge, toBase64 } from '../pdfBridge';

/**
 * The on-device PDF bridge against a FAKE reader page: it decodes the injected chunks exactly
 * like assets/pdfjs/pdf-reader.html (`window.__akChunk(id, b64, last)`), so the transport,
 * chunking, validation and timeouts are tested without a WebView. The page itself is verified
 * separately in a real Chromium (see the implementation notes).
 */

const CALL = /^window\.__akChunk\(("[^"]*"),("[^"]*"),(true|false)\);true;$/;

function fakePage(bridge: PdfBridge, reply: (id: string, bytes: Uint8Array) => unknown) {
  const chunks = new Map<string, Buffer[]>();
  const injected: string[] = [];
  bridge.attach({
    inject: (js) => {
      injected.push(js);
      const m = CALL.exec(js);
      if (!m) throw new Error(`unexpected injection: ${js.slice(0, 40)}`);
      const id = JSON.parse(m[1]) as string;
      const list = chunks.get(id) ?? [];
      list.push(Buffer.from(JSON.parse(m[2]) as string, 'base64'));
      chunks.set(id, list);
      if (m[3] === 'true') {
        const bytes = new Uint8Array(Buffer.concat(chunks.get(id)!));
        const message = reply(id, bytes);
        setTimeout(() => bridge.onMessage(JSON.stringify(message)), 0);
      }
    },
  });
  setTimeout(() => bridge.onMessage(JSON.stringify({ ready: true })), 0);
  return injected;
}

const PAGE = (n: number, text: string) => ({
  n,
  text,
  lines: [{ y: 10, text, items: [{ str: text, x: 1, y: 10, w: 5 }] }],
});

describe('toBase64', () => {
  it('matches the standard encoding for every padding case', () => {
    for (let len = 0; len < 12; len++) {
      const bytes = new Uint8Array(len).map((_, i) => (i * 37 + 11) & 255);
      expect(toBase64(bytes)).toBe(Buffer.from(bytes).toString('base64'));
    }
    const big = new Uint8Array(100_001).map((_, i) => (i * 7919) & 255);
    expect(toBase64(big)).toBe(Buffer.from(big).toString('base64'));
  });
});

describe('PdfBridge', () => {
  it('sends the bytes in chunks, reassembled exactly, and returns the validated pages', async () => {
    const bridge = new PdfBridge({ idleMs: 5 });
    const bytes = new Uint8Array(600_000).map((_, i) => (i * 31) & 255);
    let received: Uint8Array | null = null;
    const injected = fakePage(bridge, (id, b) => {
      received = b;
      return { id, ok: true, pages: [PAGE(1, 'Brake fluid: replace every 24 months.')] };
    });
    const pages = await bridge.read(bytes);
    expect(injected.length).toBeGreaterThan(1); // chunked
    expect(Buffer.from(received!).equals(Buffer.from(bytes))).toBe(true);
    expect(pages).toEqual([PAGE(1, 'Brake fluid: replace every 24 months.')]);
  });

  it('rejects the page error, and never accepts a malformed reply', async () => {
    const failing = new PdfBridge({ idleMs: 5 });
    fakePage(failing, (id) => ({ id, ok: false, error: 'Invalid PDF structure' }));
    await expect(failing.read(new Uint8Array([1, 2, 3]))).rejects.toThrow(/Invalid PDF structure/);

    const malformed = new PdfBridge({ idleMs: 5, readTimeoutMs: 50 });
    fakePage(malformed, (id) => ({ id, ok: true, pages: [{ n: 1, text: 42 }] }));
    await expect(malformed.read(new Uint8Array([1, 2, 3]))).rejects.toThrow(/timed out/);
  });

  it('refuses an oversized document before starting the reader', async () => {
    const bridge = new PdfBridge({ maxBytes: 10 });
    const seen: boolean[] = [];
    bridge.subscribe((a) => seen.push(a));
    await expect(bridge.read(new Uint8Array(11))).rejects.toThrow(/too large/);
    expect(seen).toEqual([false]);
  });

  it('fails cleanly when the reader page never starts', async () => {
    const bridge = new PdfBridge({ readyTimeoutMs: 20, idleMs: 5 });
    await expect(bridge.read(new Uint8Array([1]))).rejects.toThrow(/did not start/);
  });

  it('is active only while reading (plus the idle period); a detach fails what is pending', async () => {
    const bridge = new PdfBridge({ idleMs: 10 });
    const seen: boolean[] = [];
    bridge.subscribe((a) => seen.push(a));
    fakePage(bridge, (id) => ({ id, ok: true, pages: [PAGE(1, 'x')] }));
    await bridge.read(new Uint8Array([1, 2]));
    await new Promise((r) => setTimeout(r, 30));
    expect(seen).toEqual([false, true, false]);

    const closing = new PdfBridge({ idleMs: 5 });
    closing.attach({ inject: () => undefined });
    setTimeout(() => closing.onMessage(JSON.stringify({ ready: true })), 0);
    const pending = closing.read(new Uint8Array([1]));
    setTimeout(() => closing.detach(), 5);
    await expect(pending).rejects.toThrow(/closed/);
  });
});
