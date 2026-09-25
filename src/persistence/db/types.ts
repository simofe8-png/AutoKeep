/**
 * Minimal SQL port. The app uses expo-sqlite; tests use sql.js (real SQLite compiled to WASM), so
 * repository tests execute genuine SQL against the same schema.
 */
export type SqlValue = string | number | null;
export type SqlParams = readonly SqlValue[];

export interface SqlExecutor {
  exec(sql: string): Promise<void>;
  run(sql: string, params?: SqlParams): Promise<{ changes: number }>;
  all<T>(sql: string, params?: SqlParams): Promise<T[]>;
  first<T>(sql: string, params?: SqlParams): Promise<T | null>;
}

export interface SqlDatabase extends SqlExecutor {
  /**
   * Runs `fn` atomically. All statements inside must use the provided executor. Transactions are
   * serialized; if `fn` throws, everything is rolled back.
   */
  transaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}
