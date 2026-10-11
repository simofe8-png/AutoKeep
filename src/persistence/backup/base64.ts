const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const INDEX = new Map([...B64].map((c, i) => [c, i]));

export function encodeBase64(bytes: Uint8Array): string {
  const parts: string[] = [];
  // Chunked so a large file never builds one huge string by repeated concatenation.
  for (let start = 0; start < bytes.length; start += 3 * 4096) {
    let out = '';
    const end = Math.min(bytes.length, start + 3 * 4096);
    for (let i = start; i < end; i += 3) {
      const a = bytes[i];
      const b = i + 1 < end ? bytes[i + 1] : 0;
      const c = i + 2 < end ? bytes[i + 2] : 0;
      const n = (a << 16) | (b << 8) | c;
      out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
      out += i + 1 < end ? B64[(n >> 6) & 63] : '=';
      out += i + 2 < end ? B64[n & 63] : '=';
    }
    parts.push(out);
  }
  return parts.join('');
}

/** Strict decoder: null for anything that is not canonical, padded base64. */
export function decodeBase64(text: string): Uint8Array | null {
  if (text.length % 4 !== 0) return null;
  const pad = text.endsWith('==') ? 2 : text.endsWith('=') ? 1 : 0;
  const out = new Uint8Array((text.length / 4) * 3 - pad);
  let o = 0;
  for (let i = 0; i < text.length; i += 4) {
    const last = i + 4 === text.length;
    const v = [0, 1, 2, 3].map((k) => {
      const ch = text[i + k];
      if (ch === '=' && last && k >= 4 - pad) return 0;
      return INDEX.get(ch) ?? -1;
    });
    if (v.some((x) => x < 0)) return null;
    const n = (v[0] << 18) | (v[1] << 12) | (v[2] << 6) | v[3];
    out[o++] = (n >> 16) & 255;
    if (o < out.length) out[o++] = (n >> 8) & 255;
    if (o < out.length) out[o++] = n & 255;
  }
  return out;
}
