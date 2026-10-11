#!/usr/bin/env node
/**
 * Measures the maintenance-table reader on the PHONE's path, cell by cell (owner, 2026-10-08):
 * the page images inside the owner's scanned PDF → the app's own reader page
 * (assets/ocr/ocr-reader.html, table mode) in headless Chrome → compared with the booklet exactly
 * as printed (tools/ocr/fiesta-2012-truth.json).
 *
 * A cell / text is: exact, uncertain (shown as '?' / marked — the owner checks it), or WRONG
 * (shown as if sure but different). The aim is 0 wrong; everything not proven stays uncertain.
 *
 * Usage: node tools/ocr/measure.mjs [scan.pdf] [--json out.json]
 * Needs Google Chrome. Writes nothing into the project.
 */
import { Buffer } from 'node:buffer';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const jsonOut = args.includes('--json') ? args[args.indexOf('--json') + 1] : null;
const pdfPath =
  args.find((a) => a.endsWith('.pdf')) ??
  join(process.env.USERPROFILE ?? '', 'Desktop', 'CamScanner 06.10.2026 14.47.pdf');
const CHROME =
  process.env.CHROME ??
  [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  ].find((p) => {
    try {
      readFileSync(p, { flag: 'r' });
      return true;
    } catch {
      return false;
    }
  });

