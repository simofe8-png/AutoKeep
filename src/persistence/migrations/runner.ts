import type { SqlDatabase } from '../db/types';

export interface Migration {
  version: number;
  name: string;
  /** Forward-only SQL. Migrations are append-only once released; never edit an applied one. */
  up: string;
}

export class MigrationError extends Error {}

/**
 * Applies pending migrations in order, each atomically, recording them in `schema_migrations`.
 * Refuses to run against a database newer than the app (never downgrades or drops user data).
 */
export async function migrate(
  db: SqlDatabase,
  migrations: readonly Migration[],
  now: () => string,
): Promise<{ from: number; to: number }> {
  const versions = migrations.map((m) => m.version);
  if (versions.some((v, i) => v !== i + 1)) {
    throw new MigrationError('Migrations must be numbered 1..n without gaps');
  }
  await db.exec(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       version INTEGER PRIMARY KEY,
       name TEXT NOT NULL,
       applied_at TEXT NOT NULL
     );`,
  );
  const row = await db.first<{ v: number | null }>(
    'SELECT MAX(version) AS v FROM schema_migrations',
  );
  const from = row?.v ?? 0;
  const latest = migrations.length;
  if (from > latest) {
    throw new MigrationError(
      `Database schema v${from} is newer than this app (v${latest}); refusing to open`,
    );
  }
  for (const m of migrations.slice(from)) {
    await db.transaction(async (tx) => {
      await tx.exec(m.up);
      await tx.run('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)', [
        m.version,
        m.name,
        now(),
      ]);
    });
  }
  return { from, to: latest };
}
