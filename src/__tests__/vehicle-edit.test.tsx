import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import { isoDate, updateVehicleDetails, type IsoDate, type Timestamp } from '@/domain';
import { sequentialIds, T0 } from '@/domain/testing';
import { configureDataSource } from '@/features/data/dataSource';
import { LocalStore } from '@/features/data/localStore';
import type { OnboardingServices } from '@/features/onboarding/services';
import { VehicleRepository } from '@/persistence';
import { populatedWorld, type PopulatedWorld } from '@/persistence/testing/world';
import { MemoryFileStore } from '@/providers/storage/types';

/**
 * Vehicle details → edit (owner decision 2026-09-28): the user corrects color, engine code and
 * engine. Nothing is migrated or derived automatically; the engine is locked while a verified
 * schedule rests on it. Edits sync like any vehicle change.
 */

const LONG = { timeout: 10000 };
const clock = {
  now: () => '2026-09-28T09:00:00.000Z' as Timestamp,
  today: () => isoDate('2026-09-28') as IsoDate,
};
const NOW = clock.now();

describe('domain: updateVehicleDetails', () => {
  it('sets, clears and validates; absent keys stay unchanged', async () => {
    const w = await populatedWorld(sequentialIds(1), T0);
    const set = updateVehicleDetails(w.car, { color: 'לבן', engineCode: 'cggb' }, NOW);
    expect(set.ok && set.value.identity).toMatchObject({
      color: 'לבן',
      engineCode: 'CGGB',
      engine: '1.6',
    });
    expect(set.ok && set.value.version).toBe(w.car.version + 1);

    const cleared = updateVehicleDetails(set.ok ? set.value : w.car, { color: '' }, NOW);
    expect(cleared.ok && cleared.value.identity.color).toBeUndefined();
    expect(cleared.ok && cleared.value.identity.engineCode).toBe('CGGB');

    expect(updateVehicleDetails(w.car, { engineCode: '??' }, NOW).ok).toBe(false);
  });
});

describe('vehicle details → edit (real local store)', () => {
  let world: PopulatedWorld;
  beforeEach(async () => {
    world = await populatedWorld(sequentialIds(1), T0);
    configureDataSource({
      kind: 'local',
      openDatabase: async () => world.db,
      ids: sequentialIds(8000),
      clock,
      files: new MemoryFileStore(),
      services: {
        acquisition: {} as OnboardingServices['acquisition'],
        extractor: null,
        registry: {} as OnboardingServices['registry'],
        invoiceReader: null,
      },
    });
  });
  afterEach(() => configureDataSource({ kind: 'demo' }));

  it('a legacy engine code in the engine field is corrected by the user, then synced', async () => {
    // Legacy registry value: the engine code was stored as the engine.
    await world.db.run("UPDATE vehicles SET engine = 'CGG' WHERE id = ?", [world.moto.id]);
    await world.db.run('DELETE FROM sync_outbox');

    await renderRouter('./src/app', { initialUrl: `/vehicle/${world.moto.id}` });
    await waitFor(
      () => expect(screen.getByTestId('screen-vehicle-manage')).toBeOnTheScreen(),
      LONG,
    );
    await fireEvent.press(screen.getByTestId('vehicle-edit-details'));
    await waitFor(() => expect(screen.getByTestId('screen-vehicle-edit')).toBeOnTheScreen());
    expect(screen.getByTestId('edit-engine').props.value).toBe('CGG');

    await fireEvent.changeText(screen.getByTestId('edit-engineCode'), 'c g');
    expect(screen.getByTestId('vehicle-edit-save')).toBeEnabled(); // "C G" is a valid shape
    await fireEvent.changeText(screen.getByTestId('edit-engineCode'), 'CGG!');
    expect(screen.getByTestId('vehicle-edit-save')).toBeDisabled();
    await fireEvent.changeText(screen.getByTestId('edit-engineCode'), 'cgg');
    await fireEvent.changeText(screen.getByTestId('edit-engine'), '471 סמ״ק');
    await fireEvent.changeText(screen.getByTestId('edit-color'), 'שחור');
    await fireEvent.press(screen.getByTestId('vehicle-edit-save'));

    await waitFor(() => expect(screen.getByTestId('screen-vehicle-manage')).toBeOnTheScreen());
    await waitFor(async () =>
      expect((await new VehicleRepository(world.db).get(world.moto.id))?.identity).toMatchObject({
        engine: '471 סמ״ק',
        engineCode: 'CGG',
        color: 'שחור',
      }),
    );
    await waitFor(() =>
      expect(screen.getByTestId('vehicle-details')).toHaveTextContent(/קוד מנוע.*CGG/),
    );
    const ops = await world.db.all<{ entity_table: string; entity_id: string }>(
      'SELECT entity_table, entity_id FROM sync_outbox',
    );
    expect(ops).toContainEqual(
      expect.objectContaining({ entity_table: 'vehicles', entity_id: world.moto.id }),
    );
  }, 40000);

  it('with a verified schedule the engine is locked; color and engine code stay editable', async () => {
    await renderRouter('./src/app', { initialUrl: `/vehicle/${world.car.id}/edit` });
    await waitFor(() => expect(screen.getByTestId('screen-vehicle-edit')).toBeOnTheScreen(), LONG);
    await waitFor(() => expect(screen.getByTestId('edit-engine-locked')).toBeOnTheScreen(), LONG);
    expect(screen.getByTestId('edit-engine').props.editable).toBe(false);
    await fireEvent.changeText(screen.getByTestId('edit-engineCode'), '1ZR');
    await fireEvent.press(screen.getByTestId('vehicle-edit-save'));
    await waitFor(async () =>
      expect((await new VehicleRepository(world.db).get(world.car.id))?.identity).toMatchObject({
        engine: '1.6',
        engineCode: '1ZR',
      }),
    );
  }, 40000);

  it('the store refuses an engine change under a verified schedule (backstop)', async () => {
    const store = await LocalStore.open(
      world.db,
      sequentialIds(9000),
      clock,
      new MemoryFileStore(),
    );
    await expect(store.updateVehicleDetails(world.car.id, { engine: '1.8' })).rejects.toThrow(
      'vehicle.engineLocked',
    );
    expect((await new VehicleRepository(world.db).get(world.car.id))?.identity.engine).toBe('1.6');
  });
});
