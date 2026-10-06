import { scanImages } from '../scanImages';

const bytes = (...parts: (string | number[])[]) =>
  Uint8Array.from(
    parts.flatMap((p) => (typeof p === 'string' ? Array.from(p, (c) => c.charCodeAt(0)) : p)),
  );

const JPEG = [0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9];

describe('page images of a scanned PDF', () => {
  it('returns every page JPEG in order and skips small images and other streams', () => {
    const pdf = bytes(
      '%PDF-1.4\n1 0 obj\n<< /Type /XObject /Subtype /Image /Width 1653 /Height 2339 /Filter /DCTDecode /Length 9 >>\nstream\r\n',
      JPEG,
      '\r\nendstream\nendobj\n',
      '2 0 obj\n<< /Length 4 >>\nstream\nq Q \nendstream\nendobj\n',
      '3 0 obj\n<< /Subtype /Image /Width 40 /Height 40 /Filter /DCTDecode >>\nstream\n',
      JPEG,
      '\nendstream\nendobj\n',
      '4 0 obj\n<< /Subtype /Image /Width 1653 /Height 2339 /Filter /DCTDecode >>\nstream\n',
      [...JPEG.slice(0, 4), 9],
      '\nendstream\nendobj\n%%EOF',
    );
    const images = scanImages(pdf);
    expect(images).toHaveLength(2);
    expect(Array.from(images[0])).toEqual(JPEG);
    expect(Array.from(images[1])).toEqual([...JPEG.slice(0, 4), 9]);
  });

  it('a PDF of text has no page image', () => {
    expect(
      scanImages(bytes('%PDF-1.4\n1 0 obj\n<< /Length 3 >>\nstream\nBT \nendstream\n')),
    ).toEqual([]);
  });
});
