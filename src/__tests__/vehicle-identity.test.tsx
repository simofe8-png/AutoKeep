import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import {
  createVehicle,
  isoDate,
  parseEngineCode,
  timestamp,
  type IsoDate,
  type ProfileId,
  type Timestamp,
} from '@/domain';
import { sequentialIds, T0 } from '@/domain/testing';
import { configureDataSource } from '@/features/data/dataSource';
import { toOnboardingDraft, type OnboardingServices } from '@/features/onboarding/services';
import { identifyByRegistration } from '@/identification/registry';
import { missingFields } from '@/features/onboarding/types';
import { MIGRATIONS, VehicleRepository } from '@/persistence';
import { migrate } from '@/persistence/migrations/runner';
import { openTestDatabase, type TestDatabase } from '@/persistence/testing/sqljsDatabase';
import { populatedWorld } from '@/persistence/testing/world';
import { MemoryFileStore } from '@/providers/storage/types';
import { pullChanges, pushPending } from '@/sync/engine';
import { mergeRows } from '@/sync/merge';
import { MemoryServer } from '@/sync/testing/memoryServer';

/**
 * Vehicle identity correction (owner, 2026-09-28): color and engine code are first-class,
 * optional identity attributes — entered manually, persisted, synced, restored on another
 * device, never inferred. The vehicle image is a labeled neutral placeholder unless the user
 * adds their own photo.
 */

const LONG = { timeout: 10000 };
const now = () => timestamp('2026-09-28T10:00:00.000Z') as Timestamp;
const profile = 'profile-1' as ProfileId;
const ibiza = {
  ownerProfileId: profile,
  type: 'car' as const,
  identity: { manufacturer: 'סיאט', model: 'איביזה', year: 2012, engine: '1.4' },
  registration: '12-345-67',
};

describe('domain', () => {
  it('engine code is normalized, validated and never derived', () => {
    expect(parseEngineCode(' cggb ')).toBe('CGGB');
    expect(parseEngineCode('CGG/CGGB')).toBe('CGG/CGGB');
    expect(parseEngineCode('')).toBeNull();
    expect(parseEngineCode('קוד')).toBeNull();

    const v = createVehicle(
      { ...ibiza, identity: { ...ibiza.identity, engineCode: 'cggb', color: ' לבן ' } },
      sequentialIds(),
      T0,
    );
    expect(v.ok && v.value.identity).toMatchObject({ engineCode: 'CGGB', color: 'לבן' });

    // Unknown stays unknown: a displacement does not produce an engine code, nor a color.
    const bare = createVehicle(ibiza, sequentialIds(), T0);
    expect(bare.ok && bare.value.identity.engineCode).toBeUndefined();
    expect(bare.ok && bare.value.identity.color).toBeUndefined();

    const bad = createVehicle(
      { ...ibiza, identity: { ...ibiza.identity, engineCode: '??' } },
      sequentialIds(),
      T0,
    );
    expect(bad.ok).toBe(false);
  });

  it('either the displacement or the engine code identifies the engine for onboarding', () => {
    const base = { kind: 'car' as const, manufacturer: 'סיאט', model: 'איביזה', year: 2012 };
    const withPlate = { ...base, registration: '1234567' };
    expect(missingFields(withPlate)).toEqual(['engine']);
    expect(missingFields({ ...withPlate, engineCode: 'CGGB' })).toEqual([]);
    expect(missingFields({ ...withPlate, engine: '1.4' })).toEqual([]);
  });
});

describe('official registry', () => {
  it('engine code and color arrive with registry provenance; the displacement stays unknown', async () => {
    const r = await identifyByRegistration(
      '12-345-67',
      {
        id: 'fake',
        lookup: async () => ({
          status: 'found',
          retrievedAt: '2026-09-28T09:00:00.000Z',
          candidates: [
            {
              type: 'car',
              manufacturer: 'סיאט',
              model: 'איביזה',
              year: 2012,
              engineCode: 'CGG',
              color: 'לבן',
              dataset: 'test',
            },
          ],
        }),
      },
      true,
    );
    expect(r.kind).toBe('draft');
    if (r.kind !== 'draft') return;
    const { draft, origins } = toOnboardingDraft(r.draft);
    expect(draft).toMatchObject({ engineCode: 'CGG', color: 'לבן' });
    expect(draft.engine).toBeUndefined();
    expect(origins).toMatchObject({ engineCode: 'registry', color: 'registry' });
  });
});

