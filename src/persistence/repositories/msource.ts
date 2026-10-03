import type { CachedSource, MSourceRun } from '@/discovery/maintenance/msource/run';
import type { DiscoveryStatus } from '@/discovery/maintenance/msource/status';
import type { ResolvedSchedule } from '@/discovery/maintenance/msource/types';
import type { MaintenanceRequirement, Timestamp, VehicleId } from '@/domain';

import { fromJson, toJson, type Executor } from './base';

/**
 * M-SOURCE persistence (local-only, migrations v10–v11). Runs and schedules are vehicle-scoped and
 * every query filters by vehicle_id; the evidence cache is keyed by vehicle CLASS only.
 */

export interface StoredMSourceSchedule {
  runId: string;
  fingerprintKey: string;
  schedule: ResolvedSchedule;
  requirements: MaintenanceRequirement[];
  resolvedAt: string;
}

export type OwnerDecision = 'accepted' | 'rejected';

export class MSourceRepository {
  constructor(private readonly db: Executor) {}

  /** The owner's decisions on proposals from their own documents, by proposal key. */
  async ownerDecisions(
    vehicleId: VehicleId,
  ): Promise<Map<string, { decision: OwnerDecision; decidedAt: string }>> {
    const rows = await this.db.all<{
      proposal_key: string;
      decision: OwnerDecision;
      decided_at: string;
    }>(
      'SELECT proposal_key, decision, decided_at FROM msource_owner_reviews WHERE vehicle_id = ?',
      [vehicleId],
    );
    return new Map(
      rows.map((r) => [r.proposal_key, { decision: r.decision, decidedAt: r.decided_at }]),
    );
  }

  async saveOwnerDecision(
    vehicleId: VehicleId,
    proposalKey: string,
    decision: OwnerDecision,
    now: Timestamp,
  ): Promise<void> {
    await this.db.run(
      `INSERT INTO msource_owner_reviews (vehicle_id, proposal_key, decision, decided_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(vehicle_id, proposal_key) DO UPDATE SET decision = excluded.decision,
         decided_at = excluded.decided_at`,
      [vehicleId, proposalKey, decision, now],
    );
  }

  /** Creates or updates the run row with its current (progress or terminal) status. */
  async saveStatus(
    vehicleId: VehicleId,
    runId: string,
    fingerprintKey: string,
    version: string,
    status: DiscoveryStatus,
    now: Timestamp,
  ): Promise<void> {
    await this.db.run(
      `INSERT INTO msource_runs
         (run_id, vehicle_id, fingerprint_key, state, status_json, msource_version, started_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(run_id) DO UPDATE SET state = excluded.state, status_json = excluded.status_json,
         updated_at = excluded.updated_at`,
      [runId, vehicleId, fingerprintKey, status.state, toJson(status), version, now, now],
    );
  }

  async saveRun(vehicleId: VehicleId, run: MSourceRun, status: DiscoveryStatus, now: Timestamp) {
    await this.db.run(
      `UPDATE msource_runs SET run_json = ?, state = ?, status_json = ?, finished_at = ?, updated_at = ?
       WHERE run_id = ? AND vehicle_id = ?`,
      [toJson(run), status.state, toJson(status), run.finishedAt, now, run.runId, vehicleId],
    );
  }

  async latestStatus(vehicleId: VehicleId): Promise<DiscoveryStatus | null> {
    const row = await this.db.first<{ status_json: string }>(
      `SELECT status_json FROM msource_runs WHERE vehicle_id = ?
       ORDER BY started_at DESC, updated_at DESC LIMIT 1`,
      [vehicleId],
    );
    return row ? fromJson<DiscoveryStatus>(row.status_json) : null;
  }

  async latestRun(vehicleId: VehicleId): Promise<MSourceRun | null> {
    const row = await this.db.first<{ run_json: string | null }>(
      `SELECT run_json FROM msource_runs WHERE vehicle_id = ? AND run_json IS NOT NULL
       ORDER BY started_at DESC LIMIT 1`,
      [vehicleId],
    );
    return row?.run_json ? fromJson<MSourceRun>(row.run_json) : null;
  }

  async saveSchedule(vehicleId: VehicleId, s: StoredMSourceSchedule, now: Timestamp) {
    await this.db.run(
      `INSERT INTO msource_schedules
         (vehicle_id, run_id, fingerprint_key, status, schedule_json, requirements_json, resolved_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(vehicle_id) DO UPDATE SET run_id = excluded.run_id,
         fingerprint_key = excluded.fingerprint_key, status = excluded.status,
         schedule_json = excluded.schedule_json, requirements_json = excluded.requirements_json,
         resolved_at = excluded.resolved_at, updated_at = excluded.updated_at`,
      [
        vehicleId,
        s.runId,
        s.fingerprintKey,
        s.schedule.status,
        toJson(s.schedule),
        toJson(s.requirements),
        s.resolvedAt,
        now,
      ],
    );
  }

  async schedule(vehicleId: VehicleId): Promise<StoredMSourceSchedule | null> {
    const row = await this.db.first<{
      run_id: string;
      fingerprint_key: string;
      schedule_json: string;
      requirements_json: string;
      resolved_at: string;
    }>(
      `SELECT run_id, fingerprint_key, schedule_json, requirements_json, resolved_at
       FROM msource_schedules WHERE vehicle_id = ?`,
      [vehicleId],
    );
    return row
      ? {
          runId: row.run_id,
          fingerprintKey: row.fingerprint_key,
          schedule: fromJson<ResolvedSchedule>(row.schedule_json),
          requirements: fromJson<MaintenanceRequirement[]>(row.requirements_json),
          resolvedAt: row.resolved_at,
        }
      : null;
  }

  async cachedSources(classKey: string): Promise<{ url: string; value: CachedSource }[]> {
    const rows = await this.db.all<{ canonical_url: string; value_json: string }>(
      `SELECT canonical_url, value_json FROM msource_evidence_cache WHERE class_key = ?`,
      [classKey],
    );
    return rows.map((r) => ({ url: r.canonical_url, value: fromJson<CachedSource>(r.value_json) }));
  }

  async cacheSource(classKey: string, url: string, value: CachedSource): Promise<void> {
    await this.db.run(
      `INSERT INTO msource_evidence_cache (class_key, canonical_url, content_sha256, value_json, retrieved_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(class_key, canonical_url) DO UPDATE SET content_sha256 = excluded.content_sha256,
         value_json = excluded.value_json, retrieved_at = excluded.retrieved_at`,
      [classKey, url, value.provenance.contentSha256, toJson(value), value.provenance.retrievedAt],
    );
  }
}
