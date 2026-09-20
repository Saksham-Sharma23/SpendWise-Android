import { countSql, exportSql, importSql, quoteId, rowKeys, TABLE_SPECS, type TableSpec } from './tables';

/**
 * The readable backup: every user row as JSON, keyed by uid.
 *
 * Why this exists alongside the `.db` export, which is byte-exact and cannot
 * disagree with itself: a `.db` file can only be restored by a build whose
 * schema it recognises. JSON survives the schema moving on. If a future
 * migration splits a column, this file can still be read — by a person, with
 * a text editor, if it comes to that — where a SQLite file from an
 * unrecognised schema version is refused (`validate.ts`).
 *
 * So the two are not redundant: `.db` is the fast, exact path for "same app,
 * new phone", and JSON is the one that still works in five years.
 *
 * The connection types are deliberately narrow rather than a Drizzle handle.
 * Reads go through expo-sqlite's ASYNC api on the phone, so a 50k-row export
 * runs on the native thread instead of freezing the screen; writes are
 * synchronous because a restore must be one transaction. Both shapes are
 * satisfied by better-sqlite3 in Jest, which is how this code is tested
 * against real migrated schemas (CLAUDE.md #18).
 */

/** Bumped only when the shape below changes incompatibly. `validate.ts` refuses anything newer. */
export const BACKUP_FORMAT_VERSION = 1;

export const BACKUP_APP_ID = 'spendwise-android';

export interface BackupReader {
  all<T>(sql: string, params?: readonly unknown[]): T[] | Promise<T[]>;
}

export interface BackupWriter {
  exec(sql: string): void;
  run(sql: string, params?: readonly unknown[]): void;
  all<T>(sql: string, params?: readonly unknown[]): T[];
}

export type BackupRow = Record<string, unknown>;

export interface BackupPayload {
  format_version: number;
  app: string;
  created_at: string;
  /**
   * The highest migration index the exporting build had applied. Restore
   * refuses a file from a NEWER schema than it knows how to read, because the
   * rows may carry columns this build would silently drop.
   */
  schema_migration_idx: number;
  /**
   * Row counts taken at export time, written beside the rows themselves.
   * Restore compares them with what it actually inserted; a mismatch means
   * the file was truncated or edited, and nothing is swapped in.
   */
  row_counts: Record<string, number>;
  tables: Record<string, BackupRow[]>;
}

async function readRows(reader: BackupReader, spec: TableSpec): Promise<BackupRow[]> {
  return await reader.all<BackupRow>(exportSql(spec));
}

/** Read the whole database out as a JSON payload. */
export async function buildBackupJson(
  reader: BackupReader,
  options: { schemaMigrationIdx: number; now?: Date },
): Promise<BackupPayload> {
  const tables: Record<string, BackupRow[]> = {};
  const rowCounts: Record<string, number> = {};

  for (const spec of TABLE_SPECS) {
    const rows = await readRows(reader, spec);
    tables[spec.name] = rows;
    rowCounts[spec.name] = rows.length;
  }

  return {
    format_version: BACKUP_FORMAT_VERSION,
    app: BACKUP_APP_ID,
    created_at: (options.now ?? new Date()).toISOString(),
    schema_migration_idx: options.schemaMigrationIdx,
    row_counts: rowCounts,
    tables,
  };
}

export interface RestoreCounts {
  /** Rows actually inserted, per table. */
  inserted: Record<string, number>;
}

/**
 * Write a payload into an EMPTY, already-migrated database.
 *
 * "Empty" is enforced rather than assumed: a migration may have seeded rows of
 * its own (migration 0008 inserts the `sys:self` person), and those would
 * collide with the same rows coming from the backup. Children are cleared
 * before parents so foreign keys never block the clear.
 *
 * Everything happens in ONE transaction with foreign keys ON. Either the whole
 * backup lands or the file is left untouched for the caller to delete — there
 * is no state in between, which is what lets `restore.ts` promise that a
 * failed restore changes nothing.
 */
export function restoreJsonInto(writer: BackupWriter, payload: BackupPayload): RestoreCounts {
  const inserted: Record<string, number> = {};

  writer.exec('PRAGMA foreign_keys = ON');
  writer.exec('BEGIN');
  try {
    for (const spec of [...TABLE_SPECS].reverse()) {
      writer.exec(`DELETE FROM ${quoteId(spec.name)}`);
    }

    for (const spec of TABLE_SPECS) {
      const rows = payload.tables[spec.name] ?? [];
      const keys = rowKeys(spec);
      const sql = importSql(spec);
      for (const row of rows) {
        writer.run(
          sql,
          keys.map((k) => normalise(row[k])),
        );
      }
      inserted[spec.name] = rows.length;
    }

    writer.exec('COMMIT');
    return { inserted };
  } catch (e) {
    try {
      writer.exec('ROLLBACK');
    } catch {
      // Already rolled back by the failing statement; the throw below is what matters.
    }
    throw e;
  }
}

/**
 * JSON has no integer/boolean distinction that SQLite cares about, but it does
 * have `undefined` (a key the file simply omits) and `true`/`false` from a
 * hand-edited file. Map them onto what the driver can bind.
 */
function normalise(value: unknown): string | number | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'number' || typeof value === 'string') return value;
  // An object or array in a scalar column: let the insert fail loudly rather
  // than stringifying something meaningless into the database.
  throw new Error(`A backup value is not a scalar: ${JSON.stringify(value)}`);
}

/** Row counts straight from the database, for comparing a restore with its payload. */
export function countRows(writer: BackupWriter): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const spec of TABLE_SPECS) {
    counts[spec.name] = writer.all<{ n: number }>(countSql(spec.name))[0]?.n ?? 0;
  }
  return counts;
}