describe('persistence', () => {
  it('a v3 database upgrades in place: existing vehicles keep their data, new fields unknown', async () => {
    const db = await openTestDatabase();
    await migrate(db, MIGRATIONS.slice(0, 3), now);
    await db.run(
      `INSERT INTO profiles (id, account_user_id, created_at, updated_at, version) VALUES (?, NULL, ?, ?, 1)`,
      [profile, T0, T0],
    );
    await db.run(
      `INSERT INTO vehicles (id, owner_profile_id, type, manufacturer, model, year, engine, registration,
         lifecycle, created_at, updated_at, version) VALUES ('v1', ?, 'car', 'סיאט', 'איביזה', 2012, '1.4',
         '1234567', 'active', ?, ?, 1)`,
      [profile, T0, T0],
    );
    expect(await migrate(db, MIGRATIONS, now)).toEqual({ from: 3, to: MIGRATIONS.length });
    const [v] = await new VehicleRepository(db).list();
    expect(v.identity).toMatchObject({ model: 'איביזה', engine: '1.4' });
    expect(v.identity.color).toBeUndefined();
    expect(v.identity.engineCode).toBeUndefined();
  });

  it('insert / update round-trip both fields', async () => {
    const w = await populatedWorld(sequentialIds(1), T0);
    const repo = new VehicleRepository(w.db);
    const car = (await repo.get(w.car.id))!;
    await repo.update({
      ...car,
      identity: { ...car.identity, color: 'אפור', engineCode: 'CGGB' },
      version: car.version + 1,
    });
    expect((await repo.get(w.car.id))?.identity).toMatchObject({
      color: 'אפור',
      engineCode: 'CGGB',
    });
  });
});

describe('sync, backup and restore on another device', () => {
  async function emptyDevice(): Promise<TestDatabase> {
    const db = await openTestDatabase();
    await migrate(db, MIGRATIONS, now);
    return db;
  }

  it('both fields reach the account and a second device restores them', async () => {
    const a = await populatedWorld(sequentialIds(1), T0);
    await a.db.run(
      "UPDATE vehicles SET color = 'אדום', engine_code = 'CGGB', version = version + 1 WHERE id = ?",
      [a.car.id],
    );
    const server = new MemoryServer();
    await pushPending(a.db, server.transport(), now);
    expect(server.all('vehicles').find((v) => v.id === a.car.id)).toMatchObject({
      color: 'אדום',
      engine_code: 'CGGB',
    });

    const b = await emptyDevice();
    await pullChanges(b, server.transport(), now);
    expect((await new VehicleRepository(b).get(a.car.id))?.identity).toMatchObject({
      color: 'אדום',
      engineCode: 'CGGB',
    });
  });

  it('color set on one device and engine code on another are both kept', () => {
    const base = { id: 'v', color: null, engine_code: null, updated_at: '1', version: 1 };
    const r = mergeRows(
      'vehicles',
      base,
      { ...base, color: 'לבן', updated_at: '2', version: 2 },
      { ...base, engine_code: 'CGGB', updated_at: '3', version: 2 },
    );
    expect(r.row).toMatchObject({ color: 'לבן', engine_code: 'CGGB' });
    expect(r.conflicts).toEqual([]);
  });
});

