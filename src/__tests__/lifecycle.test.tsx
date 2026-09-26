import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import { isoDate, type IsoDate, type Timestamp } from '@/domain';
import { sequentialIds, T0 } from '@/domain/testing';
import { configureDataSource } from '@/features/data/dataSource';
import { LocalStore } from '@/features/data/localStore';
import { buildDossierHtml } from '@/features/dossier/dossierHtml';
import type { OnboardingServices } from '@/features/onboarding/services';
import {
  ActiveVehicleStore,
  DocumentRepository,
  ServiceRepository,
  VehicleRepository,
} from '@/persistence';
import { populatedWorld, type PopulatedWorld } from '@/persistence/testing/world';
import { MemoryExporter } from '@/providers/export/types';
import { MemoryFileStore } from '@/providers/storage/types';

/**
 * M20 (T144–T149): vehicle lifecycle on real data. Archive is not deletion; permanent deletion
 * is previewed exactly, needs typed confirmation, removes rows AND stored originals, and touches
 * no other vehicle; the dossier is generated from the records with provenance on every fact.
 */

const LONG = { timeout: 10000 };
const clock = {
  now: () => '2026-09-26T09:00:00.000Z' as Timestamp,
  today: () => isoDate('2026-09-26') as IsoDate,
};

let world: PopulatedWorld;
let files: MemoryFileStore;
let exporter: MemoryExporter;

beforeEach(async () => {
  world = await populatedWorld(sequentialIds(1), T0);
  files = new MemoryFileStore();
  exporter = new MemoryExporter();
  // A stored original for the car (so deletion must clean it up).
  const store = await LocalStore.open(world.db, sequentialIds(60000), clock, files);
  await store.addDocument(
    world.car.id,
    {
      documentId: '00000000-0000-4000-8000-00000000d0d1',
      file: {
        uri: 'file:///cache/m.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 5,
        source: 'file',
      },
      title: 'ספר בעלים',
    },
    'owners_manual',
  );
  configureDataSource({
    kind: 'local',
    openDatabase: async () => world.db,
    ids: sequentialIds(8000),
    clock,
    files,
    exporter,
    services: {
      acquisition: {} as OnboardingServices['acquisition'],
      extractor: null,
      registry: {} as OnboardingServices['registry'],
      invoiceReader: null,
    },
  });
});
afterEach(() => configureDataSource({ kind: 'demo' }));

async function open(url: string, testID: string) {
  await renderRouter('./src/app', { initialUrl: url });
  await waitFor(() => expect(screen.getByTestId(testID)).toBeOnTheScreen(), LONG);
}

describe('archive / restore (T144)', () => {
  it('archiving keeps every record and removes the vehicle from the active context', async () => {
    await open(`/vehicle/${world.car.id}`, 'screen-vehicle-manage');
    await fireEvent.press(screen.getByTestId('vehicle-archive'));
    await fireEvent.press(screen.getByTestId('archive-dialog-confirm'));
    await waitFor(() => expect(screen.queryByTestId('archive-dialog')).toBeNull());
    await waitFor(() => expect(screen.queryByTestId('screen-vehicle-manage')).toBeNull(), LONG);
    const v = await new VehicleRepository(world.db).get(world.car.id);
    expect(v?.lifecycle).toBe('archived');
    expect(await new ServiceRepository(world.db).list(world.car.id)).toHaveLength(1);
    expect(await new ActiveVehicleStore(world.db).get()).toBe(world.moto.id);
  }, 40000);

  it('a restored vehicle is selectable again with its history intact', async () => {
    const store = await LocalStore.open(world.db, sequentialIds(70000), clock, files);
    await store.archiveVehicle(world.car.id);
    await open(`/vehicle/${world.car.id}`, 'screen-vehicle-manage');
    await fireEvent.press(screen.getByTestId('vehicle-restore'));
    await waitFor(() => expect(screen.queryByTestId('screen-vehicle-manage')).toBeNull(), LONG);
    expect((await new VehicleRepository(world.db).get(world.car.id))?.lifecycle).toBe('active');
    expect(await new ServiceRepository(world.db).list(world.car.id)).toHaveLength(1);
  }, 40000);
});

