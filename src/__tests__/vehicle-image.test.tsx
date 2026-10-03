import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import { isoDate, type IsoDate, type Timestamp } from '@/domain';
import { sequentialIds } from '@/domain/testing';
import { configureDataSource } from '@/features/data/dataSource';
import { LocalStore, type VehicleDetails } from '@/features/data/localStore';
import type { OnboardingServices } from '@/features/onboarding/services';
import type { VehicleSummary } from '@/features/vehicles/types';
import { VehicleRepository } from '@/persistence';
import { openTestDatabase, type TestDatabase } from '@/persistence/testing/sqljsDatabase';
import type {
  CatalogLookup,
  ReferenceImageCatalog,
  ReferenceImageRecord,
} from '@/providers/referenceImages/types';
import { MemoryFileStore } from '@/providers/storage/types';

/**
 * Vehicle image UX (owner decisions 2026-09-29): searching → reference / which-front question /
 * no suitable image / cannot search now; the user's photo always wins and can be removed.
 * The catalog is a FAKE here (records mirror the approved Ibiza references); the real catalog is
 * AutoKeep's Supabase table + bucket, verified separately.
 */

const LONG = { timeout: 10000 };
const hidden = { includeHiddenElements: true };
const clock = {
  now: () => '2026-09-29T09:00:00.000Z' as Timestamp,
  today: () => isoDate('2026-09-29') as IsoDate,
};

const rec = (id: string, classKey: string, author: string): ReferenceImageRecord => ({
  id,
  classKey,
  imageUrl: `https://example.test/${id}.png`,
  imageSha256: 'a'.repeat(64),
  width: 1400,
  height: 730,
  label: 'תמונת דגם להמחשה',
  credit: `צילום: ${author} · CC BY-SA 4.0 · Wikimedia Commons · הרקע הוסר על ידי AutoKeep`,
  sourceUrl: `https://commons.wikimedia.org/wiki/File:${id}`,
  license: 'CC BY-SA 4.0',
  licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
  author,
});
const PRE = rec('ref_prefl', 'v1/seat/ibiza/6j/pre-fl/hatchback-5d/black', 'Makizox');
const FL = rec('ref_fl1', 'v1/seat/ibiza/6j/fl1/hatchback-5d/black', 'Vauxford');

/** A controllable catalog: each lookup waits until released, then answers per `mode`. */
class FakeCatalog implements ReferenceImageCatalog {
  mode: 'ok' | 'down' = 'ok';
  lookups: string[][] = [];
  private waiting: (() => void)[] = [];
  gate = false;
  release() {
    const w = this.waiting;
    this.waiting = [];
    w.forEach((f) => f());
  }
  async lookup(prefixes: readonly string[]): Promise<CatalogLookup> {
    this.lookups.push([...prefixes]);
    if (this.gate) await new Promise<void>((r) => this.waiting.push(r));
    if (this.mode === 'down') return { status: 'unavailable' };
    return {
      status: 'ok',
      records: [PRE, FL].filter((r) => prefixes.some((p) => r.classKey.startsWith(p))),
    };
  }
  async fetchImage(r: ReferenceImageRecord) {
    return { status: 'ok' as const, uri: `file:///cache/reference-images/${r.id}.png` };
  }
}

let db: TestDatabase;
let catalog: FakeCatalog;
const acquired = (name: string) => ({
  status: 'acquired' as const,
  file: {
    uri: `file:///cache/${name}.jpg`,
    mimeType: 'image/jpeg',
    sizeBytes: 10,
    source: 'camera' as const,
  },
});
const services: OnboardingServices = {
  acquisition: {
    captureWithCamera: async () => acquired('camera-photo'),
    pickImage: async () => acquired('gallery-photo'),
    pickDocument: async () => ({ status: 'cancelled' }),
  },
  extractor: null,
  registry: { id: 'unused', lookup: async () => ({ status: 'not_found' }) },
  invoiceReader: null,
};

async function withVehicle(summary: Partial<VehicleSummary>, details: VehicleDetails) {
  const store = await LocalStore.open(db, sequentialIds(500), clock, new MemoryFileStore());
  return store.addVehicle(
    {
      id: '',
      kind: 'car',
      manufacturer: 'סיאט ספרד',
      model: 'IBIZA',
      year: 2012,
      registration: '12-345-67',
      odometerKm: 0,
      odometerMeasuredAt: '2026-09-29',
      archived: false,
      ...summary,
    },
    details,
  );
}

