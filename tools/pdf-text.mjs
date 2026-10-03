#!/usr/bin/env node
/**
 * PDF → positioned text lines (pdfjs-dist, local, free). Used by the maintenance-discovery
 * pipeline's Node text reader (the server/tooling side of the TextReader port). The page logic
 * is shared with the on-device WebView reader (tools/pdf-pages.mjs).
 *
 * Usage: node tools/pdf-text.mjs <in.pdf> <out.json>
 * Output: [{ n, lines: [{ y, items: [{ str, x, y, w }], text }], text }] — y grows downwards.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

import { readPdfPages } from './pdf-pages.mjs';

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error('usage: node tools/pdf-text.mjs <in.pdf> <out.json>');
  process.exit(2);
}
const fonts =
  join(dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json')), 'standard_fonts')
    .split('\\')
    .join('/') + '/';
const pages = await readPdfPages(pdfjs, new Uint8Array(readFileSync(input)), {
  standardFontDataUrl: fonts,
});
writeFileSync(output, JSON.stringify(pages));
console.log(`${pages.length} pages`);
