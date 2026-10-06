import { z } from 'zod';

import type { PageText, TextReader } from '@/discovery/maintenance/types';

import { uploadLog } from './devLog';

/**
 * Bridge to the on-device PDF text reader (owner decision D-A1, 2026-10-03): pdf.js inside a
 * hidden WebView (`PdfReaderHost`, assets/pdfjs/pdf-reader.html). The page has no network access
 * (its Content-Security-Policy allows blob:/data: only), so the owner's document never leaves the
 * device. Bytes go in as base64 chunks; the reply is validated before use (untrusted page output).
 * The WebView exists only while a read is in progress (plus a short idle period).
 */

export interface PdfTransport {
  inject(js: string): void;
}

export interface PdfBridgeOptions {
  readyTimeoutMs: number;
  readTimeoutMs: number;
  idleMs: number;
  maxBytes: number;
}

const DEFAULTS: PdfBridgeOptions = {
  readyTimeoutMs: 20_000,
  readTimeoutMs: 120_000,
  idleMs: 15_000,
  maxBytes: 25 * 1024 * 1024,
};

/** Multiple of 3, so every chunk decodes on its own. */
const CHUNK_BYTES = 3 * 64 * 1024;

const PagesSchema = z
  .array(
    z.object({
      n: z.number().int().positive(),
      text: z.string(),
      lines: z.array(
        z.object({
          y: z.number(),
          text: z.string(),
          items: z.array(
            z.object({ str: z.string(), x: z.number(), y: z.number(), w: z.number() }),
          ),
        }),
      ),
    }),
  )
  .max(1000);

/** A page read as a maintenance table (tools/ocr/table-reader.js; null: no ruled table). */
const TableSchema = z
  .object({
    dataColumns: z.number().int().min(1).max(40),
    rtl: z.boolean(),
    rows: z
      .array(
        z.object({
          group: z.string().max(400),
          label: z.array(z.string().max(400)).max(4),
          data: z.array(z.string().max(40).nullable()).max(40),
          merged: z.string().max(1000).nullable(),
          numbers: z.boolean().optional(),
          unsure: z.array(z.number().int().min(0).max(40)).max(40).optional(),
        }),
      )
      .max(300),
    below: z.array(z.string().max(1000)).max(80),
  })
  .nullable();

export type TableReading = z.infer<typeof TableSchema>;

const MessageSchema = z.union([
  z.object({ ready: z.literal(true) }),
  z.object({ id: z.string(), ok: z.literal(true), pages: PagesSchema }),
  z.object({ id: z.string(), ok: z.literal(true), table: TableSchema }),
  z.object({ id: z.string(), ok: z.literal(false), error: z.string() }),
]);

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function toBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const n = (a << 16) | (b << 8) | c;
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
    out += i + 1 < bytes.length ? B64[(n >> 6) & 63] : '=';
    out += i + 2 < bytes.length ? B64[n & 63] : '=';
  }
  return out;
}

