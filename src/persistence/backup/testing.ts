/** TEST-ONLY backup crypto (Node's SHA-256). Never imported by app code. */
import type { BackupCrypto } from './backup';

// Jest runs on Node; declare only what this test-only module needs instead of global Node types.
declare const require: (id: 'crypto') => {
  createHash(alg: 'sha256'): { update(b: Uint8Array): { digest(enc: 'hex'): string } };
};

export const nodeBackupCrypto: BackupCrypto = {
  sha256: async (bytes) => require('crypto').createHash('sha256').update(bytes).digest('hex'),
};
