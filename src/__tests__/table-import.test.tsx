import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import { isoDate, type IsoDate, type Timestamp, type VehicleId } from '@/domain';
import { sequentialIds } from '@/domain/testing';
import { configureDataSource } from '@/features/data/dataSource';
import { LocalStore } from '@/features/data/localStore';
import type { OnboardingServices } from '@/features/onboarding/services';
import { ServiceTableRepository } from '@/persistence';
import { openTestDatabase } from '@/persistence/testing/sqljsDatabase';
import type { AcquiredFile } from '@/providers/acquisition/types';
import { MemoryFileStore } from '@/providers/storage/types';

/**
 * Importing the booklet's table (fix 2026-10-07): camera and file both read, several pages /
 * files are read together as ONE table, a single file still works, and an unreadable input says
 * so. The on-device reader is replaced by the reading of the owner's real scan (page by page).
 */
const mockReads: number[] = [];
jest.mock('@/features/maintenance/msource/ocrBridge', () => ({
  ocrBridge: {
    // The hidden reader host only listens; the page itself is replaced below.
    subscribe: () => () => undefined,
    readTable: jest.fn(async (bytes: Uint8Array) => {
      mockReads.push(bytes[0]);
      // Byte 0 tells the fake page apart: 1 = booklet page 143, 2 = page 144, 9 = no table.
      const pages = require('@/features/maintenance/table/__tests__/fiesta-scan.json');
      return bytes[0] === 9 ? null : pages[bytes[0] - 1];
    }),
  },
}));
jest.mock('expo-file-system', () => ({
  ...jest.requireActual('expo-file-system'),
  File: class {
    mockUri: string;
    constructor(mockUri: string) {
      this.mockUri = mockUri;
    }
    async bytes() {
      return new Uint8Array([Number(this.mockUri.slice(-1)), 0xd8]);
    }
  },
}));

const LONG = { timeout: 15000 };
const clock = {
  now: () => '2026-10-07T09:00:00.000Z' as Timestamp,
  today: () => isoDate('2026-10-07') as IsoDate,
};
const VEHICLE = '00000000-0000-4000-8000-00000000f001';
const page = (n: number): AcquiredFile => ({
  uri: `file:///cache/page${n}`,
  mimeType: 'image/jpeg',
  sizeBytes: 100,
  source: 'camera',
});
let db: Awaited<ReturnType<typeof openTestDatabase>>;

async function seed(acquisition: OnboardingServices['acquisition']) {
  mockReads.length = 0;
  db = await openTestDatabase();
  const store = await LocalStore.open(db, sequentialIds(1), clock, new MemoryFileStore());
  await store.addVehicle(
    {
      id: VEHICLE,
      kind: 'car',
      manufacturer: 'מאזדה יפן',
      model: 'MAZDA 3',
      year: 2012,
      registration: '12-345-67',
      odometerKm: 158_300,
      odometerMeasuredAt: '2026-10-07',
      archived: false,
    },
    { engine: '1598 סמ״ק', fuel: 'בנזין' },
  );
  await store.setActiveVehicle(VEHICLE);
  configureDataSource({
    kind: 'local',
    openDatabase: async () => db,
    ids: sequentialIds(7000),
    clock,
    files: new MemoryFileStore(),
    services: {
      acquisition,
      extractor: null,
      registry: {} as OnboardingServices['registry'],
      invoiceReader: null,
    },
  });
  await renderRouter('./src/app', { initialUrl: '/maintenance?tab=table' });
  await waitFor(() => expect(screen.getByTestId('table-empty')).toBeOnTheScreen(), LONG);
}
afterEach(() => configureDataSource({ kind: 'demo' }));

const stored = () => new ServiceTableRepository(db).get(VEHICLE as VehicleId);
const cancelled = async () => ({ status: 'cancelled' as const });

describe('importing the maintenance table', () => {
  it('camera: two pages photographed, then read together as one table', async () => {
    let n = 0;
    await seed({
      captureWithCamera: async () => ({ status: 'acquired', file: page(++n) }),
      pickImage: cancelled,
      pickDocument: cancelled,
    });
    await fireEvent.press(screen.getByTestId('table-photo'));
    await waitFor(() => expect(screen.getByTestId('table-pages')).toBeOnTheScreen(), LONG);
    expect(screen.getByTestId('table-pages')).toHaveTextContent(/צולם עמוד אחד/);
    await fireEvent.press(screen.getByTestId('table-add-page'));
    await waitFor(
      () => expect(screen.getByTestId('table-pages')).toHaveTextContent(/צולמו 2 עמודים/),
      LONG,
    );
    await fireEvent.press(screen.getByTestId('table-read-pages'));
    await waitFor(() => expect(screen.getByTestId('table-proposed')).toBeOnTheScreen(), LONG);
    expect(mockReads).toEqual([1, 2]);
    const t = await stored();
    // Both booklet pages in one table: 25 + 13 items, read from a photo, for the owner's review.
    expect(t).toMatchObject({ status: 'proposed', source: 'photo' });
    expect(t?.table.rows).toHaveLength(38);
  }, 60000);

  it('file: several files selected at once are read together; one file still works', async () => {
    await seed({
      captureWithCamera: cancelled,
      pickImage: cancelled,
      pickDocument: async () => ({ status: 'acquired', file: { ...page(1), source: 'file' } }),
      pickDocuments: async () => ({
        status: 'acquired',
        files: [
          { ...page(1), source: 'file' },
          { ...page(2), source: 'file' },
        ],
      }),
    });
    await fireEvent.press(screen.getByTestId('table-file'));
    await waitFor(() => expect(screen.getByTestId('table-proposed')).toBeOnTheScreen(), LONG);
    expect(mockReads).toEqual([1, 2]);
    expect((await stored())?.table.rows).toHaveLength(38);
  }, 60000);

  it('a provider with a single-file picker still imports that one file', async () => {
    await seed({
      captureWithCamera: cancelled,
      pickImage: cancelled,
      pickDocument: async () => ({ status: 'acquired', file: { ...page(1), source: 'file' } }),
    });
    await fireEvent.press(screen.getByTestId('table-file'));
    await waitFor(() => expect(screen.getByTestId('table-proposed')).toBeOnTheScreen(), LONG);
    expect(mockReads).toEqual([1]);
    expect((await stored())?.table.rows).toHaveLength(25);
  }, 60000);

  it('an input with no table says so clearly; manual entry stays available', async () => {
    await seed({
      captureWithCamera: async () => ({ status: 'acquired', file: page(9) }),
      pickImage: cancelled,
      pickDocument: cancelled,
    });
    await fireEvent.press(screen.getByTestId('table-photo'));
    await waitFor(() => expect(screen.getByTestId('table-read-pages')).toBeOnTheScreen(), LONG);
    await fireEvent.press(screen.getByTestId('table-read-pages'));
    await waitFor(() => expect(screen.getByTestId('table-read-failed')).toBeOnTheScreen(), LONG);
    expect(screen.getByTestId('table-read-failed')).toHaveTextContent(/לא נמצאה טבלה בתמונה/);
    expect(screen.getByTestId('table-manual')).toBeOnTheScreen();
    expect(await stored()).toBeNull();
  }, 60000);
});
