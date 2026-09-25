import {
  sortHistory,
  type Alert,
  type DeferredItem,
  type DerivedExtraction,
  type DocumentId,
  type GarageRecommendation,
  type MaintenanceSchedule,
  type ServiceEvent,
  type ServiceEventId,
  type Timestamp,
  type VehicleDocument,
  type VehicleId,
} from '@/domain';

import { atomic, bool, ConcurrencyError, fromJson, int, toJson, type Executor } from './base';

/*
 * Vehicle-scoped repositories. Every read takes an explicit vehicleId and filters on it, so a
 * record can never be fetched through another vehicle's context (invariants 14/16).
 */

type Meta = { created_at: string; updated_at: string; version: number };
const meta = (r: Meta) => ({
  createdAt: r.created_at as Timestamp,
  updatedAt: r.updated_at as Timestamp,
  version: r.version,
});

// ---------- Maintenance schedules (T046) ----------

interface ScheduleRow extends Meta {
  id: string;
  vehicle_id: string;
  intervals_json: string;
  evidence_json: string;
  applicability_json: string;
  verification_json: string;
}

export class ScheduleRepository {
  constructor(private readonly db: Executor) {}

  /** Schedules are append-only: a newer verified source produces a new schedule row. */
  async add(s: MaintenanceSchedule): Promise<void> {
    await this.db.run(
      `INSERT INTO schedules (id, vehicle_id, intervals_json, evidence_json, applicability_json, verification_json,
         created_at, updated_at, version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        s.id,
        s.vehicleId,
        toJson(s.intervals),
        toJson(s.evidence),
        toJson(s.applicability),
        toJson(s.verification),
        s.createdAt,
        s.updatedAt,
        s.version,
      ],
    );
  }

  /** The most recent schedule for the vehicle (verified or not — callers gate on verification). */
  async current(vehicleId: VehicleId): Promise<MaintenanceSchedule | null> {
    const r = await this.db.first<ScheduleRow>(
      'SELECT * FROM schedules WHERE vehicle_id = ? ORDER BY created_at DESC, id DESC LIMIT 1',
      [vehicleId],
    );
    if (!r) return null;
    return {
      id: r.id as MaintenanceSchedule['id'],
      vehicleId: r.vehicle_id as VehicleId,
      intervals: fromJson(r.intervals_json),
      evidence: fromJson(r.evidence_json),
      applicability: fromJson(r.applicability_json),
      verification: fromJson(r.verification_json),
      ...meta(r),
    };
  }
}

// ---------- Documents & extractions (T046) ----------

interface DocumentRow extends Meta {
  id: string;
  vehicle_id: string;
  kind: VehicleDocument['kind'];
  title: string;
  origin: VehicleDocument['origin'];
  authority: VehicleDocument['authority'];
  storage_key: string;
  mime_type: string;
  size_bytes: number;
  sha256: string;
  page_count: number | null;
  verification_json: string | null;
}

const toDocument = (r: DocumentRow): VehicleDocument => ({
  id: r.id as DocumentId,
  vehicleId: r.vehicle_id as VehicleId,
  kind: r.kind,
  title: r.title,
  origin: r.origin,
  authority: r.authority,
  original: {
    storageKey: r.storage_key,
    mimeType: r.mime_type,
    sizeBytes: r.size_bytes,
    sha256: r.sha256,
    pageCount: r.page_count ?? undefined,
  },
  verification: fromJson(r.verification_json),
  ...meta(r),
});

export class DocumentRepository {
  constructor(private readonly db: Executor) {}

  async add(d: VehicleDocument): Promise<void> {
    await this.db.run(
      `INSERT INTO documents (id, vehicle_id, kind, title, origin, authority, storage_key, mime_type, size_bytes,
         sha256, page_count, verification_json, created_at, updated_at, version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        d.id,
        d.vehicleId,
        d.kind,
        d.title,
        d.origin,
        d.authority,
        d.original.storageKey,
        d.original.mimeType,
        d.original.sizeBytes,
        d.original.sha256,
        d.original.pageCount ?? null,
        d.verification ? toJson(d.verification) : null,
        d.createdAt,
        d.updatedAt,
        d.version,
      ],
    );
  }