const ibiza: VehicleDetails = { modelCode: '6J52E4', color: 'שחור מטלי', engineCode: 'CGG' };

function configure() {
  configureDataSource({
    kind: 'local',
    openDatabase: async () => db,
    ids: sequentialIds(1000),
    clock,
    files: new MemoryFileStore(),
    services,
    referenceImages: catalog,
  });
}

beforeEach(async () => {
  db = await openTestDatabase();
  catalog = new FakeCatalog();
  configure();
});
afterEach(() => {
  // renderRouter switches to fake timers; drop any pending timer before the next app instance.
  jest.clearAllTimers();
  jest.useRealTimers();
  configureDataSource({ kind: 'demo' });
});

/**
 * Polls a data-layer condition by flushing pending work inside act() — no async waitFor callbacks
 * (they leak dangling promises under renderRouter's fake timers into the next test).
 */
async function eventually(check: () => Promise<boolean>) {
  for (let i = 0; i < 200; i++) {
    if (await check()) return;
    await act(async () => {
      await Promise.resolve();
    });
  }
  throw new Error('condition not met');
}

async function home() {
  await renderRouter('./src/app', { initialUrl: '/' });
  await waitFor(() => expect(screen.getByTestId('screen-home')).toBeOnTheScreen(), LONG);
}

/**
 * What a restarted app would load: the persisted bytes reopened in a new store. (The UI restart
 * itself is verified on the Galaxy A54; re-rendering the router in one test is not reliable.)
 */
async function afterRestart() {
  const reopened = await openTestDatabase(db.export());
  const store = await LocalStore.open(reopened, sequentialIds(9000), clock, new MemoryFileStore());
  return store.snapshot();
}

describe('vehicle image: search states', () => {
  it('spinner while searching, then the verified reference with its label and credit', async () => {
    await withVehicle({}, { ...ibiza, exteriorPhase: 'pre-fl' });
    catalog.gate = true;
    await home();
    await waitFor(
      () => expect(screen.getByTestId('vehicle-image-searching')).toBeOnTheScreen(),
      LONG,
    );
    expect(screen.getByText('מחפש תמונה מתאימה לכלי הרכב שלך...')).toBeOnTheScreen();
    // Only class attributes are sent — no plate, VIN or identity.
    expect(catalog.lookups).toEqual([['v1/seat/ibiza/6j/pre-fl/hatchback-5d/']]);
    await act(async () => catalog.release());
    await waitFor(() =>
      expect(screen.getAllByTestId('vehicle-photo-reference').length).toBeGreaterThan(0),
    );
    expect(screen.queryByTestId('vehicle-image-searching')).toBeNull();
    // Owner decision 2026-09-29: no visible model-image label; the credit stays.
    expect(screen.queryByTestId('vehicle-reference-label')).toBeNull();
    expect(screen.queryByText('תמונת דגם להמחשה')).toBeNull();
    expect(screen.getAllByTestId('vehicle-reference-credit')[0]).toHaveTextContent(
      /Makizox.*CC BY-SA 4\.0/,
    );
  }, 40000);

  it('ambiguous front → the visual question; the answer is a user-confirmed, persisted attribute', async () => {
    const id = await withVehicle({}, ibiza);
    await home();
    await waitFor(
      () => expect(screen.getByTestId('vehicle-image-choose-phase')).toBeOnTheScreen(),
      LONG,
    );
    expect(screen.getByText('איזו מהן דומה לרכב שלך?')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('phase-option-pre-fl'));
    await waitFor(() =>
      expect(screen.getAllByTestId('vehicle-photo-reference').length).toBeGreaterThan(0),
    );
    await eventually(
      async () =>
        (await new VehicleRepository(db).get(id as never))?.identity.exteriorPhaseSource === 'user',
    );
    expect((await new VehicleRepository(db).get(id as never))?.identity).toMatchObject({
      exteriorPhase: 'pre-fl',
      exteriorPhaseSource: 'user',
    });
  }, 40000);

  it('"לא בטוח" never shows a possibly wrong front; it is remembered', async () => {
    await withVehicle({}, ibiza);
    await home();
    await waitFor(() => expect(screen.getByTestId('phase-not-sure')).toBeOnTheScreen(), LONG);
    await fireEvent.press(screen.getByTestId('phase-not-sure'));
    await waitFor(() =>
      expect(screen.getAllByTestId('vehicle-photo-art', hidden).length).toBeGreaterThan(0),
    );
    expect(screen.queryByTestId('vehicle-photo-reference')).toBeNull();
    await eventually(
      async () => Object.keys((await afterRestart()).imagePromptDismissed).length > 0,
    );
    expect(Object.values((await afterRestart()).imagePromptDismissed)).toEqual([true]);
  }, 40000);

  it('connectivity failure is not "no image": retry, and camera/gallery stay available', async () => {
    await withVehicle({}, { ...ibiza, exteriorPhase: 'fl1' });
    catalog.mode = 'down';
    await home();
    await waitFor(
      () => expect(screen.getByTestId('vehicle-image-unavailable')).toBeOnTheScreen(),
      LONG,
    );
    expect(screen.getByText('לא ניתן לחפש תמונה כרגע')).toBeOnTheScreen();
    expect(screen.queryByText('לא מצאנו תמונת דגם מתאימה')).toBeNull();
    expect(screen.getByTestId('image-capture')).toBeOnTheScreen();
    expect(screen.getByTestId('image-pick')).toBeOnTheScreen();
    catalog.mode = 'ok';
    await fireEvent.press(screen.getByTestId('image-retry'));
    await waitFor(() =>
      expect(screen.getAllByTestId('vehicle-photo-reference').length).toBeGreaterThan(0),
    );
    expect(screen.getAllByTestId('vehicle-reference-credit')[0]).toHaveTextContent(/Vauxford/);
  }, 40000);
});

