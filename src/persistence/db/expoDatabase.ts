import * as SQLite from 'expo-sqlite';

import type { SqlDatabase, SqlExecutor, SqlParams } from './types';

type ExpoExecutor = Pick<
  SQLite.SQLiteDatabase,
  'execAsync' | 'runAsync' | 'getAllAsync' | 'getFirstAsync'
>;

function wrap(db: ExpoExecutor): SqlExecutor {
  return {
    exec: (sql) => db.execAsync(sql),
    run: async (sql, params: SqlParams = []) => {
      const r = await db.runAsync(sql, [...params]);
      return { changes: r.changes };
    },
    all: <T>(sql: string, params: SqlParams = []) => db.getAllAsync<T>(sql, [...params]),
    first: <T>(sql: string, params: SqlParams = []) => db.getFirstAsync<T>(sql, [...params]),
  };
}

async function openNative(name: string): Promise<SQLite.SQLiteDatabase> {
  const init = async (db: SQLite.SQLiteDatabase) => {
    await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
    return db;
  };
  try {
    return await init(await SQLite.openDatabaseAsync(name));
  } catch {
    // A reload within the same process can hand back a stale shared native handle
    // (device-verified: NullPointerException in execAsync). Open a fresh connection instead.
    return init(await SQLite.openDatabaseAsync(name, { useNewConnection: true }));
  }
}

const connections = new Map<string, Promise<SqlDatabase>>();

/**
 * Opens the on-device database (app sandbox; private to AutoKeep). One connection per database
 * per JS runtime: remounting the data layer reuses it instead of opening another handle.
 */
export function openExpoDatabase(name = 'autokeep.db'): Promise<SqlDatabase> {
  let p = connections.get(name);
  if (!p) {
    p = createDatabase(name);
    connections.set(name, p);
    // A failed open is not cached, so "retry" really retries.
    p.catch(() => connections.delete(name));
  }
  return p;
}

async function createDatabase(name: string): Promise<SqlDatabase> {
  const db = await openNative(name);
  const base = wrap(db);
  let queue: Promise<unknown> = Promise.resolve();
  return {
    ...base,
    transaction: <T>(fn: (tx: SqlExecutor) => Promise<T>) => {
      const run = queue.then(async () => {
        let result!: T;
        await db.withExclusiveTransactionAsync(async (txn) => {
          result = await fn(wrap(txn));
        });
        return result;
      });
      queue = run.catch(() => undefined);
      return run;
    },
    close: async () => {
      connections.delete(name);
      await db.closeAsync();
    },
  };
}
