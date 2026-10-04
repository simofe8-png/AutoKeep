import { htmlTextReader } from '../htmlText';
import type { ReaderDeps } from './run';

/** Test helpers for reading the owner's documents (SYNTHETIC data only). */

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

export function readerDeps(over: Partial<ReaderDeps> = {}): ReaderDeps {
  return {
    runId: 'run-test',
    vehicleRef: 'veh-test',
    readers: { pdf: null, html: htmlTextReader },
    sha256: fakeSha256,
    today: '2026-10-02' as ReaderDeps['today'],
    now: () => '2026-10-02T09:00:00.000Z',
    ...over,
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
