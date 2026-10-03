/**
 * PDF → positioned text lines, shared by the worker-host reader (tools/pdf-text.mjs, Node) and the
 * on-device WebView reader (inlined into assets/pdfjs/pdf-reader.html by
 * tools/build-pdf-webview.mjs). Self-contained: no imports, the pdf.js module is passed in, so the
 * same source runs in both places. Output: [{ n, lines: [{ y, items: [{ str, x, y, w }], text }],
 * text }] — y grows downwards.
 *
 * Untrusted input: script evaluation and font loading are disabled; only the text layer is read.
 */
export async function readPdfPages(pdfjs, data, options) {
  const opts = options || {};
  const maxPages = opts.maxPages || 400;
  const task = pdfjs.getDocument({
    data,
    isEvalSupported: false,
    disableFontFace: true,
    useSystemFonts: false,
    standardFontDataUrl: opts.standardFontDataUrl,
    verbosity: 0,
  });
  const pdf = await task.promise;
  const pages = [];
  const count = Math.min(pdf.numPages, maxPages);
  for (let n = 1; n <= count; n++) {
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
  await task.destroy();
  return pages;
}
