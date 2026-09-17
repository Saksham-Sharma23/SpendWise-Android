import { Directory, File, Paths } from 'expo-file-system';

import { DATABASE_NAME } from './connection';

/**
 * Where the database and its side files live.
 *
 *   files/SQLite/spendwise.db   the live database (expo-sqlite's default directory)
 *   files/snapshots/            pre-migration copies           — excluded from auto-backup
 *   files/legacy/               encrypted originals after the  — excluded from auto-backup
 *                               one-time SQLCipher conversion
 *   files/unreadable/           databases moved aside by       — excluded from auto-backup
 *                               "Start fresh"
 *
 * The exclusions live in plugins/withBackupRules.js. Keep the two in step.
 */

export const SNAPSHOTS_DIR = 'snapshots';
export const LEGACY_DIR = 'legacy';
export const UNREADABLE_DIR = 'unreadable';

export function sqliteDir(): Directory {
  return new Directory(Paths.document, 'SQLite');
}

export function databaseFile(suffix = ''): File {
  return new File(sqliteDir(), `${DATABASE_NAME}${suffix}`);
}

/** The database plus its WAL and shared-memory files. */
export function databaseFiles(): File[] {
  return ['', '-wal', '-shm'].map((s) => databaseFile(s));
}

export function appDir(name: string): Directory {
  const dir = new Directory(Paths.document, name);
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

/** A filesystem path SQLite accepts (no `file://` scheme, percent-decoded). */
export function sqlitePath(fileOrDir: File | Directory): string {
  return decodeURIComponent(fileOrDir.uri.replace(/^file:\/\//, '')).replace(/\/$/, '');
}

/** A SQL string literal. */
export function quoteSql(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

export function timestampForFile(at = new Date()): string {
  return at
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, '');
}

/** Move a file if it exists. Returns whether it did. */
export function moveIfExists(from: File, to: File): boolean {
  if (!from.exists) return false;
  if (to.exists) to.delete();
  from.moveSync(to);
  return true;
}

export function deleteIfExists(file: File): void {
  if (file.exists) file.delete();
}
