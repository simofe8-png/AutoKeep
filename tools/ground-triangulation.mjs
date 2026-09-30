#!/usr/bin/env node
/**
 * Grounding for source-agnostic triangulation: re-fetches every cited URL of
 * docs/maintenance/data/triangulation/B*.json and checks that the source's verbatim quote is
 * really there (deterministic; nothing is inferred). Respects robots.txt for a generic agent,
 * never logs in, stores no page content — only { grounded, method, sha256, status }.
 *
 * Usage: node tools/ground-triangulation.mjs  → docs/maintenance/data/triangulation/grounding.json
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ROOT = process.cwd();
const DIR = join(ROOT, 'docs', 'maintenance', 'data', 'triangulation');
const OUT = join(DIR, 'grounding.json');
const UA = 'AutoKeep-grounding/1.0 (maintenance evidence check)';
const previous = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {};

const norm = (s) =>
  s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[‘’“”"'`׳״]/g, '')
    .replace(/(\d)[,.\s](?=\d{3}\b)/g, '$1')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
const numbers = (s) => [...new Set(norm(s).match(/\d+/g) ?? [])];

function htmlText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

const robotsCache = new Map();
async function allowed(url) {
  const u = new URL(url);
  if (!robotsCache.has(u.host)) {
    let rules = [];
    try {
      const r = await fetch(`${u.protocol}//${u.host}/robots.txt`, {
        headers: { 'user-agent': UA },
      });
      if (r.ok) {
        let applies = false;
        for (const line of (await r.text()).split(/\r?\n/)) {
          const [k, ...v] = line.split(':');
          const key = k.trim().toLowerCase();
          const val = v.join(':').trim();
          if (key === 'user-agent') applies = val === '*';
          else if (applies && key === 'disallow' && val) rules.push(val);
        }
      }
    } catch {
      rules = [];
    }
    robotsCache.set(u.host, rules);
  }
  const path = u.pathname + u.search;
  return !robotsCache.get(u.host).some((rule) => {
    const re = new RegExp(
      '^' +
        rule
          .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
          .replace(/\*/g, '.*')
          .replace(/\\\$$/, '$'),
    );
    return re.test(path);
  });
}

async function pageText(url) {
  const r = await fetch(url, { headers: { 'user-agent': UA }, redirect: 'follow' });
  if (!r.ok) return { status: r.status };
  const buf = Buffer.from(await r.arrayBuffer());
  const sha256 = createHash('sha256').update(buf).digest('hex');
  const pdf =
    /pdf/i.test(r.headers.get('content-type') ?? '') || buf.subarray(0, 5).toString() === '%PDF-';
  if (!pdf) return { status: r.status, sha256, text: htmlText(buf.toString('utf8')) };
  const dir = mkdtempSync(join(tmpdir(), 'ground-'));
  try {
    writeFileSync(join(dir, 'in.pdf'), buf);
    execFileSync(
      process.execPath,
      [join(ROOT, 'tools', 'pdf-text.mjs'), join(dir, 'in.pdf'), join(dir, 'out.json')],
      {
        stdio: 'ignore',
        timeout: 120000,
      },
    );
    const pages = JSON.parse(readFileSync(join(dir, 'out.json'), 'utf8'));
    return { status: r.status, sha256, text: pages.map((p) => p.text).join('\n') };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Exact (normalized) quote, or every number of the quote plus ≥ 80% of its words. */
function check(quote, text) {
  const t = norm(text);
  if (norm(quote) && t.includes(norm(quote))) return 'exact';
  // Researcher annotations in parentheses / brackets (e.g. a table's column headers) are not
  // part of the source's words; they are removed before matching.
  const bare = quote.replace(/\([^)]*\)|\[[^\]]*\]/g, ' ');
  const q = norm(bare);
  if (q.split(' ').length >= 3 && t.includes(q)) return 'exact';
  const nums = numbers(bare);
  const words = q.split(' ').filter((w) => w.length > 2);
  const tw = new Set(t.split(' '));
  const hit = words.filter((w) => tw.has(w)).length / Math.max(1, words.length);
  if (words.length >= 2 && hit >= 0.8 && nums.every((n) => tw.has(n))) return 'tokens';
  return null;
}

const result = {};
const files = readdirSync(DIR).filter((f) => /^B\d+\.json$/.test(f));
const claims = [];
/** url + LF + quote → every interval value the claims citing it state (km, miles, months). */
const values = new Map();
for (const f of files) {
  const j = JSON.parse(readFileSync(join(DIR, f), 'utf8'));
  for (const it of j.items ?? []) {
    const iv = it.interval ?? {};
    const nums = [iv.km, iv.miles, iv.months, iv.firstKm, iv.firstMonths].filter((x) => x != null);
    for (const s of it.sources ?? []) {
      claims.push(s);
      const k = `${s.url}
${s.quote}`;
      values.set(k, [...new Set([...(values.get(k) ?? []), ...nums])]);
    }
  }
}

/**
 * Every stated interval value is on the page: as written, months as years, or distance in the
 * "× 1,000 km" unit of maintenance tables.
 */
function valuesOnPage(nums, text) {
  const tw = new Set(norm(text).split(' '));
  return nums.every(
    (n) =>
      tw.has(String(n)) ||
      (n % 12 === 0 && n >= 12 && tw.has(String(n / 12))) ||
      (n % 1000 === 0 && n >= 1000 && tw.has(String(n / 1000))),
  );
}
const byUrl = new Map();
for (const s of claims) byUrl.set(s.url, [...new Set([...(byUrl.get(s.url) ?? []), s.quote])]);
// Grounding is per cited quote: key = url + LF + quote (one page may back several items).
const K = (url, q) => `${url}\n${q}`;
let i = 0;
for (const [url, quotes] of byUrl) {
  i += 1;
  const put = (v) => quotes.forEach((q) => (result[K(url, q)] = v));
  if (!process.argv.includes('--refresh') && quotes.every((q) => previous[K(url, q)]?.status)) {
    // Already checked in an earlier run (same url + quote): reuse, no request.
    quotes.forEach((q) => (result[K(url, q)] = previous[K(url, q)]));
    continue;
  }
  try {
    if (!(await allowed(url))) put({ grounded: false, status: 'robots_disallowed' });
    else {
      const page = await pageText(url);
      if (!page.text) put({ grounded: false, status: `http_${page.status}` });
      else {
        for (const q of quotes) {
          const quoted = check(q, page.text);
          // The quote must be there AND every interval value it is cited for (tables whose
          // values are column headers / tick marks are checked this way too).
          const m = quoted && valuesOnPage(values.get(K(url, q)) ?? [], page.text) ? quoted : null;
          result[K(url, q)] = m
            ? { grounded: true, method: m, status: 'ok', sha256: page.sha256 }
            : {
                grounded: false,
                status: quoted ? 'interval_value_not_found' : 'quote_not_found',
                sha256: page.sha256,
              };
        }
      }
    }
  } catch (e) {
    for (const q of quotes) {
      const prev = previous[K(url, q)];
      result[K(url, q)] = prev?.grounded
        ? { ...prev, status: 'kept_from_previous_run' }
        : { grounded: false, status: `error_${String(e?.cause?.code ?? e?.name ?? 'fetch')}` };
    }
  }
  const st = quotes.map((q) => result[K(url, q)].status).join(',');
  process.stdout.write(`${i}/${byUrl.size} ${st} ${url}\n`);
}
writeFileSync(OUT, JSON.stringify(result, null, 2) + '\n');
const g = Object.values(result).filter((r) => r.grounded).length;
console.log(`grounded ${g}/${Object.keys(result).length} cited quotes → ${OUT}`);