describe('manual entry in the app (real local store)', () => {
  const clock = {
    now: () => '2026-09-28T09:00:00.000Z' as Timestamp,
    today: () => isoDate('2026-09-28') as IsoDate,
  };
  const services: OnboardingServices = {
    acquisition: {
      captureWithCamera: async () => ({ status: 'cancelled' }),
      pickImage: async () => ({ status: 'cancelled' }),
      pickDocument: async () => ({ status: 'cancelled' }),
    },
    extractor: null,
    registry: { id: 'unused', lookup: async () => ({ status: 'not_found' }) },
    invoiceReader: null,
  };
  let db: TestDatabase;
  beforeEach(async () => {
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

  it('color and engine code are entered, confirmed, saved and shown', async () => {
    await renderRouter('./src/app', { initialUrl: '/onboarding/manual' });
    await waitFor(
      () => expect(screen.getByTestId('screen-onboarding-manual')).toBeOnTheScreen(),
      LONG,
    );
    await fireEvent.press(screen.getByRole('radio', { name: 'רכב פרטי' }));
    await fireEvent.changeText(screen.getByTestId('input-manufacturer'), 'סיאט');
    await fireEvent.changeText(screen.getByTestId('input-model'), 'איביזה');
    await fireEvent.changeText(screen.getByTestId('input-year'), '2012');
    await fireEvent.changeText(screen.getByTestId('input-registration'), '12-345-67');
    // No displacement: the engine code alone identifies the engine.
    await fireEvent.changeText(screen.getByTestId('input-engineCode'), 'cggb');
    await fireEvent.changeText(screen.getByTestId('input-color'), 'לבן');
    await fireEvent.press(screen.getByTestId('manual-continue'));

    await waitFor(() => expect(screen.getByTestId('screen-onboarding-confirm')).toBeOnTheScreen());
    expect(screen.getByTestId('field-engineCode')).toHaveTextContent(/CGGB/);
    expect(screen.getByTestId('field-color')).toHaveTextContent(/לבן/);
    expect(screen.queryByTestId('field-engine')).toBeNull();

    await fireEvent.press(screen.getByTestId('confirm-details'));
    await waitFor(() => expect(screen.getByTestId('screen-onboarding-odometer')).toBeOnTheScreen());
    await fireEvent.changeText(screen.getByTestId('input-odometer'), '150,000');
    await fireEvent.press(screen.getByTestId('odometer-continue'));
    await waitFor(() => expect(screen.getByTestId('sources-finish')).toBeOnTheScreen(), LONG);
    await fireEvent.press(screen.getByTestId('sources-finish'));
    await waitFor(() => expect(screen.getByTestId('screen-home')).toBeOnTheScreen(), LONG);

    const [saved] = await new VehicleRepository(db).list();
    expect(saved.identity).toMatchObject({ engineCode: 'CGGB', color: 'לבן' });
    // Nothing was inferred for the unknown displacement.
    expect(saved.identity.engine).toBeUndefined();

    // Neutral, labeled placeholder — never presented as this vehicle's picture.
    // (The image is decorative for screen readers, hence the hidden-elements query.)
    const hidden = { includeHiddenElements: true };
    expect(screen.getAllByTestId('vehicle-photo-art', hidden).length).toBeGreaterThan(0);
    expect(screen.queryAllByTestId('vehicle-photo-user', hidden)).toEqual([]);
    expect(screen.getAllByTestId('vehicle-photo-art-label', hidden)[0]).toHaveTextContent(
      /איור כללי/,
    );

    await renderRouter('./src/app', { initialUrl: `/vehicle/${saved.id}` });
    await waitFor(() => expect(screen.getByTestId('vehicle-details')).toBeOnTheScreen(), LONG);
    expect(screen.getByTestId('vehicle-details')).toHaveTextContent(/קוד מנוע.*CGGB/);
    expect(screen.getByTestId('vehicle-details')).toHaveTextContent(/צבע.*לבן/);
  }, 60000);

  it('a malformed engine code is not kept (unknown, not guessed)', async () => {
    await renderRouter('./src/app', { initialUrl: '/onboarding/manual' });
    await waitFor(
      () => expect(screen.getByTestId('screen-onboarding-manual')).toBeOnTheScreen(),
      LONG,
    );
    await fireEvent.press(screen.getByRole('radio', { name: 'רכב פרטי' }));
    await fireEvent.changeText(screen.getByTestId('input-manufacturer'), 'סיאט');
    await fireEvent.changeText(screen.getByTestId('input-model'), 'איביזה');
    await fireEvent.changeText(screen.getByTestId('input-year'), '2012');
    await fireEvent.changeText(screen.getByTestId('input-registration'), '12-345-67');
    await fireEvent.changeText(screen.getByTestId('input-engineCode'), '??');
    // Without a displacement or a valid code the engine is still missing.
    expect(screen.getByTestId('manual-continue')).toBeDisabled();
  }, 30000);
});
