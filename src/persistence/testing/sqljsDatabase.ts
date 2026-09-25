/**
 * TEST-ONLY SqlDatabase backed by sql.js (SQLite compiled to WASM). Never imported by app code.
 * Supports export/import of the raw database bytes to simulate app restarts.
 */
import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js';

import type { SqlDatabase, SqlExecutor, SqlParams } from '../db/types';

// Jest runs on Node; declare only what this test-only module needs instead of global Node types.
declare const require: { resolve(id: string): string };

let sqlJs: Promise<SqlJsStatic> | null = null;

function load(): Promise<SqlJsStatic> {
  sqlJs ??= initSqlJs({
    locateFile: (file: string) => require.resolve(`sql.js/dist/${file}`),
  });
  return sqlJs;
}

function executor(db: Database): SqlExecutor {
  const all = <T>(sql: string, params: SqlParams = []): T[] => {
    const stmt = db.prepare(sql);
    try {
      stmt.bind([...params]);
      const rows: T[] = [];
      while (stmt.step()) rows.push(stmt.getAsObject() as T);
      return rows;
    } finally {
      stmt.free();
    }
  };
  return {
    exec: async (sql) => {
      db.exec(sql);
    },
    run: async (sql, params = []) => {
      db.run(sql, [...params]);
      return { changes: db.getRowsModified() };
    },
    all: async <T>(sql: string, params?: SqlParams) => all<T>(sql, params),
    first: async <T>(sql: string, params?: SqlParams) => all<T>(sql, params)[0] ?? null,
  };
}

export interface TestDatabase extends SqlDatabase {
  /** Raw database bytes, e.g. to reopen and simulate an app restart. */
  export(): Uint8Array;
}

export async function openTestDatabase(bytes?: Uint8Array): Promise<TestDatabase> {
  const SQL = await load();
  const db = new SQL.Database(bytes);
  db.exec('PRAGMA foreign_keys = ON;');
  const base = executor(db);
  let queue: Promise<unknown> = Promise.resolve();
  return {
    ...base,
    transaction: <T>(fn: (tx: SqlExecutor) => Promise<T>) => {
      const run = queue.then(async () => {
        db.exec('BEGIN IMMEDIATE');
        try {
          const result = await fn(base);
          db.exec('COMMIT');
          return result;
        } catch (e) {
          db.exec('ROLLBACK');
          throw e;
        }
      });
      queue = run.catch(() => undefined);
      return run;
    },
    close: async () => db.close(),
    export: () => db.export(),
  };
}
