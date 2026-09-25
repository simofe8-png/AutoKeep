/**
 * Auth session storage backed by the platform keystore (expo-secure-store). Sessions can exceed
 * the ~2 KB value limit, so values are split into chunks under `<key>.<n>` with a count record.
 * Tokens never go to AsyncStorage or plain files (SECURITY.md).
 */
export interface KeyValueBackend {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}

export const CHUNK_SIZE = 1800;

// SecureStore keys allow only [A-Za-z0-9._-].
const safeKey = (key: string) => key.replace(/[^A-Za-z0-9._-]/g, '_');

export function createChunkedStorage(backend: KeyValueBackend) {
  const countKey = (key: string) => `${safeKey(key)}.count`;
  const chunkKey = (key: string, i: number) => `${safeKey(key)}.${i}`;

  async function removeItem(key: string): Promise<void> {
    const count = Number((await backend.getItemAsync(countKey(key))) ?? '0');
    for (let i = 0; i < count; i++) await backend.deleteItemAsync(chunkKey(key, i));
    await backend.deleteItemAsync(countKey(key));
  }

  return {
    async getItem(key: string): Promise<string | null> {
      const raw = await backend.getItemAsync(countKey(key));
      if (raw === null) return null;
      const count = Number(raw);
      const parts: string[] = [];
      for (let i = 0; i < count; i++) {
        const part = await backend.getItemAsync(chunkKey(key, i));
        if (part === null) return null; // partial write → treat as absent (forces re-login)
        parts.push(part);
      }
      return parts.join('');
    },
    async setItem(key: string, value: string): Promise<void> {
      await removeItem(key);
      const chunks = Math.max(1, Math.ceil(value.length / CHUNK_SIZE));
      for (let i = 0; i < chunks; i++) {
        await backend.setItemAsync(
          chunkKey(key, i),
          value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE),
        );
      }
      await backend.setItemAsync(countKey(key), String(chunks));
    },
    removeItem,
  };
}