describe('vehicle image: no suitable image and the user photo', () => {
  it('no image → invitation; camera photo becomes the vehicle image and survives a restart', async () => {
    await withVehicle({ manufacturer: 'טויוטה', model: 'קורולה' }, { modelCode: 'ZRE181L' });
    await home();
    await waitFor(
      () => expect(screen.getByTestId('vehicle-image-not-found')).toBeOnTheScreen(),
      LONG,
    );
    expect(screen.getByText('לא מצאנו תמונת דגם מתאימה')).toBeOnTheScreen();
    expect(
      screen.getByText(
        'צלם את כלי הרכב שלך או בחר תמונה מהגלריה, ואנחנו נשתמש בה כתמונת כלי הרכב.',
      ),
    ).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('image-capture'));
    await waitFor(() =>
      expect(screen.getAllByTestId('vehicle-photo-user').length).toBeGreaterThan(0),
    );
    await eventually(async () => Object.keys((await afterRestart()).vehiclePhotos).length === 1);
  }, 40000);

  it('"לא עכשיו" is non-blocking and remembered', async () => {
    await withVehicle({ manufacturer: 'טויוטה', model: 'קורולה' }, {});
    await home();
    await waitFor(() => expect(screen.getByTestId('image-not-now')).toBeOnTheScreen(), LONG);
    await fireEvent.press(screen.getByTestId('image-not-now'));
    await waitFor(() => expect(screen.queryByTestId('vehicle-image-not-found')).toBeNull(), LONG);
    expect(screen.getAllByTestId('vehicle-photo-art', hidden).length).toBeGreaterThan(0);
  }, 40000);

  it('user photo overrides the reference on the Home card; removing it brings the reference back', async () => {
    const id = await withVehicle({}, { ...ibiza, exteriorPhase: 'pre-fl' });
    const home = async () => {
      await renderRouter('./src/app', { initialUrl: '/' });
      await waitFor(() => expect(screen.getByTestId('vehicle-hero')).toBeOnTheScreen(), LONG);
    };
    await home();
    await waitFor(
      () => expect(screen.getAllByTestId('vehicle-photo-reference').length).toBeGreaterThan(0),
      LONG,
    );
    // The photo is managed on the vehicle screen, which shows no vehicle image itself.
    await renderRouter('./src/app', { initialUrl: `/vehicle/${id}` });
    await waitFor(() => expect(screen.getByTestId('vehicle-photo')).toBeOnTheScreen(), LONG);
    expect(screen.queryAllByTestId(/^vehicle-photo-(art|reference|user)$/)).toHaveLength(0);
    await fireEvent.press(screen.getByTestId('vehicle-photo')); // gallery
    await waitFor(() => expect(screen.getByTestId('vehicle-photo-remove')).toBeOnTheScreen(), LONG);
    await home();
    await waitFor(() => expect(screen.getByTestId('vehicle-photo-user')).toBeOnTheScreen(), LONG);
    expect(screen.queryByTestId('vehicle-photo-reference')).toBeNull();
    await renderRouter('./src/app', { initialUrl: `/vehicle/${id}` });
    await waitFor(() => expect(screen.getByTestId('vehicle-photo-remove')).toBeOnTheScreen(), LONG);
    await fireEvent.press(screen.getByTestId('vehicle-photo-remove'));
    await waitFor(() => expect(screen.queryByTestId('vehicle-photo-remove')).toBeNull());
    await home();
    await waitFor(
      () => expect(screen.getAllByTestId('vehicle-photo-reference').length).toBeGreaterThan(0),
      LONG,
    );
  }, 60000);
});

