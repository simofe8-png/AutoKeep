import { timestamp, touch } from '@/domain';
import { sequentialIds, T0 } from '@/domain/testing';
import { VehicleRepository } from '@/persistence';
import { populatedWorld } from '@/persistence/testing/world';

import { backoffDelay, BASE_DELAY_MS, MAX_DELAY_MS, pendingCount } from '../engine';
import { mergeRows } from '../merge';

interface Op {
  entity_table: string;
  entity_id: string;
  op: string;
  base_version: number;
  op_id: string;
  vehicle_id: string | null;
}

describe('outbox (T073): triggers enqueue every change atomically', () => {
  it('records inserts with base_version 0 and coalesces updates keeping the original base', async () => {
    const w = await populatedWorld(sequentialIds(), T0);
    const ops = await w.db.all<Op>('SELECT * FROM sync_outbox');
    expect(ops.length).toBeGreaterThan(15);
    const carOp = ops.find((o) => o.entity_table === 'vehicles' && o.entity_id === w.car.id)!;
    expect(carOp).toMatchObject({ op: 'upsert', base_version: 0, vehicle_id: w.car.id });
    expect(carOp.op_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );

    const repo = new VehicleRepository(w.db);
    const edited = {
      ...w.car,
      identity: { ...w.car.identity, trim: 'Sun' },
      ...touch(w.car, timestamp('2026-09-26T00:00:00.000Z')),
    };
    await repo.update(edited);
    const after = await w.db.all<Op>(
      "SELECT * FROM sync_outbox WHERE entity_table = 'vehicles' AND entity_id = ?",
      [w.car.id],
    );
    expect(after).toHaveLength(1); // coalesced
    expect(after[0].base_version).toBe(0); // original base kept
    expect(after[0].op_id).not.toBe(carOp.op_id); // re-keyed so an in-flight ack cannot drop it
  });

  it('does not enqueue while remote rows are being applied', async () => {
    const w = await populatedWorld(sequentialIds(), T0);
    await w.db.run('DELETE FROM sync_outbox');
    await w.db.run('UPDATE sync_control SET applying = 1');
    await w.db.run("UPDATE vehicles SET trim = 'remote' WHERE id = ?", [w.car.id]);
    await w.db.run('UPDATE sync_control SET applying = 0');
    expect(await pendingCount(w.db)).toBe(0);
  });

  it('permanent vehicle deletion drops its pending child ops and queues one delete', async () => {
    const w = await populatedWorld(sequentialIds(), T0);
    await new VehicleRepository(w.db).deletePermanently(w.car.id);
    const ops = await w.db.all<Op>(
      'SELECT * FROM sync_outbox WHERE vehicle_id = ? OR entity_id = ?',
      [w.car.id, w.car.id],
    );
    expect(ops).toEqual([expect.objectContaining({ entity_table: 'vehicles', op: 'delete' })]);
  });

  it('a change and its outbox entry commit or roll back together', async () => {
    const w = await populatedWorld(sequentialIds(), T0);
    await w.db.run('DELETE FROM sync_outbox');
    await expect(
      w.db.transaction(async (tx) => {
        await tx.run("UPDATE vehicles SET trim = 'x' WHERE id = ?", [w.car.id]);
        throw new Error('crash');
      }),
    ).rejects.toThrow('crash');
    expect(await pendingCount(w.db)).toBe(0);
  });
});

describe('retry policy (T075)', () => {
  it('backs off exponentially with jitter and a ceiling', () => {
    expect(backoffDelay(1, () => 0)).toBe(BASE_DELAY_MS / 2);
    expect(backoffDelay(1, () => 1)).toBe(BASE_DELAY_MS);
    expect(backoffDelay(3, () => 1)).toBe(BASE_DELAY_MS * 4);
    expect(backoffDelay(30, () => 1)).toBe(MAX_DELAY_MS);
  });
});

describe('entity-aware merge (T076)', () => {
  const base = {
    id: 'v1',
    trim: 'A',
    engine: '1.6',
    lifecycle: 'active',
    archived_at: null,
    updated_at: '2026-09-01T00:00:00.000Z',
    version: 3,
  };

  it('vehicles: changes to different fields on two devices are both kept, no conflict', () => {
    const local = { ...base, trim: 'Sun', updated_at: '2026-09-02T00:00:00.000Z', version: 4 };
    const remote = {
      ...base,
      lifecycle: 'archived',
      archived_at: '2026-09-03T00:00:00.000Z',
      updated_at: '2026-09-03T00:00:00.000Z',
      version: 4,
    };
    const r = mergeRows('vehicles', base, local, remote);
    expect(r.row).toMatchObject({ trim: 'Sun', lifecycle: 'archived', version: 5 });
    expect(r.conflicts).toEqual([]);
  });

  it('vehicles: same field changed on both sides → later edit wins and the conflict is recorded', () => {
    const local = { ...base, engine: '1.8', updated_at: '2026-09-05T00:00:00.000Z', version: 4 };
    const remote = { ...base, engine: '2.0', updated_at: '2026-09-04T00:00:00.000Z', version: 4 };
    const r = mergeRows('vehicles', base, local, remote);
    expect(r.row.engine).toBe('1.8');
    expect(r.conflicts).toEqual([
      { field: 'engine', localValue: '1.8', remoteValue: '2.0', kept: 'local' },
    ]);
  });

  it('alerts: handled is terminal regardless of timing', () => {
    const a = {
      id: 'a',
      status: 'active',
      snoozed_until: null,
      updated_at: '2026-09-01T00:00:00.000Z',
      version: 1,
    };
    const handledRemote = {
      ...a,
      status: 'handled',
      updated_at: '2026-09-02T00:00:00.000Z',
      version: 2,
    };
    const snoozedLocal = {
      ...a,
      status: 'deferred',
      snoozed_until: '2026-10-01',
      updated_at: '2026-09-03T00:00:00.000Z',
      version: 2,
    };
    expect(mergeRows('alerts', a, snoozedLocal, handledRemote).row).toMatchObject({
      status: 'handled',
      snoozed_until: null,
    });
  });

  it('deferred items: resolution is sticky', () => {
    const d = {
      id: 'd',
      reason: 'x',
      resolved_by_service_event_id: null,
      updated_at: '2026-09-01T00:00:00.000Z',
      version: 1,
    };
    const local = { ...d, reason: 'y', updated_at: '2026-09-03T00:00:00.000Z', version: 2 };
    const remote = {
      ...d,
      resolved_by_service_event_id: 'svc-1',
      updated_at: '2026-09-02T00:00:00.000Z',
      version: 2,
    };
    expect(mergeRows('deferred_items', d, local, remote).row).toMatchObject({
      reason: 'y',
      resolved_by_service_event_id: 'svc-1',
    });
  });

  it('append-only records are never merged field-by-field', () => {
    const r = mergeRows(
      'service_events',
      null,
      { id: 's', notes: 'local' },
      { id: 's', notes: 'server' },
    );
    expect(r).toEqual({ row: { id: 's', notes: 'server' }, conflicts: [] });
  });
});