  async get(vehicleId: VehicleId, id: DocumentId): Promise<VehicleDocument | null> {
    const r = await this.db.first<DocumentRow>(
      'SELECT * FROM documents WHERE vehicle_id = ? AND id = ?',
      [vehicleId, id],
    );
    return r ? toDocument(r) : null;
  }

  async list(vehicleId: VehicleId): Promise<VehicleDocument[]> {
    const rows = await this.db.all<DocumentRow>(
      'SELECT * FROM documents WHERE vehicle_id = ? ORDER BY created_at DESC, id',
      [vehicleId],
    );
    return rows.map(toDocument);
  }
}

interface ExtractionRow extends Meta {
  id: string;
  document_id: string;
  vehicle_id: string;
  kind: DerivedExtraction['kind'];
  status: DerivedExtraction['status'];
  produced_by: string;
  payload_json: string;
  uncertain_json: string;
}

export class ExtractionRepository {
  constructor(private readonly db: Executor) {}

  async add(e: DerivedExtraction): Promise<void> {
    await this.db.run(
      `INSERT INTO extractions (id, document_id, vehicle_id, kind, status, produced_by, payload_json, uncertain_json,
         created_at, updated_at, version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        e.id,
        e.documentId,
        e.vehicleId,
        e.kind,
        e.status,
        e.producedBy,
        toJson(e.payload),
        toJson(e.uncertainFields),
        e.createdAt,
        e.updatedAt,
        e.version,
      ],
    );
  }

  async listForDocument(
    vehicleId: VehicleId,
    documentId: DocumentId,
  ): Promise<DerivedExtraction[]> {
    const rows = await this.db.all<ExtractionRow>(
      'SELECT * FROM extractions WHERE vehicle_id = ? AND document_id = ? ORDER BY created_at',
      [vehicleId, documentId],
    );
    return rows.map((r) => ({
      id: r.id as DerivedExtraction['id'],
      documentId: r.document_id as DocumentId,
      vehicleId: r.vehicle_id as VehicleId,
      kind: r.kind,
      status: r.status,
      producedBy: r.produced_by,
      payload: fromJson(r.payload_json),
      uncertainFields: fromJson(r.uncertain_json),
      ...meta(r),
    }));
  }
}

// ---------- Service events / history (T047) ----------

interface EventRow extends Meta {
  id: string;
  vehicle_id: string;
  date: string;
  odometer_km: number;
  garage_name: string | null;
  notes: string | null;
  origin: ServiceEvent['origin'];
  extraction_id: string | null;
  authority: ServiceEvent['authority'];
  verification_json: string;
  confirmed_at: string;
}

interface ActionRow {
  id: string;
  service_event_id: string;
  title: string;
  action_type: ServiceEvent['actions'][number]['actionType'];
  performed: number;
  maintenance_item_id: string | null;
  unlisted: number;
}

export class ServiceRepository {
  constructor(private readonly db: Executor) {}

  /** Inserts a confirmed event with its actions and document links atomically. */
  async add(e: ServiceEvent): Promise<void> {
    await atomic(this.db, async (tx) => {
      await tx.run(
        `INSERT INTO service_events (id, vehicle_id, date, odometer_km, garage_name, notes, origin, extraction_id,
           authority, verification_json, confirmed_at, created_at, updated_at, version)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          e.id,
          e.vehicleId,
          e.date,
          e.odometerKm,
          e.garageName,
          e.notes,
          e.origin,
          e.extractionId,
          e.authority,
          toJson(e.verification),
          e.confirmedAt,
          e.createdAt,
          e.updatedAt,
          e.version,
        ],
      );
      for (const [i, a] of e.actions.entries()) {
        await tx.run(
          `INSERT INTO service_actions (id, service_event_id, vehicle_id, position, title, action_type, performed,
             maintenance_item_id, unlisted) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            a.id,
            e.id,
            e.vehicleId,
            i,
            a.title,
            a.actionType,
            int(a.performed),
            a.maintenanceItemId,
            int(a.unlisted),
          ],
        );
      }
      for (const docId of e.documentIds) {
        // The document must belong to the same vehicle — refuse cross-vehicle evidence links.
        const doc = await tx.first('SELECT id FROM documents WHERE id = ? AND vehicle_id = ?', [
          docId,
          e.vehicleId,
        ]);
        if (!doc) throw new Error('Document does not belong to this vehicle');
        await tx.run(
          'INSERT INTO service_event_documents (service_event_id, document_id) VALUES (?, ?)',
          [e.id, docId],
        );
      }
    });
  }

  async list(vehicleId: VehicleId): Promise<ServiceEvent[]> {
    const rows = await this.db.all<EventRow>('SELECT * FROM service_events WHERE vehicle_id = ?', [
      vehicleId,
    ]);
    const events = await Promise.all(rows.map((r) => this.hydrate(r)));
    return sortHistory(events);
  }

  async get(vehicleId: VehicleId, id: ServiceEventId): Promise<ServiceEvent | null> {
    const r = await this.db.first<EventRow>(
      'SELECT * FROM service_events WHERE vehicle_id = ? AND id = ?',
      [vehicleId, id],
    );
    return r ? this.hydrate(r) : null;
  }

  private async hydrate(r: EventRow): Promise<ServiceEvent> {
    const actions = await this.db.all<ActionRow>(
      'SELECT * FROM service_actions WHERE service_event_id = ? AND vehicle_id = ? ORDER BY position',
      [r.id, r.vehicle_id],
    );
    const docs = await this.db.all<{ document_id: string }>(
      'SELECT document_id FROM service_event_documents WHERE service_event_id = ? ORDER BY document_id',
      [r.id],
    );
    return {
      id: r.id as ServiceEventId,
      vehicleId: r.vehicle_id as VehicleId,
      date: r.date as ServiceEvent['date'],
      odometerKm: r.odometer_km,
      garageName: r.garage_name,
      notes: r.notes,
      origin: r.origin,
      extractionId: r.extraction_id as ServiceEvent['extractionId'],
      authority: r.authority,
      verification: fromJson(r.verification_json),
      confirmedAt: r.confirmed_at as Timestamp,
      actions: actions.map((a) => ({
        id: a.id as ServiceEvent['actions'][number]['id'],
        title: a.title,
        actionType: a.action_type,
        performed: bool(a.performed),
        maintenanceItemId:
          a.maintenance_item_id as ServiceEvent['actions'][number]['maintenanceItemId'],
        unlisted: bool(a.unlisted),
      })),
      documentIds: docs.map((d) => d.document_id as DocumentId),
      ...meta(r),
    };
  }
}

// ---------- Garage recommendations, deferred items, alerts (T048) ----------

interface RecRow extends Meta {
  id: string;
  vehicle_id: string;
  text: string;
  date: string;
  garage_name: string | null;
  source_document_id: string | null;
  authority: GarageRecommendation['authority'];
}

export class GarageRecommendationRepository {
  constructor(private readonly db: Executor) {}

  async add(g: GarageRecommendation): Promise<void> {
    await this.db.run(
      `INSERT INTO garage_recommendations (id, vehicle_id, text, date, garage_name, source_document_id, authority,
         created_at, updated_at, version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        g.id,
        g.vehicleId,
        g.text,
        g.date,
        g.garageName,
        g.sourceDocumentId,
        g.authority,
        g.createdAt,
        g.updatedAt,
        g.version,
      ],
    );
  }

