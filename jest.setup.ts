// Global Jest setup for AutoKeep.
import { configureDataSource } from '@/features/data/dataSource';

// jest-expo stubs expo-crypto's native module; ids created in tests are well-formed UUIDv4s.
jest.mock('expo-crypto', () => ({
  ...jest.requireActual('expo-crypto'),
  randomUUID: () =>
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.floor(Math.random() * 16);
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    }),
}));

// UI suites render the labeled prototype data unless a test selects the local store explicitly.
configureDataSource({ kind: 'demo' });
