/// <reference types="node" />
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Http, PageText, TextReader } from '../types';

/**
 * Real-network I/O for the OPT-IN live maintenance tests (not part of `npm run verify`).
 * Documents are read into memory and discarded: nothing is cached or written except structured
 * results (URLs, hashes, extracted facts with locators).
 */
export const ROOT = join(__dirname, '..', '..', '..', '..');
const UA = 'AutoKeep-MaintenanceDiscovery/1.0 (research; contact: project owner)';

/** Every URL requested, for the "no request to a blocked source" evidence. */
export const REQUESTED: string[] = [];

export const http: Http = async (url, opts) => {
  REQUESTED.push(url);
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 90_000);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: ctl.signal,
      headers: { 'user-agent': UA },
    });
    const max = opts?.maxBytes ?? 60 * 1024 * 1024;
    const reader = res.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (reader) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > max) {
          await reader.cancel();
          break;
        }
        chunks.push(value);
      }
    }
    const bytes = new Uint8Array(Math.min(size, max + 1));
    let o = 0;
    for (const c of chunks) {
      bytes.set(c.subarray(0, Math.max(0, bytes.length - o)), o);
      o += c.length;
    }
    return {
      ok: res.ok,
      status: res.status,
      url: res.url || url,
      contentType: res.headers.get('content-type') ?? '',
      bytes: size > max ? new Uint8Array(max + 1) : bytes,
    };
  } finally {
    clearTimeout(t);
  }
};

export const pdfReader: TextReader = {
  async read(doc) {
    const dir = mkdtempSync(join(tmpdir(), 'ak-pdf-'));
    try {
      writeFileSync(join(dir, 'in.pdf'), doc.bytes);
      execFileSync(
        process.execPath,
        [join(ROOT, 'tools', 'pdf-text.mjs'), join(dir, 'in.pdf'), join(dir, 'out.json')],
        {
          stdio: 'pipe',
          timeout: 300_000,
        },
      );
      return JSON.parse(readFileSync(join(dir, 'out.json'), 'utf8')) as PageText[];
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
};

export const sha256 = async (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