  async list(vehicleId: VehicleId): Promise<GarageRecommendation[]> {
    const rows = await this.db.all<RecRow>(
      'SELECT * FROM garage_recommendations WHERE vehicle_id = ? ORDER BY date DESC, created_at DESC',
      [vehicleId],
    );
    return rows.map((r) => ({
      id: r.id as GarageRecommendation['id'],
      vehicleId: r.vehicle_id as VehicleId,
      text: r.text,
      date: r.date as GarageRecommendation['date'],
      garageName: r.garage_name,
      sourceDocumentId: r.source_document_id as GarageRecommendation['sourceDocumentId'],
      authority: r.authority,
      ...meta(r),
    }));
  }
}

interface DeferredRow extends Meta {
  id: string;
  vehicle_id: string;
  maintenance_item_id: string;
  deferred_at: string;
  service_event_id: string | null;
  reason: string | null;
  resolved_by_service_event_id: string | null;
}

export class DeferredItemRepository {
  constructor(private readonly db: Executor) {}

  async add(d: DeferredItem): Promise<void> {
    await this.db.run(
      `INSERT INTO deferred_items (id, vehicle_id, maintenance_item_id, deferred_at, service_event_id, reason,
         resolved_by_service_event_id, created_at, updated_at, version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        d.id,
        d.vehicleId,
        d.maintenanceItemId,
        d.deferredAt,
        d.serviceEventId,
        d.reason,
        d.resolvedByServiceEventId,
        d.createdAt,
        d.updatedAt,
        d.version,
      ],
    );
  }

  async listOpen(vehicleId: VehicleId): Promise<DeferredItem[]> {
    const rows = await this.db.all<DeferredRow>(
      `SELECT * FROM deferred_items WHERE vehicle_id = ? AND resolved_by_service_event_id IS NULL
       ORDER BY deferred_at`,
      [vehicleId],
    );
    return rows.map((r) => ({
      id: r.id as DeferredItem['id'],
      vehicleId: r.vehicle_id as VehicleId,
      maintenanceItemId: r.maintenance_item_id as DeferredItem['maintenanceItemId'],
      deferredAt: r.deferred_at as DeferredItem['deferredAt'],
      serviceEventId: r.service_event_id as DeferredItem['serviceEventId'],
      reason: r.reason,
      resolvedByServiceEventId:
        r.resolved_by_service_event_id as DeferredItem['resolvedByServiceEventId'],
      ...meta(r),
    }));
  }
}

interface AlertRow extends Meta {
  id: string;
  vehicle_id: string;
  kind: Alert['kind'];
  status: Alert['status'];
  basis_json: string;
  raised_at: string;
  snoozed_until: string | null;
}

const toAlert = (r: AlertRow): Alert => ({
  id: r.id as Alert['id'],
  vehicleId: r.vehicle_id as VehicleId,
  kind: r.kind,
  status: r.status,
  basis: fromJson(r.basis_json),
  raisedAt: r.raised_at as Timestamp,
  snoozedUntil: r.snoozed_until as Alert['snoozedUntil'],
  ...meta(r),
});

export class AlertRepository {
  constructor(private readonly db: Executor) {}

  async add(a: Alert): Promise<void> {
    await this.db.run(
      `INSERT INTO alerts (id, vehicle_id, kind, status, basis_json, raised_at, snoozed_until, created_at, updated_at,
         version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        a.id,
        a.vehicleId,
        a.kind,
        a.status,
        toJson(a.basis),
        a.raisedAt,
        a.snoozedUntil,
        a.createdAt,
        a.updatedAt,
        a.version,
      ],
    );
  }

