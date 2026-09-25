import { CHUNK_SIZE, createChunkedStorage, type KeyValueBackend } from '../secureSessionStorage';

function memoryBackend(): KeyValueBackend & { keys: () => string[] } {
  const m = new Map<string, string>();
  return {
    getItemAsync: async (k) => m.get(k) ?? null,
    setItemAsync: async (k, v) => {
      if (!/^[A-Za-z0-9._-]+$/.test(k)) throw new Error(`invalid SecureStore key ${k}`);
      if (v.length > 2048) throw new Error('value too large for SecureStore');
      m.set(k, v);
    },
    deleteItemAsync: async (k) => {
      m.delete(k);
    },
    keys: () => [...m.keys()],
  };
}

describe('chunked secure session storage (T060)', () => {
  it('round-trips values larger than the keystore limit with safe keys', async () => {
    const backend = memoryBackend();
    const s = createChunkedStorage(backend);
    const session = JSON.stringify({ access_token: 'x'.repeat(5000), refresh_token: 'r' });
    await s.setItem('sb-127-auth-token', session);
    expect(await s.getItem('sb-127-auth-token')).toBe(session);
    expect(backend.keys().length).toBe(Math.ceil(session.length / CHUNK_SIZE) + 1);
  });

  it('overwrites and removes all chunks (sign-out leaves nothing behind)', async () => {
    const backend = memoryBackend();
    const s = createChunkedStorage(backend);
    await s.setItem('k:1', 'a'.repeat(4000));
    await s.setItem('k:1', 'short');
    expect(await s.getItem('k:1')).toBe('short');
    expect(backend.keys()).toHaveLength(2);
    await s.removeItem('k:1');
    expect(backend.keys()).toEqual([]);
    expect(await s.getItem('k:1')).toBeNull();
  });

  it('treats a partially written session as absent', async () => {
    const backend = memoryBackend();
    const s = createChunkedStorage(backend);
    await s.setItem('k', 'b'.repeat(4000));
    await backend.deleteItemAsync('k.1');
    expect(await s.getItem('k')).toBeNull();
  });
});