/** The page JPEGs of a scanned PDF — the same rule as src/features/maintenance/table/scanImages.ts. */
function scanImages(pdf) {
  const s = pdf.toString('latin1');
  const out = [];
  let at = 0;
  for (;;) {
    const i = s.indexOf('stream', at);
    if (i < 0) break;
    const head = s.slice(Math.max(0, i - 1200), i);
    const obj = head.lastIndexOf(' obj');
    const dict = obj >= 0 ? head.slice(obj) : head;
    let start = i + 6;
    if (s[start] === '\r') start++;
    if (s[start] === '\n') start++;
    const e = s.indexOf('endstream', start);
    if (e < 0) break;
    at = e + 9;
    if (!/\/Subtype\s*\/Image/.test(dict) || !/\/DCTDecode/.test(dict)) continue;
    const w = Number(/\/Width\s+(\d+)/.exec(dict)?.[1] ?? 0);
    const h = Number(/\/Height\s+(\d+)/.exec(dict)?.[1] ?? 0);
    if (Math.min(w, h) < 600) continue;
    let end = e;
    while (end > start && (s[end - 1] === '\n' || s[end - 1] === '\r')) end--;
    out.push(pdf.subarray(start, end));
  }
  return out;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function readPages(images) {
  const dir = mkdtempSync(join(tmpdir(), 'ak-measure-'));
  const html = readFileSync(join(ROOT, 'assets', 'ocr', 'ocr-reader.html'), 'utf8').replace(
    '<body>',
    '<body><script>window.__msgs=[];window.ReactNativeWebView={postMessage:function(m){window.__msgs.push(m)}};</script>',
  );
  const page = join(dir, 'reader.html');
  writeFileSync(page, html);
  const port = 9400 + Math.floor(Math.random() * 400);
  const chrome = spawn(
    CHROME,
    [
      '--headless=new',
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${join(dir, 'profile')}`,
      '--allow-file-access-from-files',
      'about:blank',
    ],
    { stdio: 'ignore' },
  );
  try {
    let tabs = [];
    for (let i = 0; i < 60 && !tabs.length; i++) {
      try {
        tabs = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).filter(
          (t) => t.type === 'page',
        );
      } catch {
        await sleep(500);
      }
    }
    const ws = new WebSocket(tabs[0].webSocketDebuggerUrl);
    await new Promise((r) => (ws.onopen = r));
    let seq = 0;
    const pending = new Map();
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.id && pending.has(m.id)) {
        pending.get(m.id)(m);
        pending.delete(m.id);
      }
      if (m.method === 'Runtime.exceptionThrown') {
        console.error('page error:', m.params.exceptionDetails.exception?.description);
      }
    };
    const send = (method, params = {}) =>
      new Promise((r) => {
        const id = ++seq;
        pending.set(id, r);
        ws.send(JSON.stringify({ id, method, params }));
      });
    const ev = async (expression) =>
      (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }))
        .result?.result?.value;
    await send('Runtime.enable');
    await send('Page.navigate', { url: 'file:///' + page.split('\\').join('/') });
    let ready = false;
    for (let i = 0; i < 120 && !ready; i++) {
      ready = Boolean(
        await ev("(window.__msgs||[]).some(function(m){return m.indexOf('ready')>=0})"),
      );
      if (!ready) await sleep(500);
    }
    if (!ready) throw new Error('the reader page did not start');
    const pages = [];
    for (const [k, img] of images.entries()) {
      const b64 = Buffer.from(img).toString('base64');
      const CH = 256 * 1024;
      for (let at = 0; at < b64.length; at += CH) {
        const last = at + CH >= b64.length;
        await ev(
          `window.__akChunk(${JSON.stringify('p' + k)},${JSON.stringify(b64.slice(at, at + CH))},${last},"table");true`,
        );
      }
      let reply = null;
      for (let i = 0; i < 600 && !reply; i++) {
        reply = await ev(
          `(function(){var m=window.__msgs.filter(function(x){return x.indexOf('"id":"p${k}"')>=0});return m.length?m[0]:null})()`,
        );
        if (!reply) await sleep(1000);
      }
      const r = JSON.parse(reply);
      if (!r.ok) throw new Error(`page ${k + 1}: ${r.error}`);
      pages.push(r.table);
    }
    ws.close();
    return pages;
  } finally {
    chrome.kill();
  }
}

// ---- compare with the booklet ----
const norm = (s) =>
  (s ?? '')
    .replace(/[\u200e\u200f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

function compare(pages, truth) {
  const report = {
    cells: { exact: 0, uncertain: 0, wrong: 0 },
    text: { exact: 0, uncertain: 0, wrong: 0 },
    errors: [],
  };
  truth.pages.forEach((tPage, p) => {
    const rows = (pages[p]?.rows ?? []).filter((r) => !r.numbers);
    // The item rows are the last rows of the page (above them: the legend line, if any).
    const items = rows.slice(rows.length - tPage.length);
    if (rows.length < tPage.length) {
      report.errors.push(`page ${p + 1}: ${rows.length} rows read, ${tPage.length} in the booklet`);
    }
    tPage.forEach((t, i) => {
      const r = items[i];
      const where = `p${p + 1} "${t.label}"`;
      // A rule row is always checked by the owner; a name only when the reading flagged it.
      const flagged = (kind) => kind === 'rule' || (kind === 'label' && r.textUnsure);
      const text = (kind, got, want) => {
        if (norm(got) === norm(want)) report.text.exact++;
        else if (flagged(kind)) {
          report.text.uncertain++;
          report.errors.push(`${where} ${kind} (flagged): "${norm(got)}" ≠ "${want}"`);
        } else {
          report.text.wrong++;
          report.errors.push(`${where} ${kind}: "${norm(got)}" ≠ "${want}"`);
        }
      };
      if (!r) return;
      text('label', r.label?.[0], t.label);
      text('group', r.group, t.group);
      if (t.rule) {
        if (r.merged == null) report.errors.push(`${where}: a rule row read as cells`);
        else text('rule', r.merged, t.rule);
        return;
      }
      if (r.merged != null) {
        report.errors.push(`${where}: a cell row read as a rule ("${norm(r.merged)}")`);
        report.cells.wrong += 16;
        return;
      }
      const want = t.cells.split(' ');
      const unsure = new Set(r.unsure ?? []);
      want.forEach((w, k) => {
        const got = r.data?.[k] ?? '';
        if (unsure.has(k) || got === '?') report.cells.uncertain++;
        else if (got === w) report.cells.exact++;
        else {
          report.cells.wrong++;
          report.errors.push(`${where} column ${truth.km[k]}: "${got}" ≠ "${w}"`);
        }
      });
    });
  });
  return report;
}

const truth = JSON.parse(
  readFileSync(join(ROOT, 'tools', 'ocr', 'fiesta-2012-truth.json'), 'utf8'),
);
const images = scanImages(readFileSync(pdfPath));
console.log(`${images.length} page images from ${pdfPath}`);
const pages = await readPages(images);
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(pages, null, 1));
const r = compare(pages, truth);
console.log(
  `cells: exact ${r.cells.exact} · uncertain ${r.cells.uncertain} · WRONG ${r.cells.wrong}`,
);
console.log(
  `texts (item, group, rule): exact ${r.text.exact} · flagged ${r.text.uncertain} · WRONG ${r.text.wrong}`,
);
for (const e of r.errors) console.log('  ' + e);
// Fails only on something wrong that is NOT flagged for the owner.
process.exit(r.cells.wrong || r.text.wrong ? 1 : 0);
