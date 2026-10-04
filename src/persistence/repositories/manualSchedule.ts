import type { Timestamp, VehicleId } from '@/domain';

import type { Executor } from './base';

/**
 * Maintenance items the owner entered by hand (migration v15, LOCAL ONLY). Vehicle-scoped: every
 * query filters by vehicle_id.
 */
export interface ManualScheduleItem {
  id: string;
  vehicleId: string;
  /** A known task code, or 'custom' (the owner's own item, named by `title`). */
  task: string;
  action: 'replacement' | 'inspection';
  title: string;
  intervalKm: number | null;
  intervalMonths: number | null;
  /** When it was last done, as the owner states it (ISO date / km); null = not stated. */
  lastDoneDate: string | null;
  lastDoneKm: number | null;
  /** Where counting starts without a stated last service: odometer and date at entry. */
  startKm?: number | null;
  startDate?: string | null;
}

/** One row of the owner's table as entered (the store keeps ids, start point and history). */
export interface ManualScheduleRow {
  /** Absent: a new row. */
  id?: string;
  task: string;
  action: 'replacement' | 'inspection';
  title: string;
  intervalKm: number | null;
  intervalMonths: number | null;
}

interface Row {
  id: string;
  vehicle_id: string;
  task: string;
  action: ManualScheduleItem['action'];
  title: string;
  interval_km: number | null;
  interval_months: number | null;
  last_done_date: string | null;
  last_done_km: number | null;
  start_km: number | null;
  start_date: string | null;
}

const fromRow = (r: Row): ManualScheduleItem => ({
  id: r.id,
  vehicleId: r.vehicle_id,
  task: r.task,
  action: r.action,
  title: r.title,
  intervalKm: r.interval_km,
  intervalMonths: r.interval_months,
  lastDoneDate: r.last_done_date,
  lastDoneKm: r.last_done_km,
  startKm: r.start_km,
  startDate: r.start_date,
});

export class ManualScheduleRepository {
  constructor(private readonly db: Executor) {}

  async list(vehicleId: VehicleId): Promise<ManualScheduleItem[]> {
    const rows = await this.db.all<Row>(
      `SELECT id, vehicle_id, task, action, title, interval_km, interval_months, last_done_date,
              last_done_km, start_km, start_date
       FROM manual_schedule_items WHERE vehicle_id = ? ORDER BY created_at, id`,
      [vehicleId],
    );
    return rows.map(fromRow);
  }

  async save(item: ManualScheduleItem, now: Timestamp): Promise<void> {
    await this.db.run(
      `INSERT INTO manual_schedule_items
         (id, vehicle_id, task, action, title, interval_km, interval_months, last_done_date,
          last_done_km, start_km, start_date, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET task = excluded.task, action = excluded.action,
         title = excluded.title, interval_km = excluded.interval_km,
         interval_months = excluded.interval_months, last_done_date = excluded.last_done_date,
         last_done_km = excluded.last_done_km, updated_at = excluded.updated_at
       WHERE manual_schedule_items.vehicle_id = excluded.vehicle_id`,
      [
        item.id,
        item.vehicleId,
        item.task,
        item.action,
        item.title,
        item.intervalKm,
        item.intervalMonths,
        item.lastDoneDate,
        item.lastDoneKm,
        item.startKm ?? null,
        item.startDate ?? null,
        now,
        now,
      ],
    );
  }

  async remove(vehicleId: VehicleId, id: string): Promise<void> {
    await this.db.run('DELETE FROM manual_schedule_items WHERE vehicle_id = ? AND id = ?', [
      vehicleId,
      id,
    ]);
  }
}
