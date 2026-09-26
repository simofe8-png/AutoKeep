import { fireEvent, renderRouter, screen, waitFor, within } from 'expo-router/testing-library';

import { isoDate, type IsoDate, type Timestamp } from '@/domain';
import { sequentialIds, T0 } from '@/domain/testing';
import { configureDataSource } from '@/features/data/dataSource';
import type { OnboardingServices } from '@/features/onboarding/services';
import { DocumentRepository, ServiceRepository } from '@/persistence';
import { populatedWorld, type PopulatedWorld } from '@/persistence/testing/world';
import type { AcquisitionProvider } from '@/providers/acquisition/types';
import { MockOcrProvider, MockStructuredExtractor } from '@/providers/intelligence/mocks';
import { MemoryFileStore } from '@/providers/storage/types';

/**
 * M15 (T113–T119): service capture on real persisted data. Checked = performed, the action type is
 * chosen independently, unlisted actions are kept as such, extraction only ever yields a draft,
 * and only the explicit confirmation writes the record together with its original document.
 */

const LONG = { timeout: 10000 };
const clock = {
  now: () => '2026-09-26T09:00:00.000Z' as Timestamp,
  today: () => isoDate('2026-09-26') as IsoDate,
};
const acquisition: AcquisitionProvider = {
  captureWithCamera: async () => ({
    status: 'acquired',
    file: {
      uri: 'file:///cache/invoice.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 4096,
      source: 'camera',
    },
  }),
  pickImage: async () => ({ status: 'cancelled' }),
  pickDocument: async () => ({ status: 'rejected', reason: 'unsupported_type' }),
};

let world: PopulatedWorld;
let files: MemoryFileStore;

async function setup(invoiceReader: OnboardingServices['invoiceReader']) {
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
      invoiceReader,
    },
  });
}
afterEach(() => configureDataSource({ kind: 'demo' }));

async function open(url: string, testID: string) {
  await renderRouter('./src/app', { initialUrl: url });
  await waitFor(() => expect(screen.getByTestId(testID)).toBeOnTheScreen(), LONG);
}

async function confirm() {
  await fireEvent.press(screen.getByTestId('service-confirm'));
  await waitFor(() => expect(screen.getByTestId('service-confirm-dialog')).toBeOnTheScreen());
  await fireEvent.press(screen.getByTestId('service-confirm-dialog-confirm'));
  await waitFor(() => expect(screen.getByTestId('screen-history')).toBeOnTheScreen(), LONG);
}

describe('manual service entry on real data (T113, T116, T117, T118)', () => {
  it('checked = performed, action type independent, unlisted kept; stored only on confirmation', async () => {
    await setup(null);
    await open('/service/new', 'screen-service-new');
    await fireEvent.press(screen.getByTestId('service-method-manual'));
    await waitFor(() => expect(screen.getByTestId('screen-service-manual')).toBeOnTheScreen());

    // Manufacturer item from the verified schedule: performed, but recorded as an inspection.
    await fireEvent.press(screen.getByRole('checkbox', { name: 'שמן מנוע' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'בדיקה' }));
    await fireEvent.changeText(screen.getByTestId('new-action-input'), 'החלפת מצבר');
    await fireEvent.press(screen.getByTestId('add-action'));
    await fireEvent.changeText(screen.getByTestId('service-date'), '2026-09-20');
    await fireEvent.changeText(screen.getByTestId('service-odometer'), '85,000');
    await fireEvent.press(screen.getByTestId('service-to-review'));
    await waitFor(() => expect(screen.getByTestId('screen-service-review')).toBeOnTheScreen());

    // Nothing is stored before the explicit confirmation.
    const services = new ServiceRepository(world.db);
    expect(await services.list(world.car.id)).toHaveLength(1);
    await confirm();

    const saved = (await services.list(world.car.id)).find((e) => e.date === '2026-09-20')!;
    expect(saved).toMatchObject({ odometerKm: 85000, origin: 'manual', authority: 'user_report' });
    expect(saved.verification.state).toBe('unverified');
    const oil = saved.actions.find((a) => a.title === 'שמן מנוע')!;
    expect(oil).toMatchObject({ performed: true, actionType: 'inspection', unlisted: false });
    expect(oil.maintenanceItemId).not.toBeNull();
    const battery = saved.actions.find((a) => a.title === 'החלפת מצבר')!;
    expect(battery).toMatchObject({ unlisted: true, maintenanceItemId: null });
    // Unchecked items are not stored as performed.
    expect(saved.actions.every((a) => a.performed)).toBe(true);
    await waitFor(() => expect(screen.getByTestId('history-list')).toHaveTextContent(/החלפת מצבר/));
  }, 40000);
});

