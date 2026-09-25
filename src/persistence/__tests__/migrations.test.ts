import { MIGRATIONS } from '../migrations';
import { migrate, MigrationError, type Migration } from '../migrations/runner';
import { openTestDatabase } from '../testing/sqljsDatabase';

const now = () => '2026-09-26T00:00:00.000Z';

describe('migration framework (T043)', () => {
  it('applies the initial schema once and is idempotent', async () => {
    const db = await openTestDatabase();
    expect(await migrate(db, MIGRATIONS, now)).toEqual({ from: 0, to: MIGRATIONS.length });
    expect(await migrate(db, MIGRATIONS, now)).toEqual({
      from: MIGRATIONS.length,
      to: MIGRATIONS.length,
    });
    const tables = await db.all<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
    );
    expect(tables.map((t) => t.name)).toEqual(
      expect.arrayContaining([
        'vehicles',
        'odometer_readings',
        'service_events',
        'alerts',
        'settings',
      ]),
    );
  });

  it('every vehicle-scoped table has a NOT NULL vehicle_id', async () => {
    const db = await openTestDatabase();
    await migrate(db, MIGRATIONS, now);
    const scoped = [
      'odometer_readings',
      'documents',
      'extractions',
      'schedules',
      'service_events',
      'service_actions',
      'garage_recommendations',
      'deferred_items',
      'alerts',
    ];
    for (const table of scoped) {
      const cols = await db.all<{ name: string; notnull: number }>(`PRAGMA table_info(${table})`);
      const col = cols.find((c) => c.name === 'vehicle_id');
      expect({ table, notnull: col?.notnull }).toEqual({ table, notnull: 1 });
    }
  });

  it('rolls back a failing migration atomically and records nothing', async () => {
    const db = await openTestDatabase();
    const broken: Migration[] = [
      ...MIGRATIONS,
      {
        version: MIGRATIONS.length + 1,
        name: 'broken',
        up: 'CREATE TABLE ok_table (id TEXT); NOT SQL;',
      },
    ];
    await expect(migrate(db, broken, now)).rejects.toThrow();
    const applied = await db.first<{ v: number }>(
      'SELECT MAX(version) AS v FROM schema_migrations',
    );
    expect(applied?.v).toBe(MIGRATIONS.length);
    const t = await db.first("SELECT name FROM sqlite_master WHERE name = 'ok_table'");
    expect(t).toBeNull();
  });

  it('refuses to open a database created by a newer app version', async () => {
    const db = await openTestDatabase();
    await migrate(db, MIGRATIONS, now);
    await db.run('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)', [
      99,
      'future',
      now(),
    ]);
    await expect(migrate(db, MIGRATIONS, now)).rejects.toBeInstanceOf(MigrationError);
  });

  it('enforces foreign keys', async () => {
    const db = await openTestDatabase();
    await migrate(db, MIGRATIONS, now);
    await expect(
      db.run(
        `INSERT INTO odometer_readings (id, vehicle_id, value_km, measured_at, source, created_at, updated_at)
         VALUES ('r1', 'missing-vehicle', 1, '2026-01-01', 'user', 'x', 'x')`,
      ),
    ).rejects.toThrow(/FOREIGN KEY/);
  });
});
