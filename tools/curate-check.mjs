#!/usr/bin/env node
/**
 * Curation checker (G3, zero-cost). Verifies a curated, hash-pinned schedule against the official
 * PDF before a person approves it for the registry (docs/sources/REGISTRY_PROCEDURE.md):
 *   1. obtains the PDF (the entry's HTTPS url, or a local file given with --pdf);
 *   2. computes SHA-256, prints it, and fails if the entry pins a different hash;
 *   3. extracts each page's text (pdfjs-dist, local, free) and checks that every item's quote is on
 *      the page it cites.
 * It never edits the registry; it only reports. Exit code 0 = every check passed.
 *
 * Usage: node tools/curate-check.mjs <entry.json> [--pdf <file.pdf>]
 *   entry.json: one KnownOfficialDocument with `curated` (see src/discovery/hybrid.ts).
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

import { checkQuotes, quotesOf } from '../src/discovery/curation.ts';

const args = process.argv.slice(2);
const entryPath = args[0];
const pdfFlag = args.indexOf('--pdf');
if (!entryPath) {
  console.error('usage: node tools/curate-check.mjs <entry.json> [--pdf <file.pdf>]');
  process.exit(2);
}
const entry = JSON.parse(readFileSync(entryPath, 'utf8'));

async function obtain() {
  if (pdfFlag >= 0) return new Uint8Array(readFileSync(args[pdfFlag + 1]));
  if (!/^https:\/\//i.test(entry.url)) throw new Error('entry.url must be HTTPS');
  const res = await fetch(entry.url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`download failed: HTTP ${res.status}`);
  console.log(`downloaded ${entry.url} -> ${res.url}`);
  return new Uint8Array(await res.arrayBuffer());
}

const bytes = await obtain();
const sha256 = createHash('sha256').update(bytes).digest('hex');
console.log(`sha256 ${sha256} (${bytes.length} bytes)`);
let failed = false;
if (entry.curated?.sha256 && entry.curated.sha256 !== sha256) {
  console.error(`FAIL hash: the entry pins ${entry.curated.sha256}`);
  failed = true;
}

// pdfjs wants a '/'-terminated path (also on Windows).
const fonts =
  join(dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json')), 'standard_fonts')
    .split('\\')
    .join('/') + '/';
const pdf = await getDocument({
  data: bytes.slice(),
  standardFontDataUrl: fonts,
}).promise;
const pages = [];
for (let n = 1; n <= pdf.numPages; n++) {
  const content = await (await pdf.getPage(n)).getTextContent();
  pages.push(
    content.items.map((it) => ('str' in it ? it.str + (it.hasEOL ? '\n' : ' ') : '')).join(''),
  );
}
console.log(`${pdf.numPages} pages`);

if (pages.every((p) => !p.trim())) {
  console.error('FAIL no text layer (scanned PDF?): quotes cannot be machine-checked');
  failed = true;
} else if (entry.curated) {
  for (const f of checkQuotes(pages, quotesOf(entry.curated))) {
    const where = `[${f.quote.interval}] ${f.quote.title} p.${f.quote.page}`;
    if (f.ok) console.log(`ok   ${where}`);
    else {
      console.error(`FAIL ${where}: ${f.reason}: "${f.quote.quote}"`);
      failed = true;
    }
  }
} else {
  console.log('no `curated` block: hash printed only');
}
process.exit(failed ? 1 : 0);
