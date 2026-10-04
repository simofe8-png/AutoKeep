import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import { isoDate, type IsoDate, type Timestamp, type VehicleId } from '@/domain';
import { sequentialIds } from '@/domain/testing';
import { configureDataSource } from '@/features/data/dataSource';
import type { OnboardingServices } from '@/features/onboarding/services';
import { VehicleRegistryRecordRepository, VehicleRepository } from '@/persistence';
import { openTestDatabase, type TestDatabase } from '@/persistence/testing/sqljsDatabase';
import type {
  RegistryLookup,
  RegistryVehicle,
  VehicleRegistryProvider,
} from '@/providers/registry/types';
import { factsFrom, MODEL_FIELDS, PLATE_FIELDS } from '@/providers/registry/vehicleRecord';
import { MemoryFileStore } from '@/providers/storage/types';

/**
 * Add Vehicle by plate: "חיפוש רכב" → Ministry of Transport data → details → add. Response SHAPES
 * as published on data.gov.il; plate and VIN values are SYNTHETIC.
 */
const LONG = { timeout: 10000 };
const clock = {
  now: () => '2026-09-30T09:00:00.000Z' as Timestamp,
  today: () => isoDate('2026-09-30') as IsoDate,
};
const VIN = 'VSSZZZ6JZCR000001';

const ibiza: RegistryVehicle = {
  type: 'car',
  manufacturer: 'סיאט',
  model: 'IBIZA',
  modelCode: '6J52E4',
  year: 2012,
  trim: 'IE REFERENCE',
  engine: '1390 סמ״ק',
  engineCode: 'CGG',
  fuel: 'בנזין',
  color: 'שחור מטלי',
  vin: VIN,
  exteriorPhase: 'pre-fl',
  firstRegistration: '2012-08',
  dataset: 'private-and-commercial-vehicles',
  record: {
    sources: ['res-main', 'res-wltp'],
    retrievedAt: '2026-09-30T09:00:00.000Z',
    facts: [
      ...factsFrom(
        {
          tozeret_nm: 'סיאט ספרד',
          kinuy_mishari: 'IBIZA',
          degem_nm: '6J52E4',
          shnat_yitzur: 2012,
          tzeva_rechev: 'שחור מטלי',
          misgeret: VIN,
          mivchan_acharon_dt: '2026-09-10',
          baalut: 'פרטי',
        },
        PLATE_FIELDS,
      ),
      ...factsFrom(
        {
          koah_sus: 85,
          abs_ind: 1,
          matzlemat_reverse_ind: 0,
          madad_yarok: 298,
          kamut_CO2: 139,
        },
        MODEL_FIELDS,
      ),
    ],
  },
};

let answer: RegistryLookup;
let lookups: string[] = [];
const registry: VehicleRegistryProvider = {
  id: 'fake-ministry',
  lookup: async (plate) => {
    lookups.push(plate);
    return answer;
  },
};
const services: OnboardingServices = {
  acquisition: {
    captureWithCamera: async () => ({ status: 'cancelled' }),
    pickImage: async () => ({ status: 'cancelled' }),
    pickDocument: async () => ({ status: 'cancelled' }),
  },
  extractor: null,
  registry,
  invoiceReader: null,
};

let db: TestDatabase;
beforeEach(async () => {
  lookups = [];
  answer = { status: 'found', candidates: [ibiza], retrievedAt: '2026-09-30T09:00:00.000Z' };
  db = await openTestDatabase();
  configureDataSource({
    kind: 'local',
    openDatabase: async () => db,
    ids: sequentialIds(1),
    clock,
    files: new MemoryFileStore(),
    services,
  });
});
afterEach(() => configureDataSource({ kind: 'demo' }));

async function openSearch() {
  await renderRouter('./src/app', { initialUrl: '/onboarding/method' });
  await waitFor(() => expect(screen.getByTestId('screen-vehicle-search')).toBeOnTheScreen(), LONG);
}