describe('permanent deletion (T145, T146)', () => {
  it('previews exact counts, requires the registration, removes rows and originals only for this vehicle', async () => {
    await open(`/vehicle/${world.car.id}`, 'screen-vehicle-manage');
    await fireEvent.press(screen.getByTestId('vehicle-delete'));
    await waitFor(() => expect(screen.getByTestId('delete-preview')).toBeOnTheScreen());
    const preview = screen.getByTestId('delete-preview');
    expect(preview).toHaveTextContent(/1 רישומי טיפול/);
    expect(preview).toHaveTextContent(/2 מסמכים/);
    expect(preview).toHaveTextContent(/2 קריאות מד אוץ/);
    expect(preview).toHaveTextContent(/1 הערות מוסך/);

    await fireEvent.changeText(screen.getByTestId('delete-confirm-input'), '12-345-00');
    expect(screen.getByTestId('delete-dialog-confirm')).toBeDisabled();
    await fireEvent.changeText(screen.getByTestId('delete-confirm-input'), '12-345-67');
    await fireEvent.press(screen.getByTestId('delete-dialog-confirm'));
    await waitFor(() => expect(screen.getByTestId('screen-vehicle-deleted')).toBeOnTheScreen());

    const vehicles = new VehicleRepository(world.db);
    // The deletion write settles: the car's original file is gone from storage.
    await waitFor(() => expect(files.files.size).toBe(0), LONG);
    expect(await vehicles.get(world.car.id)).toBeNull();
    expect(await new DocumentRepository(world.db).list(world.car.id)).toEqual([]);
    // The other vehicle is untouched.
    expect(await vehicles.get(world.moto.id)).not.toBeNull();
    expect(await new ServiceRepository(world.db).list(world.moto.id)).toHaveLength(1);
  }, 40000);
});

describe('dossier (T147–T149)', () => {
  it('is generated from the records with provenance, and shared as a document', async () => {
    await open(`/vehicle/${world.car.id}/dossier`, 'screen-dossier');
    expect(screen.getByTestId('dossier-readings')).toHaveTextContent(/84,250/);
    expect(screen.getByTestId('dossier-readings')).toHaveTextContent(/דווח על ידי המשתמש/);
    await fireEvent.press(screen.getByTestId('dossier-share'));
    await waitFor(() => expect(exporter.shared).toHaveLength(1));
    const html = exporter.shared[0].html;
    expect(html).toMatch(/dir="rtl"/);
    expect(html).toMatch(/טויוטה קורולה 2019/);
    expect(html).toMatch(/מסמך מוסך · מאומת/); // garage-document service
    expect(html).toMatch(/לוח תחזוקה מאומת/);
    expect(html).not.toMatch(/CB500F/);
  }, 40000);

  it('an export failure is explained; nothing half-done is claimed', async () => {
    exporter.fail = true;
    await open(`/vehicle/${world.moto.id}/dossier`, 'screen-dossier');
    await fireEvent.press(screen.getByTestId('dossier-share'));
    await waitFor(() => expect(screen.getByTestId('dossier-share-info')).toBeOnTheScreen());
  });
});

describe('dossier HTML (T148)', () => {
  it('escapes user text and never claims an unverified schedule', () => {
    const html = buildDossierHtml(
      {
        id: 'v',
        kind: 'car',
        manufacturer: '<script>x</script>',
        model: 'M',
        year: 2020,
        registration: '1',
        odometerKm: 1,
        odometerMeasuredAt: '2026-01-01',
        archived: false,
      },
      {
        schedule: { status: 'pending', upcoming: [] },
        history: [],
        documents: [],
        alerts: [],
        garageRecommendations: [],
        deferred: [],
        readings: [{ id: 'r', date: '2026-01-01', km: 1, source: 'onboarding' }],
      },
      '2026-09-26',
    );
    expect(html).not.toMatch(/<script>/);
    expect(html).toMatch(/&lt;script&gt;/);
    expect(html).toMatch(/אין לוח תחזוקה מאומת/);
    expect(html).toMatch(/בהוספת הרכב/);
  });
});
