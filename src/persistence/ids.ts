import * as Crypto from 'expo-crypto';

import { asId, type Id, type IdGenerator } from '@/domain';

/** Production id source: cryptographically random UUIDv4 generated on device (offline-safe). */
export const uuidIds: IdGenerator = {
  next<Tag extends string>(): Id<Tag> {
    return asId<Tag>(Crypto.randomUUID());
  },
};