describe('general model photo (Wikimedia, license-checked; owner decision 2026-10-03)', () => {
  /** SYNTHETIC answers shaped like the Wikipedia / Commons API; no network. */
  function photoHost() {
    const asked: string[] = [];
    return {
      asked,
      host: {
        getJson: async (url: string) => {
          asked.push(url);
          if (url.includes('imageinfo')) {
            return {
              query: {
                pages: [
                  {
                    imageinfo: [
                      {
                        thumburl: 'https://upload.wikimedia.org/x/800px-Corolla.jpg',
                        descriptionurl: 'https://commons.wikimedia.org/wiki/File:Corolla.jpg',
                        mime: 'image/jpeg',
                        extmetadata: {
                          License: { value: 'cc-by-sa-4.0' },
                          LicenseShortName: { value: 'CC BY-SA 4.0' },
                          Artist: { value: 'Example Photographer' },
                        },
                      },
                    ],
                  },
                ],
              },
            };
          }
          return { query: { pages: [{ title: 'Toyota Corolla', pageimage: 'Corolla.jpg' }] } };
        },
        download: async () => 'file:///app/model-photos/corolla.jpg',
        exists: async () => true,
      },
    };
  }

  it('no approved reference → the general photo, labelled and credited; the registry color badge', async () => {
    const photos = photoHost();
    configureDataSource({
      kind: 'local',
      openDatabase: async () => db,
      ids: sequentialIds(1000),
      clock,
      files: new MemoryFileStore(),
      services,
      modelPhotos: photos.host,
    });
    await withVehicle(
      { manufacturer: 'טויוטה יפן', model: 'COROLLA', year: 2017 },
      { color: 'לבן שנהב' },
    );
    await home();
    await waitFor(
      () => expect(screen.getAllByTestId('vehicle-photo-general').length).toBeGreaterThan(0),
      LONG,
    );
    expect(screen.getAllByTestId('vehicle-photo-general-label')[0]).toHaveTextContent(
      'תמונת דגם כללית מוויקיפדיה · ייתכן שהדור או הגרסה שונים מהרכב שלך',
    );
    expect(screen.getAllByTestId('vehicle-reference-credit')[0]).toHaveTextContent(
      /Example Photographer · CC BY-SA 4\.0 · Wikimedia Commons/,
    );
    expect(screen.getByTestId('vehicle-color-badge')).toHaveTextContent('צבע: לבן שנהב');
    expect(screen.getByTestId('vehicle-color-swatch-white')).toBeOnTheScreen();
    // Only make + model were sent (no plate, VIN or identity).
    expect(photos.asked.join(' ')).not.toMatch(/12-345-67|1234567/);
    expect(decodeURIComponent(photos.asked[0])).toContain('titles=Toyota Corolla');
    // Cached locally by model class: what a restarted app would read without the network.
    const reopened = await openTestDatabase(db.export());
    const row = await reopened.first<{ status: string; local_uri: string }>(
      "SELECT status, local_uri FROM model_photo_cache WHERE class_key = 'wm1/toyota/corolla'",
    );
    expect(row).toEqual({ status: 'found', local_uri: 'file:///app/model-photos/corolla.jpg' });
  }, 40000);
});
