/// <reference types="node" />
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { PageText, TextReader } from '../../types';
import type { GuardedFetchDeps } from '../netGuard';

/**
 * Worker / tooling host for M-SOURCE (Node). NOT imported by the app bundle.
 *  - Network: global fetch with DNS resolution checked for private addresses on every hop.
 *  - PDF: pdfjs in a separate, time-limited child process (parser isolation); the document is
 *    written to a private temp directory and removed afterwards; only positioned text returns.
 */

export const ROOT = join(__dirname, '..', '..', '..', '..', '..');
export const USER_AGENT = 'AutoKeepBot/1.0 (+maintenance schedule research; robots.txt respected)';

export function nodeNet(requested?: string[]): GuardedFetchDeps {
  return {
    fetch: (async (url: string, init?: RequestInit) => {
      requested?.push(url);
      return fetch(url, init);
    }) as typeof fetch,
    resolve: async (host) => (await lookup(host, { all: true })).map((a) => a.address),
    userAgent: USER_AGENT,
  };
}

export const sha256 = async (b: Uint8Array) => createHash('sha256').update(b).digest('hex');

export function pdfReader(timeoutMs = 120_000): TextReader {
  return {
    async read(doc) {
      const dir = await mkdtemp(join(tmpdir(), 'msource-pdf-'));
      try {
        await writeFile(join(dir, 'in.pdf'), doc.bytes);
        await new Promise<void>((resolve, reject) => {
          execFile(
            process.execPath,
            [join(ROOT, 'tools', 'pdf-text.mjs'), join(dir, 'in.pdf'), join(dir, 'out.json')],
            {
              timeout: timeoutMs,
              maxBuffer: 1024 * 1024,
              cwd: dir,
              env: {
                PATH: process.env.PATH ?? '',
                SystemRoot: process.env.SystemRoot ?? '',
              } as unknown as NodeJS.ProcessEnv,
            },
            (err: Error | null) =>
              err
                ? reject(new Error(`pdf reader failed: ${err.message.slice(0, 160)}`))
                : resolve(),
          );
        });
        return JSON.parse(await readFile(join(dir, 'out.json'), 'utf8')) as PageText[];
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
  };
}
