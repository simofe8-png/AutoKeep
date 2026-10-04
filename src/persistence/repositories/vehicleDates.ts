import type { Timestamp, VehicleId } from '@/domain';

import type { Executor } from './base';

/**
 * Test and insurance expiry dates entered by the owner (migration v14, LOCAL ONLY). Dates are ISO
 * (YYYY-MM-DD); null = not entered. Vehicle-scoped: every query filters by vehicle_id.
 */
export interface VehicleDates {
  /** The owner's test date (overrides the registry's licence validity). */
  testUntil: string | null;
  /** Compulsory insurance (ביטוח חובה). */
  compulsoryUntil: string | null;
  /** Comprehensive or third-party insurance (מקיף / צד ג׳), optional. */
  otherUntil: string | null;
  otherKind: 'comprehensive' | 'third_party' | null;
}

export const NO_VEHICLE_DATES: VehicleDates = {
  testUntil: null,
  compulsoryUntil: null,
  otherUntil: null,
  otherKind: null,
};

export class VehicleDatesRepository {
  constructor(private readonly db: Executor) {}

  async get(vehicleId: VehicleId): Promise<VehicleDates> {
    const row = await this.db.first<{
      test_until: string | null;
      compulsory_until: string | null;
      other_until: string | null;
      other_kind: VehicleDates['otherKind'];
    }>(
      'SELECT test_until, compulsory_until, other_until, other_kind FROM vehicle_dates WHERE vehicle_id = ?',
      [vehicleId],
    );
    return row
      ? {
          testUntil: row.test_until,
          compulsoryUntil: row.compulsory_until,
          otherUntil: row.other_until,
          otherKind: row.other_kind,
        }
      : NO_VEHICLE_DATES;
  }

  async save(vehicleId: VehicleId, dates: VehicleDates, now: Timestamp): Promise<void> {
    await this.db.run(
      `INSERT INTO vehicle_dates
         (vehicle_id, test_until, compulsory_until, other_until, other_kind, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(vehicle_id) DO UPDATE SET test_until = excluded.test_until,
         compulsory_until = excluded.compulsory_until, other_until = excluded.other_until,
         other_kind = excluded.other_kind, updated_at = excluded.updated_at`,
      [
        vehicleId,
        dates.testUntil,
        dates.compulsoryUntil,
        dates.otherUntil,
        dates.otherUntil ? dates.otherKind : null,
        now,
      ],
    );
  }
}
