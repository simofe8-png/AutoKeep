import {
  archiveVehicle,
  restoreVehicle,
  type Result,
  type Timestamp,
  type Vehicle,
  type VehicleId,
} from '@/domain';

import type { SqlDatabase } from './db/types';
import { SettingsRepository, VehicleRepository } from './repositories/vehicles';

/**
 * Vehicle lifecycle persistence (T049). Archive and restore only change lifecycle state — all
 * history, documents and readings remain. Permanent deletion is VehicleRepository.deletePermanently
 * and must be preceded by a preview + explicit confirmation in the UI.
 */
export async function archive(
  db: SqlDatabase,
  id: VehicleId,
  now: Timestamp,
): Promise<Result<Vehicle>> {
  return db.transaction(async (tx) => {
    const repo = new VehicleRepository(tx);
    const v = await repo.get(id);
    if (!v) throw new Error(`Vehicle ${id} not found`);
    const r = archiveVehicle(v, now);
    if (!r.ok) return r;
    await repo.update(r.value);
    // An archived vehicle cannot remain the active context.
    const settings = new SettingsRepository(tx);
    if ((await settings.get<string>('activeVehicleId')) === id)
      await settings.remove('activeVehicleId');
    return r;
  });
}

export async function restore(
  db: SqlDatabase,
  id: VehicleId,
  now: Timestamp,
): Promise<Result<Vehicle>> {
  return db.transaction(async (tx) => {
    const repo = new VehicleRepository(tx);
    const v = await repo.get(id);
    if (!v) throw new Error(`Vehicle ${id} not found`);
    const r = restoreVehicle(v, now);
    if (r.ok) await repo.update(r.value);
    return r;
  });
}
