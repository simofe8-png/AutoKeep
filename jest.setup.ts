// Global Jest setup for AutoKeep.
import { configureDataSource } from '@/features/data/dataSource';

type MockNodeCrypto = {
  createHash(a: string): { update(d: string): { digest(e: string): string } };
};

// jest-expo stubs expo-crypto's native module; ids created in tests are well-formed UUIDv4s.
jest.mock('expo-crypto', () => ({
  ...jest.requireActual('expo-crypto'),
  randomUUID: () =>
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.floor(Math.random() * 16);
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    }),
  // Real SHA-256 (Node) so derived values match the server's Web Crypto digests.
  digestStringAsync: async (_algorithm: string, data: string, options?: { encoding?: string }) =>
    jest
      .requireActual<MockNodeCrypto>('crypto')
      .createHash('sha256')
      .update(data)
      .digest(options?.encoding === 'base64' ? 'base64' : 'hex'),
}));

// UI suites render the labeled prototype data unless a test selects the local store explicitly.
configureDataSource({ kind: 'demo' });
