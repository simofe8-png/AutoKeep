// Cloud suites run in plain Node, where expo-crypto (an ES-module native wrapper) cannot load. The
// parts the app's auth code uses are provided by Node's crypto, so src/cloud/auth.ts talks to the
// real backend unchanged.
type MockNodeCrypto = {
  createHash(a: string): { update(d: string): { digest(e: string): string } };
  randomUUID(): string;
};

jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  CryptoEncoding: { HEX: 'hex', BASE64: 'base64' },
  randomUUID: () => jest.requireActual<MockNodeCrypto>('crypto').randomUUID(),
  digestStringAsync: async (_algorithm: string, data: string, options?: { encoding?: string }) =>
    jest
      .requireActual<MockNodeCrypto>('crypto')
      .createHash('sha256')
      .update(data)
      .digest(options?.encoding === 'base64' ? 'base64' : 'hex'),
}));
