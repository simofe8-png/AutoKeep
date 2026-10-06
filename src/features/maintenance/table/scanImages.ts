/**
 * The page images inside a scanned PDF (CamScanner and phone scanners store each page as one
 * JPEG). Pure byte scanning, no PDF library: every image object with a DCT (JPEG) filter, in file
 * order, large enough to be a page. A PDF made of text (not a scan) has none — the owner is then
 * asked for a photo of the page.
 */

const enc = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0));

function indexOf(hay: Uint8Array, needle: Uint8Array, from: number): number {
  outer: for (let i = from; i <= hay.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) if (hay[i + j] !== needle[j]) continue outer;
    return i;
  }
  return -1;
}

const latin1 = (b: Uint8Array) => String.fromCharCode(...b);

const STREAM = enc('stream');
const END = enc('endstream');
/** A page photo, not a logo or a thumbnail. */
const MIN_SIDE = 600;

export function scanImages(pdf: Uint8Array): Uint8Array[] {
  const out: Uint8Array[] = [];
  let at = 0;
  for (;;) {
    const s = indexOf(pdf, STREAM, at);
    if (s < 0) break;
    // The object's dictionary: back to its "obj" (bounded).
    const dict = latin1(pdf.subarray(Math.max(0, s - 1200), s));
    const obj = dict.lastIndexOf(' obj');
    const head = obj >= 0 ? dict.slice(obj) : dict;
    let start = s + STREAM.length;
    if (pdf[start] === 0x0d) start++;
    if (pdf[start] === 0x0a) start++;
    const e = indexOf(pdf, END, start);
    if (e < 0) break;
    at = e + END.length;
    if (!/\/Subtype\s*\/Image/.test(head) || !/\/DCTDecode/.test(head)) continue;
    const w = Number(/\/Width\s+(\d+)/.exec(head)?.[1] ?? 0);
    const h = Number(/\/Height\s+(\d+)/.exec(head)?.[1] ?? 0);
    if (Math.min(w, h) < MIN_SIDE) continue;
    let end = e;
    while (end > start && (pdf[end - 1] === 0x0a || pdf[end - 1] === 0x0d)) end--;
    const jpeg = pdf.slice(start, end);
    // A JPEG starts with FF D8.
    if (jpeg[0] === 0xff && jpeg[1] === 0xd8) out.push(jpeg);
  }
  return out;
}
