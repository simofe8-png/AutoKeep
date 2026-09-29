// AutoKeep vehicle MODEL reference images — operator tool (service role; never in the app).
//
//   node tools/reference-images.mjs --target local|staging publish <id>     (data/reference-images/<id>.json + .png)
//   node tools/reference-images.mjs --target local|staging list
//   node tools/reference-images.mjs --target local|staging withdraw <id>
//
// Fail-closed (owner decisions 2026-09-29): only an approved record whose rights clearly permit
// AutoKeep's use (commercial; adaptations when the image was modified) is published, and only if
// the binary's SHA-256 equals the record. The full rights record is stored in the catalog row,
// independently of the binary.
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { adminFor, target } from './beta-admin.mjs';

const DIR = resolve(fileURLToPath(new URL('.', import.meta.url)), '..', 'data', 'reference-images');
const BUCKET = 'vehicle-references';

export function validateRecord(rec, bytes) {
  const problems = [];
  const r = rec.rights ?? {};
  if (rec.review?.status !== 'approved') problems.push('review.status is not "approved"');
  if (r.commercialUseAllowed !== true) problems.push('commercial use is not clearly allowed');
  if ((rec.derivative?.operations ?? []).length > 0 && r.adaptationsAllowed !== true) {
    problems.push('the image was modified but the license does not allow adaptations');
  }
  for (const f of ['license', 'licenseUrl', 'author'])
    if (!r[f]) problems.push(`rights.${f} missing`);
  if (!rec.source?.pageUrl || !rec.source?.originalSha256)
    problems.push('source provenance missing');
  if (!/^v1(\/[a-z0-9-]+){6}$/.test(rec.classKey ?? '')) problems.push('classKey is malformed');
  if (!rec.display?.credit || rec.display?.label !== 'תמונת דגם להמחשה')
    problems.push('display label/credit missing');
  const sha = createHash('sha256').update(bytes).digest('hex');
  if (sha !== rec.derivative?.resultSha256) problems.push(`binary sha256 ${sha} != record`);
  return problems;
}

async function publish(admin, id) {
  const rec = JSON.parse(readFileSync(resolve(DIR, `${id}.json`), 'utf8'));
  const bytes = readFileSync(resolve(DIR, `${id}.png`));
  const problems = validateRecord(rec, bytes);
  if (problems.length) throw new Error(`refused:\n - ${problems.join('\n - ')}`);
  const path = `${rec.id}/${rec.derivative.resultSha256}.png`;
  const up = await admin.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: 'image/png', upsert: false });
  if (up.error && !/exists|Duplicate/i.test(up.error.message))
    throw new Error(`upload: ${up.error.message}`);
  const row = {
    id: rec.id,
    class_key: rec.classKey,
    status: 'approved',
    storage_path: path,
    image_sha256: rec.derivative.resultSha256,
    width: 0,
    height: 0,
    label: rec.display.label,
    credit: rec.display.credit,
    source_url: rec.source.pageUrl,
    license: rec.rights.license,
    license_url: rec.rights.licenseUrl,
    author: rec.rights.author,
    modification_notice: rec.derivative.notice ?? null,
    record: rec,
    updated_at: new Date().toISOString(),
  };
  // PNG IHDR: width/height at bytes 16..23.
  row.width = bytes.readUInt32BE(16);
  row.height = bytes.readUInt32BE(20);
  const { error } = await admin.from('vehicle_reference_images').upsert(row);
  if (error) throw new Error(`upsert: ${error.message}`);
  // Verify what the app will download.
  const { data } = admin.storage.from(BUCKET).getPublicUrl(path);
  const res = await fetch(data.publicUrl);
  const served = createHash('sha256')
    .update(Buffer.from(await res.arrayBuffer()))
    .digest('hex');
  if (res.status !== 200 || served !== rec.derivative.resultSha256) {
    throw new Error(`served binary mismatch (HTTP ${res.status}, sha256 ${served})`);
  }
  console.log(
    `published ${rec.id} → ${rec.classKey}\n  ${data.publicUrl}\n  sha256 ${served} (verified via public URL)`,
  );
}

async function main(argv) {
  const t = argv.indexOf('--target');
  if (t < 0) throw new Error('--target local|staging is required');
  const admin = adminFor(target(argv[t + 1]));
  const [cmd, id] = argv.filter((_, i) => i !== t && i !== t + 1);
  if (cmd === 'publish') return publish(admin, id);
  if (cmd === 'list') {
    const { data, error } = await admin
      .from('vehicle_reference_images')
      .select('id, class_key, status, license, author, image_sha256')
      .order('class_key');
    if (error) throw error;
    for (const r of data)
      console.log(
        `${r.status.padEnd(9)} ${r.class_key}  ${r.id}  ${r.license}  ${r.author}  ${r.image_sha256.slice(0, 12)}…`,
      );
    return;
  }
  if (cmd === 'withdraw') {
    const { error } = await admin
      .from('vehicle_reference_images')
      .update({ status: 'withdrawn', updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
    console.log(`withdrawn ${id}`);
    return;
  }
  throw new Error('usage: --target local|staging publish <id> | list | withdraw <id>');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
