import { z } from 'zod';

import type { SqlDatabase, SqlValue } from '../db/types';
import { MIGRATIONS } from '../migrations';
import type { OriginalFileStore } from '@/providers/storage/types';

import { referencedFileKeys } from '../files';

import { decodeBase64, encodeBase64 } from './base64';

/**
 * User-controlled backup (local-first, ADR-0023). One self-contained file holds every table of
 * the local database, every stored original (documents and vehicle photos) and a manifest with
 * checksums. Nothing is sent anywhere by this module: the caller saves or shares the text where
 * the user chooses. Restore validates the whole file before touching anything, then replaces the
 * local data in one transaction; an invalid or incompatible file changes nothing.
 */

export const BACKUP_FORMAT = 'autokeep-backup';
export const BACKUP_FORMAT_VERSION = 1;

/** Settings key: when this device last produced a backup file (or restored one). */
export const LAST_BACKUP_SETTING = 'lastBackupAt';

/** Bookkeeping that never belongs in a backup. */
const EXCLUDED_TABLES = new Set(['schema_migrations']);

export interface BackupCrypto {
  /** Lower-case hex SHA-256 of the bytes. */
  sha256(bytes: Uint8Array): Promise<string>;
}

interface TableDump {
  columns: string[];
  rows: SqlValue[][];
}

interface FileEntry {
  key: string;
  size: number;
  sha256: string;
  data: string;
}

export interface BackupManifest {
  tableCounts: Record<string, number>;
  fileCount: number;
  /** Referenced originals that were not on the device when the backup was made. */
  missingFiles: string[];
  /** SHA-256 over the canonical form of the tables and the file list. */
  contentSha256: string;
}

const SqlValueSchema = z.union([z.string(), z.number(), z.null()]);

const BackupSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  formatVersion: z.number().int(),
  createdAt: z.string(),
  schemaVersion: z.number().int().positive(),
  tables: z.record(
    z.string(),
    z.object({ columns: z.array(z.string()), rows: z.array(z.array(SqlValueSchema)) }),
  ),
  files: z.array(
    z.object({
      key: z.string(),
      size: z.number().int().nonnegative(),
      sha256: z.string(),
      data: z.string(),
    }),
  ),
  manifest: z.object({
    tableCounts: z.record(z.string(), z.number().int().nonnegative()),
    fileCount: z.number().int().nonnegative(),
    missingFiles: z.array(z.string()),
    contentSha256: z.string(),
  }),
});

type BackupFile = z.infer<typeof BackupSchema>;

export type RestoreFailure =
  /** Not JSON / not an AutoKeep backup at all. */
  | 'not_backup'
  /** A backup format this app does not read. */
  | 'unsupported_version'
  /** Made by a newer app (database schema ahead of this app). */
  | 'newer_app'
  /** Tables or columns this app's database does not have. */
  | 'incompatible'
  /** Checksums do not match: the file was damaged or altered. */
  | 'corrupted'
  /** Writing failed; the previous data was kept. */
  | 'write_failed';

export type RestoreResult =
  | { ok: true; createdAt: string; vehicles: number; files: number; missingFiles: number }
  | { ok: false; reason: RestoreFailure };

const isSafeIdent = (s: string) => /^[a-z_][a-z0-9_]*$/i.test(s);
const isSafeKey = (k: string) => /^[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+$/.test(k) && !k.includes('..');

async function userTables(db: SqlDatabase): Promise<string[]> {
  const rows = await db.all<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
  );
  return rows.map((r) => r.name).filter((n) => !EXCLUDED_TABLES.has(n));
}

async function columnsOf(db: SqlDatabase, table: string): Promise<string[]> {
  const rows = await db.all<{ name: string }>(`PRAGMA table_info(${table})`);
  return rows.map((r) => r.name);
}

const utf8 = (s: string) => new TextEncoder().encode(s);

function canonical(
  schemaVersion: number,
  tables: Record<string, TableDump>,
  files: Pick<FileEntry, 'key' | 'size' | 'sha256'>[],
) {
  return JSON.stringify([
    schemaVersion,
    Object.keys(tables)
      .sort()
      .map((t) => [t, tables[t].columns, tables[t].rows]),
    [...files].sort((a, b) => (a.key < b.key ? -1 : 1)).map((f) => [f.key, f.size, f.sha256]),
  ]);
}

/** Builds the backup file's text from the current local data. Read-only. */
export async function createBackup(
  db: SqlDatabase,
  files: OriginalFileStore,
  crypto: BackupCrypto,
  now: string,
): Promise<{ text: string; manifest: BackupManifest }> {
  const tables: Record<string, TableDump> = {};
  for (const t of await userTables(db)) {
    const columns = await columnsOf(db, t);
    const objs = await db.all<Record<string, SqlValue>>(`SELECT * FROM ${t}`);
    tables[t] = { columns, rows: objs.map((o) => columns.map((c) => o[c] ?? null)) };
  }
  const schema = await db.first<{ v: number | null }>(
    'SELECT MAX(version) AS v FROM schema_migrations',
  );
  const schemaVersion = schema?.v ?? MIGRATIONS.length;

  const entries: FileEntry[] = [];
  const missingFiles: string[] = [];
  for (const key of await referencedFileKeys(db)) {
    const bytes = await files.readBytes(key).catch(() => null);
    if (!bytes || bytes.length === 0) {
      missingFiles.push(key);
      continue;
    }
    entries.push({
      key,
      size: bytes.length,
      sha256: await crypto.sha256(bytes),
      data: encodeBase64(bytes),
    });
  }

  const manifest: BackupManifest = {
    tableCounts: Object.fromEntries(Object.entries(tables).map(([t, d]) => [t, d.rows.length])),
    fileCount: entries.length,
    missingFiles,
    contentSha256: await crypto.sha256(utf8(canonical(schemaVersion, tables, entries))),
  };
  const backup: BackupFile = {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    createdAt: now,
    schemaVersion,
    tables,
    files: entries,
    manifest,
  };
  return { text: JSON.stringify(backup), manifest };
}

