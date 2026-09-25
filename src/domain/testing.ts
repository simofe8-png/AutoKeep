import { timestamp, type Id, type IdGenerator, type Timestamp } from './core';

/** Deterministic UUIDv4-shaped ids for tests and fixtures. */
export function sequentialIds(start = 1): IdGenerator {
  let n = start;
  return {
    next<Tag extends string>() {
      const hex = (n++).toString(16).padStart(12, '0');
      return `00000000-0000-4000-8000-${hex}` as Id<Tag>;
    },
  };
}

export const T0: Timestamp = timestamp('2026-09-25T10:00:00.000Z');
