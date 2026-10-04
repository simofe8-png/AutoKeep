import type { OwnerEdit } from '@/discovery/maintenance/msource/ownerReview';
import type { MSourceRun } from '@/discovery/maintenance/msource/run';
import type { Timestamp, VehicleId } from '@/domain';

import { fromJson, toJson, type Executor } from './base';

/**
 * Readings of the owner's own maintenance documents and the owner's decisions on their items
 * (local-only, migrations v10–v12). Vehicle-scoped: every query filters by vehicle_id. (The tables
 * of the removed automatic search — msource_schedules, msource_evidence_cache — are no longer read.)
 */

export type OwnerDecision = 'accepted' | 'rejected';

export class MSourceRepository {
  constructor(private readonly db: Executor) {}

  /** The owner's decisions (and corrections) on proposals from their own documents, by key. */
  async ownerDecisions(
    vehicleId: VehicleId,
  ): Promise<Map<string, { decision: OwnerDecision; decidedAt: string; edit: OwnerEdit | null }>> {
    const rows = await this.db.all<{
      proposal_key: string;
      decision: OwnerDecision;
      decided_at: string;
      edit_json: string | null;
    }>(
      'SELECT proposal_key, decision, decided_at, edit_json FROM msource_owner_reviews WHERE vehicle_id = ?',
      [vehicleId],
    );
    return new Map(
      rows.map((r) => [
        r.proposal_key,
        {
          decision: r.decision,
          decidedAt: r.decided_at,
          edit: r.edit_json ? fromJson<OwnerEdit>(r.edit_json) : null,
        },
      ]),
    );
  }

  /** Saves a decision; an accepted item may carry the owner's correction (a rejection never). */
  async saveOwnerDecision(
    vehicleId: VehicleId,
    proposalKey: string,
    decision: OwnerDecision,
    now: Timestamp,
    edit: OwnerEdit | null = null,
  ): Promise<void> {
    await this.db.run(
      `INSERT INTO msource_owner_reviews (vehicle_id, proposal_key, decision, decided_at, edit_json)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(vehicle_id, proposal_key) DO UPDATE SET decision = excluded.decision,
         decided_at = excluded.decided_at, edit_json = excluded.edit_json`,
      [
        vehicleId,
        proposalKey,
        decision,
        now,
        decision === 'accepted' && edit ? toJson(edit) : null,
      ],
    );
  }

  /** Stores one reading of the owner's documents (its trace and evidence; no document bytes). */
  async saveRun(vehicleId: VehicleId, run: MSourceRun, now: Timestamp): Promise<void> {
    await this.db.run(
      `INSERT INTO msource_runs
         (run_id, vehicle_id, fingerprint_key, state, status_json, run_json, msource_version,
          started_at, finished_at, updated_at)
       VALUES (?, ?, ?, 'OWNER_DOCUMENTS', '{}', ?, ?, ?, ?, ?)
       ON CONFLICT(run_id) DO UPDATE SET run_json = excluded.run_json,
         finished_at = excluded.finished_at, updated_at = excluded.updated_at`,
      [
        run.runId,
        vehicleId,
        run.fingerprintKey,
        toJson(run),
        run.msourceVersion,
        run.startedAt,
        run.finishedAt,
        now,
      ],
    );
  }

  async latestRun(vehicleId: VehicleId): Promise<MSourceRun | null> {
    const row = await this.db.first<{ run_json: string | null }>(
      `SELECT run_json FROM msource_runs WHERE vehicle_id = ? AND run_json IS NOT NULL
       ORDER BY started_at DESC LIMIT 1`,
      [vehicleId],
    );
    return row?.run_json ? fromJson<MSourceRun>(row.run_json) : null;
  }
}
