import { anonClient, userClient } from '@/cloud/testing/localStack';
import { wrapUntrusted } from '@/intelligence/injection';

import { DocumentIntelligenceUnavailable, edgeDocumentReader } from '../edgeDocumentReader';

/**
 * ADR-0017 server-side document intelligence, against the LOCAL stack's edge runtime. No vendor is
 * approved yet, so the contract is: authenticated only, inputs validated, and `not_configured`
 * surfaces in the app as "reading unavailable" (typed error), never as data.
 */

describe('document-intelligence function (local stack)', () => {
  it('rejects anonymous callers', async () => {
    const { error } = await anonClient().functions.invoke('document-intelligence', {
      body: { task: 'ocr', mimeType: 'image/jpeg', dataBase64: 'AAAA' },
      headers: { Authorization: '' },
    });
    expect(error).toBeTruthy();
  });

  it('validates input before anything else', async () => {
    const { client } = await userClient('docai');
    const { error, response } = await client.functions.invoke('document-intelligence', {
      body: { task: 'ocr', mimeType: 'text/html', dataBase64: 'AAAA' },
    });
    expect(error).toBeTruthy();
    expect(response?.status).toBe(415);
  });

  it('without an approved vendor, the client adapter reports "unavailable" — never data', async () => {
    const { client } = await userClient('docai');
    const reader = edgeDocumentReader(client, async () => new Uint8Array([1, 2, 3]));
    await expect(
      reader.ocr.recognize(
        { uri: 'file:///originals/x.jpg', mimeType: 'image/jpeg' },
        { languages: ['he'] },
      ),
    ).rejects.toBeInstanceOf(DocumentIntelligenceUnavailable);
    const content = wrapUntrusted({
      producedBy: 't',
      pages: [{ number: 1, lines: [{ text: 'x', confidence: 1 }] }],
    });
    await expect(reader.extractor.extract('invoice', content)).rejects.toBeInstanceOf(
      DocumentIntelligenceUnavailable,
    );
  });
});
