// Supabase Edge Function (Deno): server-side document intelligence (ADR-0017).
//
// Vendor-agnostic contract. Vendor keys live ONLY here (function secrets), never in the app. Until a
// vendor is approved and configured (DOC_AI_PROVIDER + its secret), every task answers
// 501 { error: 'not_configured' } and the app keeps "reading unavailable". All trust decisions
// (schema validation, grounding against OCR text, injection flags, drafts only) stay in the app.
//
// Request (JSON, authenticated user only — verify_jwt):
//   { task: 'ocr', mimeType, dataBase64 }                      → { pages: [{ number, lines:[{text, confidence}] }] }
//   { task: 'extract', kind: 'invoice'|'maintenance_schedule', boundary, pages:[{number,text}] }
//                                                               → { proposal: unknown }

const MAX_BYTES = 20 * 1024 * 1024;
const ALLOWED = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/heic']);

type Json = Record<string, unknown>;
const reply = (status: number, body: Json) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return reply(405, { error: 'method_not_allowed' });
  let body: Json;
  try {
    body = await req.json();
  } catch {
    return reply(400, { error: 'invalid_json' });
  }
  const task = body.task;
  if (task === 'ocr') {
    if (typeof body.mimeType !== 'string' || !ALLOWED.has(body.mimeType))
      return reply(415, { error: 'unsupported_type' });
    if (typeof body.dataBase64 !== 'string' || (body.dataBase64.length * 3) / 4 > MAX_BYTES)
      return reply(413, { error: 'too_large' });
  } else if (task === 'extract') {
    if (body.kind !== 'invoice' && body.kind !== 'maintenance_schedule')
      return reply(400, { error: 'invalid_kind' });
    if (!Array.isArray(body.pages) || typeof body.boundary !== 'string')
      return reply(400, { error: 'invalid_content' });
  } else {
    return reply(400, { error: 'invalid_task' });
  }

  const provider = Deno.env.get('DOC_AI_PROVIDER');
  if (!provider) return reply(501, { error: 'not_configured' });
  // Approved vendor adapters are added here (G2: vendor choice is a separate approval).
  return reply(501, { error: 'not_configured', provider });
});
