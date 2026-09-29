import { fireEvent, renderRouter, screen, waitFor, within } from 'expo-router/testing-library';

import {
  confirmServiceDraft,
  createSchedule,
  isoDate,
  type IsoDate,
  type Timestamp,
} from '@/domain';
import { sequentialIds, T0 } from '@/domain/testing';
import { configureDataSource } from '@/features/data/dataSource';
import type { OnboardingServices } from '@/features/onboarding/services';
import { DocumentRepository, ScheduleRepository, ServiceRepository } from '@/persistence';
import { populatedWorld, type PopulatedWorld } from '@/persistence/testing/world';
import type { AcquisitionProvider } from '@/providers/acquisition/types';
import { MemoryFileStore } from '@/providers/storage/types';

/**
 * M16 (T120–T125): history and documents on real persisted data. History is chronological and
 * separate from the schedule; originals are retained and re-verified; uploads never become
 * official evidence; evidence links land on the exact location.
 */

const LONG = { timeout: 10000 };
const clock = {
  now: () => '2026-09-26T09:00:00.000Z' as Timestamp,
  today: () => isoDate('2026-09-26') as IsoDate,
};
const ids = sequentialIds(20000);
let nextUpload = { uri: 'file:///cache/manual.pdf', mimeType: 'application/pdf' };
const acquisition: AcquisitionProvider = {
  captureWithCamera: async () => ({ status: 'cancelled' }),
  pickImage: async () => ({ status: 'cancelled' }),
  pickDocument: async () => ({
    status: 'acquired',
    file: {
      ...nextUpload,
      sizeBytes: 900_000,
      source: 'file',
    },
  }),
};

let world: PopulatedWorld;
let files: MemoryFileStore;

