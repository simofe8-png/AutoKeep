/**
 * MOCK DATA — labelled demo only (EXPO_PUBLIC_DEMO_DATA=1 / UI tests in demo mode). A fake Ministry
 * registry so the Add Vehicle flow can be exercised without a network. Never used in real mode.
 */
import type { VehicleRegistryProvider } from '@/providers/registry/types';

export const DEMO_REGISTRY: VehicleRegistryProvider = {
  id: 'demo-registry (MOCK)',
  lookup: async () => ({
    status: 'found',
    retrievedAt: '2026-01-01T00:00:00.000Z',
    candidates: [
      {
        type: 'car',
        manufacturer: 'מאזדה',
        model: '3',
        year: 2020,
        trim: 'Comfort',
        engine: '1998 סמ״ק',
        fuel: 'בנזין',
        color: 'לבן',
        dataset: 'demo',
        record: {
          sources: ['demo'],
          retrievedAt: '2026-01-01T00:00:00.000Z',
          facts: [
            { key: 'manufacturer', group: 'identity', kind: 'text', value: 'מאזדה' },
            { key: 'commercialName', group: 'identity', kind: 'text', value: '3' },
            { key: 'modelYear', group: 'identity', kind: 'number', value: 2020 },
            { key: 'color', group: 'identity', kind: 'text', value: 'לבן' },
            { key: 'fuel', group: 'technical', kind: 'text', value: 'בנזין' },
          ],
        },
      },
    ],
  }),
};
