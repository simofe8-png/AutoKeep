import * as Crypto from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import type { DocumentExporter } from './types';

function fromBase64(b64: string): Uint8Array {
  const bin = globalThis.atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * expo-print (HTML → PDF) + expo-sharing (system share sheet). The PDF is written into this app's
 * own cache first: expo-print's output location can be outside the app's readable scope
 * (device-verified in Expo Go: "Not allowed to read file under given URL").
 */
export const expoExporter: DocumentExporter = {
  async shareHtml(html: string, title: string) {
    const { base64 } = await Print.printToFileAsync({ html, base64: true });
    if (!base64) return false;
    const dir = new Directory(Paths.cache, 'exports');
    if (!dir.exists) dir.create({ intermediates: true });
    const file = new File(dir, `dossier-${Crypto.randomUUID()}.pdf`);
    file.write(fromBase64(base64));
    if (!(await Sharing.isAvailableAsync())) return false;
    await Sharing.shareAsync(file.uri, {
      mimeType: 'application/pdf',
      dialogTitle: title,
      UTI: 'com.adobe.pdf',
    });
    return true;
  },
};
