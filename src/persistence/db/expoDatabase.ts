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

/** Opens the on-device database (app sandbox; private to AutoKeep). */
export async function openExpoDatabase(name = 'autokeep.db'): Promise<SqlDatabase> {
  const db = await SQLite.openDatabaseAsync(name);
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
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
    close: () => db.closeAsync(),
  };
}
