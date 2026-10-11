import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Straightening a tilted page (tools/ocr/table-reader.js). A photographed page is rarely straight;
 * the reader once turned it the wrong way (doubling the tilt) and missed a -2° tilt.
 */
const src = readFileSync(join(__dirname, '../../../../../tools/ocr/table-reader.js'), 'utf8');
function grab(name: string): string {
  const i = src.indexOf(`function ${name}(`);
  let depth = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}' && --depth === 0) return src.slice(i, k + 1);
  }
  throw new Error(name);
}
type Img = { w: number; h: number; data: Uint8Array };
const reader = new Function(
  `${grab('integral')}${grab('binarize')}${grab('skew')}${grab('rotate')}
   return { binarize: binarize, skew: skew, rotate: rotate };`,
)() as {
  binarize: (g: Img) => Uint8Array;
  skew: (bin: Uint8Array, w: number, h: number) => number;
  rotate: (g: Img, deg: number) => Img;
};

/** A page of ruled lines tilted by `deg` (positive: going down to the right). */
function tilted(deg: number): Img {
  const w = 800,
    h = 600,
    t = Math.tan((deg * Math.PI) / 180);
  const data = new Uint8Array(w * h).fill(255);
  for (let line = 100; line < h - 60; line += 60) {
    for (let x = 60; x < w - 60; x++) {
      const y = Math.round(line + (x - w / 2) * t);
      for (let k = 0; k < 3; k++) data[(y + k) * w + x] = 0;
    }
  }
  return { w, h, data };
}

const firstDarkRow = (bin: Uint8Array, w: number, x: number) => {
  for (let y = 60; y < 200; y++) if (bin[y * w + x]) return y;
  return -1;
};

describe('straightening a tilted page', () => {
  it.each([2, -2, 4, -4])('a %s° tilt is found and turned back flat', (deg) => {
    const page = tilted(deg);
    const angle = reader.skew(reader.binarize(page), page.w, page.h);
    expect(Math.abs(angle - deg)).toBeLessThan(0.3);
    const flat = reader.binarize(reader.rotate(page, angle));
    // The first line is at the same height on the left and on the right.
    expect(
      Math.abs(firstDarkRow(flat, page.w, 120) - firstDarkRow(flat, page.w, 680)),
    ).toBeLessThanOrEqual(2);
  });

  it('a straight page (below half a degree) is not turned at all', () => {
    const page = tilted(0.3);
    expect(reader.skew(reader.binarize(page), page.w, page.h)).toBe(0);
  });
});
