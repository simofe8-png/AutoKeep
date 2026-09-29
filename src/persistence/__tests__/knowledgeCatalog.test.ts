import {
  admitToCatalog,
  type IsoDate,
  type MaintenanceRequirement,
  type Timestamp,
} from '@/domain';

import { migrate, MIGRATIONS } from '..';
import { KnowledgeCatalogRepository } from '../repositories/maintenance';
import { openTestDatabase } from '../testing/sqljsDatabase';

async function open() {
  const db = await openTestDatabase();
  await migrate(db, MIGRATIONS, () => NOW);
  return db;
}

/** Reusable knowledge catalog (migration v7) — SYNTHETIC requirements only. */
const TODAY = '2026-09-30' as IsoDate;
const NOW = '2026-09-30T09:00:00.000Z' as Timestamp;

const req = (id: string, every: number): MaintenanceRequirement => ({
  id,
  task: 'engine_oil',
  action: 'replacement',
  interval: { every: { value: every, unit: 'km' }, rule: 'distance_only', repeats: true },
  applicability: { makes: ['synthmoto'], models: ['SX 125'], markets: ['EU'] },
  authority: 'manufacturer',
  evidence: [
    {
      documentId: 'd',
      documentTitle: 'SYNTHETIC',
      authority: 'manufacturer',
      markets: ['EU'],
      page: 2,
      documentSha256: 'c'.repeat(64),
    },
  ],
  verification: 'verified',
  extraction: { method: 'deterministic_parser', by: 'test', at: TODAY, grounded: true },
});
const source = (sha: string) => ({
  url: 'https://synthetic.example/m.pdf',
  host: 'synthetic.example',
  sha256: sha,
  authority: 'manufacturer' as const,
  markets: ['EU'],
  retrievedAt: TODAY,
});

describe('knowledge catalog persistence (v7)', () => {
  it('has no vehicle, user or plate column — knowledge is keyed by vehicle class only', async () => {
    const db = await open();
    const cols = (await db.all<{ name: string }>('PRAGMA table_info(knowledge_catalog)')).map(
      (c) => c.name,
    );
    expect(cols).toContain('scope_key');
    expect(cols.filter((c) => /vehicle|user|plate|vin|account/.test(c))).toEqual([]);
  });

  it('round-trips entries, keeps superseded editions and survives a reopen of the repository', async () => {
    const db = await open();
    const repo = new KnowledgeCatalogRepository(db);
    const first = admitToCatalog(
      [],
      [{ requirement: req('a', 10000), source: source('1'.repeat(64)) }],
      TODAY,
    );
    await repo.save(first.entries, NOW);
    const next = admitToCatalog(
      await repo.all(),
      [{ requirement: req('b', 12000), source: source('2'.repeat(64)) }],
      TODAY,
    );
    await repo.save(next.entries, NOW);
    const again = await new KnowledgeCatalogRepository(db).all();
    expect(again.map((e) => [e.id, e.supersededBy])).toEqual([
      ['a', 'b'],
      ['b', null],
    ]);
    expect(again[1].requirement.interval.every).toEqual({ value: 12000, unit: 'km' });
    expect(again[1].source.sha256).toBe('2'.repeat(64));
  });
});
