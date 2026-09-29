#!/usr/bin/env node
/**
 * PDF → positioned text lines (pdfjs-dist, local, free). Used by the maintenance-discovery
 * pipeline's Node text reader (the server/tooling side of the TextReader port).
 *
 * Usage: node tools/pdf-text.mjs <in.pdf> <out.json>
 * Output: [{ n, lines: [{ y, items: [{ str, x, y, w }], text }], text }] — y grows downwards.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error('usage: node tools/pdf-text.mjs <in.pdf> <out.json>');
  process.exit(2);
}
const fonts =
  join(dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json')), 'standard_fonts')
    .split('\\')
    .join('/') + '/';
const pdf = await getDocument({
  data: new Uint8Array(readFileSync(input)),
  standardFontDataUrl: fonts,
  verbosity: 0,
}).promise;

const pages = [];
for (let n = 1; n <= pdf.numPages; n++) {
  const page = await pdf.getPage(n);
  const height = page.view[3] - page.view[1];
  const content = await page.getTextContent();
  const items = content.items
    .filter((it) => 'str' in it && it.str.trim() !== '')
    .map((it) => ({
      str: it.str,
      x: Math.round(it.transform[4] * 10) / 10,
      y: Math.round((height - it.transform[5]) * 10) / 10,
      w: Math.round(it.width * 10) / 10,
      h: Math.abs(it.transform[3]) || 8,
    }))
    .sort((a, b) => a.y - b.y || a.x - b.x);
  const lines = [];
  for (const it of items) {
    const tol = Math.max(2, it.h * 0.45);
    const line = lines.find((l) => Math.abs(l.y - it.y) <= tol);
    if (line) line.items.push(it);
    else lines.push({ y: it.y, items: [it] });
  }
  for (const l of lines) {
    l.items.sort((a, b) => a.x - b.x);
    l.items = l.items.map(({ str, x, y, w }) => ({ str, x, y, w }));
    l.text = l.items
      .map((i) => i.str)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  lines.sort((a, b) => a.y - b.y);
  pages.push({ n, lines, text: lines.map((l) => l.text).join('\n') });
  page.cleanup();
}
writeFileSync(output, JSON.stringify(pages));
console.log(`${pdf.numPages} pages`);