beforeEach(async () => {
  nextUpload = { uri: 'file:///cache/manual.pdf', mimeType: 'application/pdf' };
  world = await populatedWorld(sequentialIds(1), T0);
  files = new MemoryFileStore();
  configureDataSource({
    kind: 'local',
    openDatabase: async () => world.db,
    ids: sequentialIds(8000),
    clock,
    files,
    services: {
      acquisition,
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

async function addService(date: string, km: number, title: string) {
  const r = confirmServiceDraft(
    {
      vehicleId: world.car.id,
      origin: 'manual',
      date,
      odometerKm: km,
      garageName: '',
      notes: '',
      actions: [
        { title, actionType: 'other', performed: true, maintenanceItemId: null, unlisted: true },
      ],
      documentIds: [],
      extractionId: null,
    },
    { confirmedBy: 'user', confirmedAt: T0 },
    ids,
  );
  if (!r.ok) throw new Error('fixture');
  await new ServiceRepository(world.db).add(r.value);
}

async function uploadManual() {
  await open('/documents', 'screen-documents');
  await fireEvent.press(screen.getByTestId('documents-upload'));
  await waitFor(() => expect(screen.getByTestId('documents-kind-dialog')).toBeOnTheScreen());
  await fireEvent.press(screen.getByTestId('documents-kind-owners_manual'));
  await waitFor(() =>
    expect(screen.getByTestId('documents-group-owners_manual')).toBeOnTheScreen(),
  );
  const docs = await new DocumentRepository(world.db).list(world.car.id);
  return docs.find((d) => d.kind === 'owners_manual')!;
}

describe('history (T120, T121)', () => {
  it('is chronological, newest first, whatever order records were added in', async () => {
    await addService('2026-03-01', 79000, 'בדיקת צמיגים');
    await addService('2026-09-20', 85000, 'החלפת מצבר');
    await open('/history', 'screen-history');
    const rows = within(screen.getByTestId('history-list')).getAllByRole('button');
    const labels = rows.map((r) => JSON.stringify(r.props.accessibilityLabel ?? ''));
    const order = ['20.9.2026', '1.3.2026', '10.12.2025'].map((d) =>
      labels.findIndex((l) => l.includes(d)),
    );
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('service detail shows every action, its provenance and the linked original', async () => {
    const car = (await new ServiceRepository(world.db).list(world.car.id))[0];
    await open(`/service/${car.id}`, 'screen-service-detail');
    expect(screen.getByTestId('service-evidence')).toHaveTextContent(/מסמך מוסך/);
    expect(screen.getByTestId('service-evidence')).toHaveTextContent(/אושר מתוך מסמך/);
    expect(screen.getByText('שמן מנוע')).toBeOnTheScreen();
    expect(screen.getByText('שטיפה')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('חשבונית'));
    await waitFor(() => expect(screen.getByTestId('screen-document-detail')).toBeOnTheScreen());
  });
});

describe('documents (T122–T125)', () => {
  it('an uploaded manual is kept as a user document — never official evidence', async () => {
    const doc = await uploadManual();
    expect(doc).toMatchObject({
      origin: 'user_upload',
      authority: 'user_report',
      verification: null,
    });
    expect(doc.original.storageKey).toMatch(/^originals\//);
    const group = screen.getByTestId('documents-group-owners_manual');
    expect(group).toHaveTextContent(/דיווח משתמש/);
    expect(group).toHaveTextContent(/חסר מידע/);
    // The motorcycle's professional schedule stays unavailable; the upload changes nothing there.
    expect(await new ScheduleRepository(world.db).current(world.car.id)).not.toBeNull();
    expect(await new ScheduleRepository(world.db).current(world.moto.id)).toBeNull();
  }, 30000);

  it('the original is re-verified: intact, opened through the system viewer, tamper detected', async () => {
    const doc = await uploadManual();
    await open(`/documents/${doc.id}`, 'screen-document-detail');
    await waitFor(() => expect(screen.getByTestId('document-integrity-intact')).toBeOnTheScreen());
    await fireEvent.press(screen.getByTestId('document-open-original'));
    await waitFor(() => expect(files.opened).toEqual([doc.original.storageKey]));

    files.corrupt(doc.original.storageKey);
    await open(`/documents/${doc.id}`, 'screen-document-detail');
    await waitFor(() =>
      expect(screen.getByTestId('document-integrity-modified')).toBeOnTheScreen(),
    );
  }, 30000);

  it('tapping a PDF opens it directly in the device viewer — no detour, no copy, no change', async () => {
    const doc = await uploadManual();
    const before = await new DocumentRepository(world.db).list(world.car.id);
    await fireEvent.press(screen.getByTestId(`document-${doc.id}`));
    await waitFor(() => expect(files.opened).toEqual([doc.original.storageKey]));
    expect(screen.getByTestId('screen-documents')).toBeOnTheScreen();
    expect(screen.queryByTestId('screen-document-detail')).toBeNull();
    expect(await new DocumentRepository(world.db).list(world.car.id)).toEqual(before);
  }, 30000);

  it('tapping an image opens the full-screen viewer, read-only', async () => {
    nextUpload = { uri: 'file:///cache/photo.jpg', mimeType: 'image/jpeg' };
    const doc = await uploadManual();
    const before = await new DocumentRepository(world.db).list(world.car.id);
    await fireEvent.press(screen.getByTestId(`document-${doc.id}`));
    await waitFor(
      () => expect(screen.getByTestId('document-viewer-image')).toBeOnTheScreen(),
      LONG,
    );
    // The stored original itself, rendered by the zoomable viewer.
    expect(
      JSON.stringify(screen.getByTestId('document-viewer-image-source').props.source),
    ).toContain(files.uriFor(doc.original.storageKey));
    expect(files.opened).toEqual([]);
    expect(await new DocumentRepository(world.db).list(world.car.id)).toEqual(before);
  }, 60000);

  it('a long press on a document opens its details', async () => {
    const doc = await uploadManual();
    await fireEvent(screen.getByTestId(`document-${doc.id}`), 'longPress');
    await waitFor(() => expect(screen.getByTestId('screen-document-detail')).toBeOnTheScreen());
    expect(files.opened).toEqual([]);
  }, 60000);

  it('a document whose file is not on the device says so and cannot be opened', async () => {
    const invoice = (await new DocumentRepository(world.db).list(world.car.id))[0];
    await open(`/documents/${invoice.id}`, 'screen-document-detail');
    await waitFor(() => expect(screen.getByTestId('document-integrity-missing')).toBeOnTheScreen());
    expect(screen.getByTestId('document-open-original')).toBeDisabled();
  });

  it('evidence links open the source document at the exact location (T124)', async () => {
    // The car's stored invoice stands in for the cited document (one router render per test).
    const manual = (await new DocumentRepository(world.db).list(world.car.id))[0];
    // A verified schedule whose item cites a page/section/table of that document.
    const schedule = createSchedule(
      {
        vehicleId: world.car.id,
        intervals: [
          {
            id: ids.next(),
            label: 'A',
            rule: 'distance_only',
            everyKm: 6000,
            items: [
              {
                id: ids.next(),
                title: 'שרשרת הנעה',
                actionType: 'inspection',
                manufacturerText: 'בדיקת מתיחות וסיכה',
                reference: {
                  sourceId: ids.next(),
                  documentId: manual.id,
                  page: 88,
                  section: '6.3',
                  table: '6-1',
                },
              },
            ],
          },
        ],
        evidence: [{ authority: 'manufacturer', exactApplicability: true }],
        applicability: { matchedOn: ['model', 'year'], exact: true },
      },
      ids,
      T0,
    );
    if (!schedule.ok) throw new Error('fixture');
    await new ScheduleRepository(world.db).add(schedule.value);

    await open('/next-service', 'screen-next-service');
    await fireEvent.press(screen.getByRole('button', { name: /שרשרת הנעה/ }));
    await fireEvent.press(screen.getByRole('button', { name: 'פתיחת המקור' }));
    await waitFor(() => expect(screen.getByTestId('screen-document-detail')).toBeOnTheScreen());
    expect(screen.getByTestId('document-evidence-locator')).toHaveTextContent(
      /עמ׳ 88 · סעיף 6.3 · טבלה 6-1/,
    );
  }, 40000);
});