  async update(a: Alert): Promise<void> {
    const r = await this.db.run(
      `UPDATE alerts SET status = ?, basis_json = ?, snoozed_until = ?, updated_at = ?, version = ?
       WHERE id = ? AND vehicle_id = ? AND version = ?`,
      [
        a.status,
        toJson(a.basis),
        a.snoozedUntil,
        a.updatedAt,
        a.version,
        a.id,
        a.vehicleId,
        a.version - 1,
      ],
    );
    if (r.changes !== 1) throw new ConcurrencyError('Alert', a.id);
  }

  async list(vehicleId: VehicleId, status?: Alert['status']): Promise<Alert[]> {
    const rows = status
      ? await this.db.all<AlertRow>(
          'SELECT * FROM alerts WHERE vehicle_id = ? AND status = ? ORDER BY raised_at DESC',
          [vehicleId, status],
        )
      : await this.db.all<AlertRow>(
          'SELECT * FROM alerts WHERE vehicle_id = ? ORDER BY raised_at DESC',
          [vehicleId],
        );
    return rows.map(toAlert);
  }

  async get(vehicleId: VehicleId, id: Alert['id']): Promise<Alert | null> {
    const r = await this.db.first<AlertRow>(
      'SELECT * FROM alerts WHERE vehicle_id = ? AND id = ?',
      [vehicleId, id],
    );
    return r ? toAlert(r) : null;
  }

  /** Resolve an alert id to its owning vehicle (for deep links that carry only the alert id). */
  async ownerOf(id: Alert['id']): Promise<VehicleId | null> {
    const r = await this.db.first<{ vehicle_id: string }>(
      'SELECT vehicle_id FROM alerts WHERE id = ?',
      [id],
    );
    return (r?.vehicle_id as VehicleId) ?? null;
  }
}
