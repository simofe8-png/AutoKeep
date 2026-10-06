import type { IsoDate, ServiceTable, Timestamp, VehicleId } from '@/domain';
import type { TableDone } from '@/engine/serviceTable';

import type { Executor } from './base';

/**
 * The owner's maintenance table and what was done by it (migration v19, LOCAL ONLY). Vehicle-scoped:
 * every query filters by vehicle_id.
 */
export interface StoredServiceTable {
  table: ServiceTable;
  status: 'proposed' | 'confirmed';
  /** Typed by the owner, read from the owner's photo / PDF, or the transcribed booklet. */
  source: 'manual' | 'photo' | 'transcribed';
  /** The owner's booklet document it was read from. */
  documentId: string | null;
  /** Cells ("rowId:column") and rule rows ("rowId") the reading was not sure of. */
  unsure: string[];
  updatedAt: string;
}

export interface StoredTableDone extends TableDone {
  id: string;
  /** The history record of that service (null: stated by the owner without a record). */
  serviceEventId: string | null;
}

interface TableRow {
  data: string;
  status: StoredServiceTable['status'];
  source: StoredServiceTable['source'];
  document_id: string | null;
  unsure: string;
  updated_at: string;
}

interface DoneRow {
  id: string;
  kind: TableDone['kind'];
  service_no: number | null;
  row_id: string | null;
  done_km: number | null;
  done_date: string;
  service_event_id: string | null;
}

export class ServiceTableRepository {
  constructor(private readonly db: Executor) {}

  async get(vehicleId: VehicleId): Promise<StoredServiceTable | null> {
    const r = await this.db.first<TableRow>(
      `SELECT data, status, source, document_id, unsure, updated_at
       FROM service_tables WHERE vehicle_id = ?`,
      [vehicleId],
    );
    if (!r) return null;
    return {
      table: JSON.parse(r.data) as ServiceTable,
      status: r.status,
      source: r.source,
      documentId: r.document_id,
      unsure: JSON.parse(r.unsure) as string[],
      updatedAt: r.updated_at,
    };
  }

  async save(
    vehicleId: VehicleId,
    value: Omit<StoredServiceTable, 'updatedAt'>,
    now: Timestamp,
  ): Promise<void> {
    await this.db.run(
      `INSERT INTO service_tables
         (vehicle_id, data, status, source, document_id, unsure, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(vehicle_id) DO UPDATE SET data = excluded.data, status = excluded.status,
         source = excluded.source, document_id = excluded.document_id, unsure = excluded.unsure,
         updated_at = excluded.updated_at`,
      [
        vehicleId,
        JSON.stringify(value.table),
        value.status,
        value.source,
        value.documentId,
        JSON.stringify(value.unsure),
        now,
        now,
      ],
    );
  }

  /** Removes the table and what was recorded by it (the history records stay). */
  async remove(vehicleId: VehicleId): Promise<void> {
    await this.db.run('DELETE FROM service_table_done WHERE vehicle_id = ?', [vehicleId]);
    await this.db.run('DELETE FROM service_tables WHERE vehicle_id = ?', [vehicleId]);
  }

  async done(vehicleId: VehicleId): Promise<StoredTableDone[]> {
    const rows = await this.db.all<DoneRow>(
      `SELECT id, kind, service_no, row_id, done_km, done_date, service_event_id
       FROM service_table_done WHERE vehicle_id = ? ORDER BY done_date, created_at, id`,
      [vehicleId],
    );
    return rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      serviceNo: r.service_no,
      rowId: r.row_id,
      km: r.done_km,
      date: r.done_date as IsoDate,
      serviceEventId: r.service_event_id,
    }));
  }

  async addDone(vehicleId: VehicleId, d: StoredTableDone, now: Timestamp): Promise<void> {
    await this.db.run(
      `INSERT INTO service_table_done
         (id, vehicle_id, kind, service_no, row_id, done_km, done_date, service_event_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [d.id, vehicleId, d.kind, d.serviceNo, d.rowId, d.km, d.date, d.serviceEventId, now],
    );
  }
}
