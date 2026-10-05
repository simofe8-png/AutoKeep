// Read-only Google Play track check (docs/release/PLAY_INTERNAL_RELEASE.md, step 5).
// Usage: node tools/play-track-status.mjs [track=internal]
// Uses the service-account key outside the repository; never prints the key or the token.
// Opens a Play "edit" only to read the track, then deletes it (nothing is committed).
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { Buffer } from 'node:buffer';
import { createSign } from 'node:crypto';

const PACKAGE = 'com.moshenahum.autokeep';
const KEY =
  process.env.PLAY_SERVICE_ACCOUNT_KEY ?? join(homedir(), '.autokeep', 'play-service-account.json');
const track = process.argv[2] ?? 'internal';

const key = JSON.parse(readFileSync(KEY, 'utf8'));
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const claim =
  b64({ alg: 'RS256', typ: 'JWT' }) +
  '.' +
  b64({
    iss: key.client_email,
    scope: 'https://www.googleapis.com/auth/androidpublisher',
    aud: key.token_uri,
    iat: now,
    exp: now + 600,
  });
const signature = createSign('RSA-SHA256')
  .update(claim)
  .sign(key.private_key)
  .toString('base64url');
const tokenRes = await fetch(key.token_uri, {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: `${claim}.${signature}`,
  }),
});
const { access_token: token, error } = await tokenRes.json();
if (!token) throw new Error(`token refused: ${error ?? tokenRes.status}`);

const api = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PACKAGE}/edits`;
const auth = { authorization: `Bearer ${token}` };
const edit = await (await fetch(api, { method: 'POST', headers: auth })).json();
if (!edit.id) throw new Error(`no access: ${edit.error?.status ?? 'unknown'}`);
try {
  const res = await (await fetch(`${api}/${edit.id}/tracks/${track}`, { headers: auth })).json();
  const releases = (res.releases ?? []).map((r) => ({
    status: r.status,
    versionCodes: r.versionCodes,
  }));
  console.log(JSON.stringify({ track, releases }));
} finally {
  await fetch(`${api}/${edit.id}`, { method: 'DELETE', headers: auth });
}
