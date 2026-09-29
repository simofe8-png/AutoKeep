import type {
  CandidateClaim,
  KnowledgeEntry,
  IsoDate,
  KnowledgeDocument,
  Timestamp,
  UsageCondition,
  VehicleId,
} from '@/domain';

import { fromJson, toJson, type Executor } from './base';

/**
 * Maintenance knowledge persistence (local-only, migration v6). Every row is vehicle-scoped and
 * every query filters by vehicle_id: one vehicle's documents, claims and answers never appear on
 * another vehicle.
 */

export interface MaintenanceProfile {
  vehicleId: VehicleId;
  /** First registration / in-service date (ISO); `precision: 'month'` = day unknown (01). */
  inService: { date: IsoDate; precision: 'day' | 'month'; source: 'registry' | 'user' } | null;
  /** Manufacturer service-regime code as read by the owner (e.g. SEAT QG0 / QG1 / QG2). */
  serviceRegime: string | null;
  usage: UsageCondition | null;
  updatedAt: Timestamp;
}

interface ProfileRow {
  vehicle_id: string;
  in_service_date: string | null;
  in_service_precision: 'day' | 'month' | null;
  in_service_source: 'registry' | 'user' | null;
  service_regime: string | null;
  usage: UsageCondition | null;
  updated_at: string;
}

interface DocRow {
  id: string;
  vehicle_id: string;
  document_id: string | null;
  origin: KnowledgeDocument['origin'];
  title: string;
  authority: KnowledgeDocument['authority'];
  markets_json: string;
  edition: string | null;
  published_on: string | null;
  sha256: string;
  page_count: number | null;
  authenticity: KnowledgeDocument['authenticity'];
  owner_confirmed_at: string | null;
  rights: KnowledgeDocument['rights'];
  excerpt_policy: KnowledgeDocument['excerptPolicy'];
  coverage_json: string;
}

interface ClaimRow {
  id: string;
  vehicle_id: string;
  knowledge_document_id: string;
  task: CandidateClaim['task'];
  task_text: string | null;
  action: CandidateClaim['action'];
  interval_json: string;
  applicability_json: string;
  locator_json: string;
  excerpt: string | null;
  extraction_json: string;
  status: CandidateClaim['status'];
  review_json: string | null;
}

/** A vehicle-scoped knowledge document, linked to the stored original it describes. */
export type StoredKnowledgeDocument = KnowledgeDocument & { documentId: string | null };

export class MaintenanceKnowledgeRepository {
  constructor(private readonly db: Executor) {}

  // ---------- profile ----------

  async profile(vehicleId: VehicleId): Promise<MaintenanceProfile | null> {
    const r = await this.db.first<ProfileRow>(
      'SELECT * FROM maintenance_profiles WHERE vehicle_id = ?',
      [vehicleId],
    );
    if (!r) return null;
    return {
      vehicleId,
      inService:
        r.in_service_date && r.in_service_precision && r.in_service_source
          ? {
              date: r.in_service_date as IsoDate,
              precision: r.in_service_precision,
              source: r.in_service_source,
            }
          : null,
      serviceRegime: r.service_regime,
      usage: r.usage,
      updatedAt: r.updated_at as Timestamp,
    };
  }

  /** Merges the given fields into the vehicle's profile (unknown stays NULL). */
  async saveProfile(
    vehicleId: VehicleId,
    patch: Partial<Pick<MaintenanceProfile, 'inService' | 'serviceRegime' | 'usage'>>,
    now: Timestamp,
  ): Promise<void> {
    const cur = await this.profile(vehicleId);
    const next = {
      inService: patch.inService !== undefined ? patch.inService : (cur?.inService ?? null),
      serviceRegime:
        patch.serviceRegime !== undefined ? patch.serviceRegime : (cur?.serviceRegime ?? null),
      usage: patch.usage !== undefined ? patch.usage : (cur?.usage ?? null),
    };
    await this.db.run(
      `INSERT INTO maintenance_profiles
         (vehicle_id, in_service_date, in_service_precision, in_service_source, service_regime, usage, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(vehicle_id) DO UPDATE SET
         in_service_date = excluded.in_service_date,
         in_service_precision = excluded.in_service_precision,
         in_service_source = excluded.in_service_source,
         service_regime = excluded.service_regime,
         usage = excluded.usage,
         updated_at = excluded.updated_at`,
      [
        vehicleId,
        next.inService?.date ?? null,
        next.inService?.precision ?? null,
        next.inService?.source ?? null,
        next.serviceRegime,
        next.usage,
        now,
      ],
    );
  }

  // ---------- documents ----------