describe('Add Vehicle = "חיפוש רכב"', () => {
  it('only a title, one plate field and one button; the plate is hyphenated while typing', async () => {
    await openSearch();
    const s = screen.getByTestId('screen-vehicle-search');
    expect(s).toHaveTextContent(/חיפוש רכב/);
    // Exactly one input on the screen.
    expect(JSON.stringify(screen.toJSON()).match(/"type":"TextInput"/g)).toHaveLength(1);
    expect(screen.getByTestId('vehicle-search-find')).toHaveTextContent(/מצא את פרטי הרכב/);
    expect(s).toHaveTextContent(/הכנס מספר רישוי של הרכב/);
    // The old identification-method screen (scan / manual choice, stepper) is gone.
    expect(screen.queryByTestId('onboarding-start-scan')).toBeNull();
    expect(screen.queryByTestId('onboarding-manual')).toBeNull();
    await fireEvent.changeText(screen.getByTestId('vehicle-search-plate'), '7788176');
    expect(screen.getByTestId('vehicle-search-plate').props.value).toBe('77-881-76');
    await fireEvent.changeText(screen.getByTestId('vehicle-search-plate'), '12345678');
    expect(screen.getByTestId('vehicle-search-plate').props.value).toBe('123-45-678');
  }, 40000);

  it('an invalid plate is explained and nothing is sent', async () => {
    await openSearch();
    await fireEvent.changeText(screen.getByTestId('vehicle-search-plate'), '123');
    await fireEvent.press(screen.getByTestId('vehicle-search-find'));
    await waitFor(() =>
      expect(screen.getByTestId('screen-vehicle-search')).toHaveTextContent(
        /מספר הרישוי אינו תקין/,
      ),
    );
    expect(lookups).toEqual([]);
  }, 40000);

  it('not found → the exact message', async () => {
    answer = { status: 'not_found' };
    await openSearch();
    await fireEvent.changeText(screen.getByTestId('vehicle-search-plate'), '1234567');
    await fireEvent.press(screen.getByTestId('vehicle-search-find'));
    await waitFor(() =>
      expect(screen.getByTestId('screen-vehicle-search')).toHaveTextContent(
        /לא נמצאו פרטי רכב עבור מספר הרישוי שהוזן\./,
      ),
    );
  }, 40000);

  it('service unavailable → a retryable error', async () => {
    answer = { status: 'unavailable', reason: 'network' };
    await openSearch();
    await fireEvent.changeText(screen.getByTestId('vehicle-search-plate'), '1234567');
    await fireEvent.press(screen.getByTestId('vehicle-search-find'));
    await waitFor(() => expect(screen.getByTestId('vehicle-search-unavailable')).toBeOnTheScreen());
    answer = { status: 'not_found' };
    await fireEvent.press(screen.getByText('נסה שוב'));
    await waitFor(() => expect(lookups).toHaveLength(2));
  }, 40000);

  it('found → all Ministry details (partial VIN, positive safety only) → add → stored', async () => {
    await openSearch();
    await fireEvent.changeText(screen.getByTestId('vehicle-search-plate'), '7788176');
    await fireEvent.press(screen.getByTestId('vehicle-search-find'));
    await waitFor(
      () => expect(screen.getByTestId('screen-vehicle-details')).toBeOnTheScreen(),
      LONG,
    );
    expect(lookups).toEqual(['7788176']);

    const details = screen.getByTestId('screen-vehicle-details');
    expect(details).toHaveTextContent(/סיאט IBIZA 2012/);
    expect(screen.getByTestId('vehicle-fact-commercialName')).toHaveTextContent(/IBIZA/);
    expect(screen.getByTestId('vehicle-fact-lastTest')).toHaveTextContent(/10\.9\.2026/);
    expect(screen.getByTestId('vehicle-fact-horsepower')).toHaveTextContent(/^כוח סוס\s*‎?85‎?$/);
    expect(screen.getByTestId('vehicle-fact-abs')).toHaveTextContent(/קיים/);
    expect(screen.getByTestId('vehicle-fact-greenIndex')).toHaveTextContent(/298/);
    // No invented unit (the Ministry schema states none).
    expect(screen.getByTestId('vehicle-fact-co2')).toHaveTextContent(/^פליטת CO2\s*‎?139‎?$/);
    // Negative safety features are neither stored nor shown.
    expect(screen.queryByTestId('vehicle-fact-reverseCamera')).toBeNull();
    // The VIN is never shown in full.
    expect(details).not.toHaveTextContent(new RegExp(VIN));
    expect(screen.getByTestId('vehicle-fact-vin')).toHaveTextContent(/••••0001‎?$/);
    // One vehicle image in the app: the Home card — not here.
    expect(screen.queryAllByTestId(/^vehicle-photo-(empty|user)$/)).toHaveLength(0);

    await fireEvent.press(screen.getByTestId('vehicle-details-add'));
    await waitFor(() => expect(screen.getByTestId('screen-onboarding-odometer')).toBeOnTheScreen());
    await fireEvent.changeText(screen.getByTestId('input-odometer'), '100000');
    await fireEvent.press(screen.getByTestId('odometer-continue'));
    await waitFor(() => expect(screen.getByTestId('screen-home')).toBeOnTheScreen(), LONG);

    const [v] = await new VehicleRepository(db).list();
    expect(v.identity).toMatchObject({
      manufacturer: 'סיאט',
      model: 'IBIZA',
      modelCode: '6J52E4',
      color: 'שחור מטלי',
      engineCode: 'CGG',
    });
    expect(v.vin).toBe(VIN);
    const stored = await new VehicleRegistryRecordRepository(db).get(v.id as VehicleId);
    expect(stored?.facts.map((f) => f.key)).toEqual(ibiza.record!.facts.map((f) => f.key));
    expect(stored?.facts.some((f) => f.key === 'reverseCamera')).toBe(false);

    // After saving: the Vehicle Details screen shows the saved Ministry data in sections.
    await renderRouter('./src/app', { initialUrl: `/vehicle/${v.id}` });
    await waitFor(
      () => expect(screen.getByTestId('vehicle-registry-facts')).toBeOnTheScreen(),
      LONG,
    );
    expect(screen.getByTestId('vehicle-facts-safety')).toHaveTextContent(/ABS/);
    expect(screen.getByTestId('vehicle-facts-environment')).toHaveTextContent(/298/);
    expect(screen.queryByTestId('vehicle-fact-reverseCamera')).toBeNull();
    expect(screen.getByTestId('screen-vehicle-manage')).not.toHaveTextContent(new RegExp(VIN));
    // The only vehicle image is on Home: none here.
    expect(screen.queryAllByTestId(/^vehicle-photo-(empty|user)$/)).toHaveLength(0);
  }, 90000);
});