interface Validated {
  backup: BackupFile;
  decoded: Map<string, Uint8Array>;
}

/** Validates a backup completely (format, version, schema, checksums) without writing anything. */
export async function validateBackup(
  db: SqlDatabase,
  text: string,
  crypto: BackupCrypto,
): Promise<{ ok: true; value: Validated } | { ok: false; reason: RestoreFailure }> {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'not_backup' };
  }
  if ((json as { format?: unknown } | null)?.format !== BACKUP_FORMAT) {
    return { ok: false, reason: 'not_backup' };
  }
  if ((json as { formatVersion?: unknown }).formatVersion !== BACKUP_FORMAT_VERSION) {
    return { ok: false, reason: 'unsupported_version' };
  }
  const parsed = BackupSchema.safeParse(json);
  if (!parsed.success) return { ok: false, reason: 'corrupted' };
  const backup = parsed.data;

  if (backup.schemaVersion > MIGRATIONS.length) return { ok: false, reason: 'newer_app' };

  // Every table and column must exist here (older backups may lack newer ones: they stay empty).
  const known = new Set(await userTables(db));
  for (const [t, dump] of Object.entries(backup.tables)) {
    if (!isSafeIdent(t) || !known.has(t)) return { ok: false, reason: 'incompatible' };
    const cols = new Set(await columnsOf(db, t));
    if (dump.columns.some((c) => !isSafeIdent(c) || !cols.has(c))) {
      return { ok: false, reason: 'incompatible' };
    }
    if (dump.rows.some((r) => r.length !== dump.columns.length)) {
      return { ok: false, reason: 'corrupted' };
    }
    if (backup.manifest.tableCounts[t] !== dump.rows.length) {
      return { ok: false, reason: 'corrupted' };
    }
  }
  if (Object.keys(backup.manifest.tableCounts).length !== Object.keys(backup.tables).length) {
    return { ok: false, reason: 'corrupted' };
  }

  const content = await crypto.sha256(
    utf8(canonical(backup.schemaVersion, backup.tables, backup.files)),
  );
  if (content !== backup.manifest.contentSha256) return { ok: false, reason: 'corrupted' };
  if (backup.manifest.fileCount !== backup.files.length) return { ok: false, reason: 'corrupted' };

  const decoded = new Map<string, Uint8Array>();
  for (const f of backup.files) {
    if (!isSafeKey(f.key) || decoded.has(f.key)) return { ok: false, reason: 'corrupted' };
    const bytes = decodeBase64(f.data);
    if (!bytes || bytes.length !== f.size || (await crypto.sha256(bytes)) !== f.sha256) {
      return { ok: false, reason: 'corrupted' };
    }
    decoded.set(f.key, bytes);
  }
  return { ok: true, value: { backup, decoded } };
}

/**
 * Replaces all local data with a validated backup. Order: validate everything → write the
 * backup's files → replace every table in ONE transaction → only then remove files that are no
 * longer referenced. A failure before the commit removes the newly written files and leaves the
 * previous data exactly as it was.
 */
export async function restoreBackup(
  db: SqlDatabase,
  files: OriginalFileStore,
  text: string,
  crypto: BackupCrypto,
  now: string,
): Promise<RestoreResult> {
  const v = await validateBackup(db, text, crypto);
  if (!v.ok) return v;
  const { backup, decoded } = v.value;

  const before = new Set(await referencedFileKeys(db));
  const written: string[] = [];
  try {
    // Files the current data still uses are never overwritten before the commit.
    for (const [key, bytes] of decoded) {
      if (before.has(key)) continue;
      await files.writeBytes(key, bytes);
      written.push(key);
    }

    const tables = await userTables(db);
    await db.transaction(async (tx) => {
      // Foreign keys are checked at commit, so table order does not matter.
      await tx.exec('PRAGMA defer_foreign_keys = ON');
      for (const t of tables) await tx.run(`DELETE FROM ${t}`);
      for (const [t, dump] of Object.entries(backup.tables)) {
        if (dump.rows.length === 0) continue;
        const sql = `INSERT INTO ${t} (${dump.columns.join(', ')}) VALUES (${dump.columns
          .map(() => '?')
          .join(', ')})`;
        for (const row of dump.rows) await tx.run(sql, row);
      }
      await tx.run(
        `INSERT INTO settings (key, value_json, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`,
        [LAST_BACKUP_SETTING, JSON.stringify(backup.createdAt), now],
      );
    });
  } catch {
    for (const key of written) await files.remove(key).catch(() => undefined);
    return { ok: false, reason: 'write_failed' };
  }

  // Committed: shared keys now carry the backup's content, and unreferenced files go.
  const expected = new Map(backup.files.map((f) => [f.key, f.sha256]));
  for (const [key, bytes] of decoded) {
    if (!before.has(key)) continue;
    const current = await files.readBytes(key).catch(() => null);
    if (!current || (await crypto.sha256(current)) !== expected.get(key)) {
      await files.writeBytes(key, bytes).catch(() => undefined);
    }
  }
  const after = new Set(await referencedFileKeys(db));
  for (const key of before) {
    if (!after.has(key)) await files.remove(key).catch(() => undefined);
  }
  return {
    ok: true,
    createdAt: backup.createdAt,
    vehicles: backup.tables.vehicles?.rows.length ?? 0,
    files: backup.files.length,
    missingFiles: backup.manifest.missingFiles.length,
  };
}