describe('invoice capture on real data (T114, T115, T118)', () => {
  it('without a reading provider: the original is attached, the user fills the draft', async () => {
    await setup(null);
    await open('/service/new', 'screen-service-new');
    await fireEvent.press(screen.getByTestId('service-method-photo'));
    await waitFor(
      () => expect(screen.getByTestId('screen-service-review')).toBeOnTheScreen(),
      LONG,
    );
    expect(screen.getByTestId('review-reading-note')).toHaveTextContent(/אינה זמינה עדיין/);
    expect(screen.getByTestId('review-original-document')).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByTestId('new-action-input'), 'החלפת מצבר');
    await fireEvent.press(screen.getByTestId('add-action'));
    await fireEvent.changeText(screen.getByTestId('service-date'), '2026-09-21');
    expect(files.files.size).toBe(0);
    await confirm();

    const saved = (await new ServiceRepository(world.db).list(world.car.id)).find(
      (e) => e.date === '2026-09-21',
    )!;
    expect(saved).toMatchObject({ origin: 'document', authority: 'garage_document' });
    expect(saved.verification.state).toBe('verified');
    const doc = await new DocumentRepository(world.db).get(world.car.id, saved.documentIds[0]);
    expect(doc).toMatchObject({
      kind: 'invoice',
      origin: 'camera_scan',
      authority: 'garage_document',
    });
    expect(doc?.original.storageKey).toMatch(/^originals\//);
    expect(files.files.size).toBe(1);
  }, 40000);

  it('with a (mock) reader: values are prefilled as a draft with uncertain marks; nothing auto-commits', async () => {
    const ocr = new MockOcrProvider(() => ({
      producedBy: 'x',
      pages: [
        { number: 1, lines: [{ text: 'מוסך הדגמה 18/09/2026 ק"מ 84,190', confidence: 0.9 }] },
      ],
    }));
    const extractor = new MockStructuredExtractor(() => ({
      date: { value: '2026-09-18', confidence: 0.95 },
      odometerKm: { value: 84190, confidence: 0.7 },
      garageName: { value: 'מוסך הדגמה', confidence: 0.95 },
      lines: [{ description: 'החלפת נורת בלם', actionType: 'replacement', confidence: 0.95 }],
    }));
    await setup({ ocr, extractor });
    await open('/service/new', 'screen-service-new');
    await fireEvent.press(screen.getByTestId('service-method-photo'));
    await waitFor(
      () => expect(screen.getByTestId('screen-service-review')).toBeOnTheScreen(),
      LONG,
    );
    expect(screen.getByTestId('service-date').props.value).toBe('2026-09-18');
    expect(screen.getByTestId('uncertain-odometer')).toBeOnTheScreen();
    expect(screen.getByRole('checkbox', { name: /החלפת נורת בלם/ })).toBeChecked();
    // The extractor only ever saw wrapped, untrusted document data.
    expect(extractor.lastContent?.kind).toBe('untrusted_document');
    // Draft only: no record yet.
    expect(await new ServiceRepository(world.db).list(world.car.id)).toHaveLength(1);
    await confirm();
    const saved = (await new ServiceRepository(world.db).list(world.car.id)).find(
      (e) => e.date === '2026-09-18',
    )!;
    expect(saved.garageName).toBe('מוסך הדגמה');
    expect(saved.actions.map((a) => a.title)).toContain('החלפת נורת בלם');
  }, 40000);

  it('a rejected file is explained where the user chose it', async () => {
    await setup(null);
    await open('/service/new', 'screen-service-new');
    await fireEvent.press(screen.getByTestId('service-method-file'));
    await waitFor(() => expect(screen.getByTestId('service-capture-problem')).toBeOnTheScreen());
    expect(
      within(screen.getByTestId('screen-service-new')).getByTestId('service-method-manual'),
    ).toBeOnTheScreen();
  });
});