interface Pending {
  resolve: (reply: { pages: PageText[] } | { table: TableReading }) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class PdfBridge {
  private transport: PdfTransport | null = null;
  private ready = false;
  private waiters: { resolve: () => void; reject: (e: Error) => void }[] = [];
  private readonly requests = new Map<string, Pending>();
  private readonly listeners = new Set<(active: boolean) => void>();
  private active = false;
  private idle: ReturnType<typeof setTimeout> | null = null;
  private seq = 0;
  private readonly opts: PdfBridgeOptions;

  constructor(options: Partial<PdfBridgeOptions> = {}) {
    this.opts = { ...DEFAULTS, ...options };
  }

  /** The host component renders the WebView while active. */
  subscribe(listener: (active: boolean) => void): () => void {
    this.listeners.add(listener);
    listener(this.active);
    return () => void this.listeners.delete(listener);
  }

  attach(transport: PdfTransport): void {
    this.transport = transport;
  }

  /** The WebView went away: nothing pending can complete. */
  detach(): void {
    this.transport = null;
    this.ready = false;
    this.fail('the PDF reader closed');
  }

  /** The reader page could not be loaded (or crashed). */
  fail(reason: string): void {
    const e = new Error(reason);
    for (const w of this.waiters.splice(0)) w.reject(e);
    for (const [id, p] of this.requests) {
      clearTimeout(p.timer);
      this.requests.delete(id);
      p.reject(e);
    }
  }

  onMessage(raw: string): void {
    let parsed: z.infer<typeof MessageSchema>;
    try {
      const r = MessageSchema.safeParse(JSON.parse(raw));
      if (!r.success) return;
      parsed = r.data;
    } catch {
      return;
    }
    if ('ready' in parsed) {
      this.ready = true;
      for (const w of this.waiters.splice(0)) w.resolve();
      return;
    }
    const p = this.requests.get(parsed.id);
    if (!p) return;
    clearTimeout(p.timer);
    this.requests.delete(parsed.id);
    if (!parsed.ok) p.reject(new Error(`pdf reader: ${parsed.error.slice(0, 120)}`));
    else p.resolve('pages' in parsed ? { pages: parsed.pages } : { table: parsed.table });
  }

  async read(bytes: Uint8Array): Promise<PageText[]> {
    const reply = await this.request(bytes, null);
    if (!('pages' in reply)) throw new Error('pdf reader: unexpected reply');
    return reply.pages;
  }

  /** Reads one page image as a maintenance table (the photo reader only). */
  async readTable(bytes: Uint8Array): Promise<TableReading> {
    const reply = await this.request(bytes, 'table');
    if (!('table' in reply)) throw new Error('table reader: unexpected reply');
    return reply.table;
  }

  private async request(
    bytes: Uint8Array,
    mode: 'table' | null,
  ): Promise<{ pages: PageText[] } | { table: TableReading }> {
    if (bytes.length > this.opts.maxBytes) {
      throw new Error('the document is too large for the on-device PDF reader');
    }
    this.setActive(true);
    const started = Date.now();
    uploadLog('pdf reader: start', { bytes: bytes.length, mode });
    try {
      await this.waitReady();
      uploadLog('pdf reader: page ready', { ms: Date.now() - started });
      const id = `r${++this.seq}`;
      const done = new Promise<{ pages: PageText[] } | { table: TableReading }>(
        (resolve, reject) => {
          const timer = setTimeout(() => {
            this.requests.delete(id);
            reject(new Error('the PDF reader timed out'));
          }, this.opts.readTimeoutMs);
          this.requests.set(id, { resolve, reject, timer });
        },
      );
      for (let at = 0; at < bytes.length || at === 0; at += CHUNK_BYTES) {
        const chunk = toBase64(bytes.subarray(at, at + CHUNK_BYTES));
        const last = at + CHUNK_BYTES >= bytes.length;
        if (!this.transport) throw new Error('the PDF reader closed');
        this.transport.inject(
          `window.__akChunk(${JSON.stringify(id)},${JSON.stringify(chunk)},${last},${JSON.stringify(mode)});true;`,
        );
        if (last) break;
      }
      const reply = await done;
      uploadLog('pdf reader: done', {
        ms: Date.now() - started,
        ...('pages' in reply
          ? {
              pages: reply.pages.length,
              pagesWithText: reply.pages.filter((p) => p.text.trim()).length,
            }
          : { tableRows: reply.table?.rows.length ?? null }),
      });
      return reply;
    } catch (e) {
      uploadLog('pdf reader: failed', {
        ms: Date.now() - started,
        error: String((e as Error)?.message ?? e).slice(0, 160),
      });
      throw e;
    } finally {
      this.scheduleIdle();
    }
  }

  private waitReady(): Promise<void> {
    if (this.ready && this.transport) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiters = this.waiters.filter((w) => w.resolve !== ok);
        reject(new Error('the PDF reader did not start'));
      }, this.opts.readyTimeoutMs);
      const ok = () => {
        clearTimeout(timer);
        resolve();
      };
      this.waiters.push({
        resolve: ok,
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });
    });
  }

  private setActive(active: boolean): void {
    if (this.idle) {
      clearTimeout(this.idle);
      this.idle = null;
    }
    if (this.active === active) return;
    this.active = active;
    for (const l of this.listeners) l(active);
  }

  private scheduleIdle(): void {
    if (this.requests.size) return;
    if (this.idle) clearTimeout(this.idle);
    this.idle = setTimeout(() => {
      this.idle = null;
      if (!this.requests.size) this.setActive(false);
    }, this.opts.idleMs);
  }
}

export const pdfBridge = new PdfBridge();

/** TextReader over the bridge (used by the runner for the owner's uploads only). */
export function uploadPdfReader(bridge: PdfBridge = pdfBridge): TextReader {
  return { read: (doc) => bridge.read(doc.bytes) };
}
