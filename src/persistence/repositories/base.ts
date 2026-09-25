import type { SqlDatabase, SqlExecutor } from '../db/types';

export type Executor = SqlDatabase | SqlExecutor;

/** Runs `fn` in a transaction when given a database, or inline when already inside one. */
export function atomic<T>(exec: Executor, fn: (tx: SqlExecutor) => Promise<T>): Promise<T> {
  return 'transaction' in exec ? exec.transaction(fn) : fn(exec);
}

/** Optimistic-concurrency failure: the row changed since it was read (sync-safe updates). */
export class ConcurrencyError extends Error {
  constructor(entity: string, id: string) {
    super(`${entity} ${id} was modified concurrently`);
  }
}

export class NotFoundError extends Error {}

export const toJson = (v: unknown): string => JSON.stringify(v ?? null);
export const fromJson = <T>(s: string | null): T =>
  s == null ? (null as T) : (JSON.parse(s) as T);
export const bool = (n: number): boolean => n === 1;
export const int = (b: boolean): number => (b ? 1 : 0);

/** Entity meta columns in insert order. */
export const META_COLUMNS = 'created_at, updated_at, version';