  async addDocument(
    doc: KnowledgeDocument & { vehicleId: string },
    documentId: string | null,
    now: Timestamp,
  ): Promise<void> {
    await this.db.run(
      `INSERT INTO knowledge_documents
         (id, vehicle_id, document_id, origin, title, authority, markets_json, edition, published_on,
          sha256, page_count, authenticity, owner_confirmed_at, rights, excerpt_policy, coverage_json,
          created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        doc.id,
        doc.vehicleId,
        documentId,
        doc.origin,
        doc.title,
        doc.authority,
        toJson(doc.markets),
        doc.edition ?? null,
        doc.publishedOn ?? null,
        doc.sha256,
        doc.pageCount ?? null,
        doc.authenticity,
        doc.ownerConfirmedAt ?? null,
        doc.rights,
        doc.excerptPolicy,
        toJson(doc.coverage),
        now,
        now,
      ],
    );
  }

  async updateDocument(doc: KnowledgeDocument & { vehicleId: string }, now: Timestamp) {
    await this.db.run(
      `UPDATE knowledge_documents SET authenticity = ?, owner_confirmed_at = ?, authority = ?,
         markets_json = ?, edition = ?, published_on = ?, coverage_json = ?, excerpt_policy = ?,
         updated_at = ?
       WHERE id = ? AND vehicle_id = ?`,
      [
        doc.authenticity,
        doc.ownerConfirmedAt ?? null,
        doc.authority,
        toJson(doc.markets),
        doc.edition ?? null,
        doc.publishedOn ?? null,
        toJson(doc.coverage),
        doc.excerptPolicy,
        now,
        doc.id,
        doc.vehicleId,
      ],
    );
  }

  async documents(vehicleId: VehicleId): Promise<StoredKnowledgeDocument[]> {
    const rows = await this.db.all<DocRow>(
      'SELECT * FROM knowledge_documents WHERE vehicle_id = ? ORDER BY created_at',
      [vehicleId],
    );
    return rows.map((r) => ({
      id: r.id,
      vehicleId: r.vehicle_id,
      documentId: r.document_id,
      origin: r.origin,
      title: r.title,
      authority: r.authority,
      markets: fromJson<string[]>(r.markets_json) ?? [],
      edition: r.edition ?? undefined,
      publishedOn: (r.published_on ?? undefined) as IsoDate | undefined,
      sha256: r.sha256,
      pageCount: r.page_count ?? undefined,
      authenticity: r.authenticity,
      ownerConfirmedAt: (r.owner_confirmed_at ?? undefined) as IsoDate | undefined,
      rights: r.rights,
      excerptPolicy: r.excerpt_policy,
      coverage: fromJson(r.coverage_json) ?? {},
    }));
  }

  // ---------- claims ----------

  async saveClaim(c: CandidateClaim & { vehicleId: string }, now: Timestamp): Promise<void> {
    await this.db.run(
      `INSERT INTO maintenance_claims
         (id, vehicle_id, knowledge_document_id, task, task_text, action, interval_json,
          applicability_json, locator_json, excerpt, extraction_json, status, review_json,
          created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET status = excluded.status, review_json = excluded.review_json,
         updated_at = excluded.updated_at`,
      [
        c.id,
        c.vehicleId,
        c.documentId,
        c.task,
        c.taskText ?? null,
        c.action,
        toJson(c.interval),
        toJson(c.applicability),
        toJson(c.locator),
        c.excerpt ?? null,
        toJson(c.extraction),
        c.status,
        c.review ? toJson(c.review) : null,
        now,
        now,
      ],
    );
  }

  async claims(vehicleId: VehicleId): Promise<CandidateClaim[]> {
    const rows = await this.db.all<ClaimRow>(
      'SELECT * FROM maintenance_claims WHERE vehicle_id = ? ORDER BY created_at, id',
      [vehicleId],
    );
    return rows.map((r) => ({
      id: r.id,
      documentId: r.knowledge_document_id,
      vehicleId: r.vehicle_id,
      task: r.task,
      taskText: r.task_text ?? undefined,
      action: r.action,
      interval: fromJson(r.interval_json),
      applicability: fromJson(r.applicability_json) ?? {},
      locator: fromJson(r.locator_json) ?? {},
      excerpt: r.excerpt ?? undefined,
      extraction: fromJson(r.extraction_json),
      status: r.status,
      review: r.review_json ? fromJson(r.review_json) : undefined,
    }));
  }
}

// ---------- reusable knowledge catalog (migration v7) ----------

interface CatalogRow {
  id: string;
  scope_key: string;
  requirement_json: string;
  source_json: string;
  verified_at: string;
  superseded_by: string | null;
  conflicts_json: string;
}

/**
 * Reusable maintenance knowledge, keyed by vehicle-class scope only (no vehicle, user or plate
 * column). Writes go through `admitToCatalog` (domain) so only verified requirements are stored,
 * new editions supersede old ones and conflicts are recorded — never overwritten.
 */
export class KnowledgeCatalogRepository {
  constructor(private readonly db: Executor) {}

  async all(): Promise<KnowledgeEntry[]> {
    const rows = await this.db.all<CatalogRow>(
      `SELECT id, scope_key, requirement_json, source_json, verified_at, superseded_by, conflicts_json
       FROM knowledge_catalog ORDER BY id`,
    );
    return rows.map((r) => ({
      id: r.id,
      scopeKey: r.scope_key,
      requirement: fromJson(r.requirement_json),
      source: fromJson(r.source_json),
      verifiedAt: r.verified_at as IsoDate,
      supersededBy: r.superseded_by,
      conflictsWith: fromJson<string[]>(r.conflicts_json) ?? [],
    }));
  }

  /** Persists the result of `admitToCatalog` (upsert by id; history is kept, never deleted). */
  async save(entries: readonly KnowledgeEntry[], now: Timestamp): Promise<void> {
    for (const e of entries) {
      await this.db.run(
        `INSERT INTO knowledge_catalog (id, scope_key, task, action, requirement_json, source_url,
           source_host, source_sha256, source_json, verified_at, superseded_by, conflicts_json, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET superseded_by = excluded.superseded_by,
           conflicts_json = excluded.conflicts_json, updated_at = excluded.updated_at`,
        [
          e.id,
          e.scopeKey,
          e.requirement.task,
          e.requirement.action,
          toJson(e.requirement),
          e.source.url,
          e.source.host,
          e.source.sha256,
          toJson(e.source),
          e.verifiedAt,
          e.supersededBy,
          toJson(e.conflictsWith),
          now,
        ],
      );
    }
  }
}
