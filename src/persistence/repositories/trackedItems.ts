import type { Timestamp, VehicleId } from '@/domain';

import type { Executor } from './base';

/** An item the owner tracks beyond the schedule; when it was last done comes from history. */
export interface TrackedItem {
  id: string;
  vehicleId: VehicleId;
  title: string;
  createdAt: Timestamp;
}

export class TrackedItemRepository {
  constructor(private readonly db: Executor) {}

  async list(vehicleId: VehicleId): Promise<TrackedItem[]> {
    const rows = await this.db.all<{ id: string; title: string; created_at: string }>(
      'SELECT id, title, created_at FROM tracked_items WHERE vehicle_id = ? ORDER BY created_at, id',
      [vehicleId],
    );
    return rows.map((r) => ({
      id: r.id,
      vehicleId,
      title: r.title,
      createdAt: r.created_at as Timestamp,
    }));
  }

  async add(item: TrackedItem): Promise<void> {
    await this.db.run(
      'INSERT INTO tracked_items (id, vehicle_id, title, created_at) VALUES (?, ?, ?, ?)',
      [item.id, item.vehicleId, item.title, item.createdAt],
    );
  }

  async remove(vehicleId: VehicleId, id: string): Promise<void> {
    await this.db.run('DELETE FROM tracked_items WHERE vehicle_id = ? AND id = ?', [vehicleId, id]);
  }
}
