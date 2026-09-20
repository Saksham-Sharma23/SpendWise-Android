/**
 * Backup and restore (Phase 7) — the feature that makes a phone-only app
 * responsible rather than reckless.
 *
 * What lives where:
 *
 *   tables.ts    what a JSON backup contains, and the SQL that reads it out
 *                and puts it back. Pure; tested against real migrated schemas
 *   json.ts      the payload shape, and the import that fills an empty database
 *   validate.ts  every check a restore makes BEFORE it touches anything. Pure
 *   version.ts   migration index ↔ drizzle's timestamps. Pure
 *   export.ts    VACUUM INTO / sqlcipher_export / JSON → files/backups/ → share
 *   restore.ts   stage → validate → snapshot → swap → boot, with a way back
 *
 * Features import this index, never a file inside it.
 */

export {
  buildJsonPayload,
  currentMigrationIdx,
  exportDatabaseFile,
  exportJsonFile,
  formatOf,
  listBackups,
  pickBackupFile,
  pruneBackups,
  shareBackup,
  type BackupFileInfo,
  type BackupFormat,
  type BackupKind,
  type ExportResult,
} from './export';

export { applyRestore, discardRestore, prepareRestore, RestoreError } from './restore';
export type { RestorePlan, RestoreResult } from './restore';

export { backupsToDelete, describeSize, describeStamp, kindOf, stampOf } from './naming';

export { BACKUP_FORMAT_VERSION, type BackupPayload } from './json';
export { describeBackup, type Problem } from './validate';
