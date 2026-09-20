import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { openReadConnection, sqliteDb } from '../connection';
import { writeEncryptedCopy } from '../encryptedCopy';
import { appDir, BACKUPS_DIR, deleteIfExists, quoteSql, sqlitePath, timestampForFile } from '../files';
import { lastAppliedMillis, type JournalEntry, type MigrationConnection } from '../migrate';
import migrations from '../migrations/migrations';
import { buildBackupJson, type BackupPayload, type BackupReader } from './json';
import {
  backupFileName,
  backupsToDelete,
  describeSize,
  describeStamp,
  formatOf,
  isBackupName,
  kindOf,
  safeName,
  stampOf,
  type BackupFormat,
  type BackupKind,
} from './naming';
import { appliedMigrationIdx, bundledMigrationIdx } from './version';

/**
 * Making a backup: the half that leaves the device.
 *
 * Three formats, one path through the share sheet:
 *
 *   .db       `VACUUM INTO` — a byte-exact copy of every table and index, in
 *             ONE file. Not a plain file copy: the newest writes can still be
 *             in `spendwise.db-wal`, and copying the main file alone would
 *             leave them behind. VACUUM reads through the WAL, so the result
 *             is complete and internally consistent even while the app runs.
 *   .enc.db   the same thing through SQLCipher (`db/encryptedCopy.ts`). This
 *             is the copy that leaves the phone, so it is the copy worth
 *             encrypting — and a forgotten passphrase means it is gone, which
 *             the UI says before it asks for one.
 *   .json     every row, keyed by uid (`db/backup/json.ts`). Readable, and
 *             restorable after the schema has moved on.
 *
 * Every export is also KEPT, in `files/backups/`. The share sheet is easy to
 * dismiss by accident, and someone who did that should not discover on a dead
 * phone that "export" meant "nothing". Kept copies are pruned to the newest
 * few, and excluded from Android auto-backup so they never eat the 25 MB quota.
 */

export const KEEP_BACKUPS = 3;

export interface BackupFileInfo {
  uri: string;
  name: string;
  /** Bytes on disk. */
  size: number;
  format: BackupFormat;
  kind: BackupKind;
  /** When the file was written, from its name; ISO-ish `20260920T171200`. */
  stamp: string;
}

export function backupsDir(): Directory {
  return appDir(BACKUPS_DIR);
}

/** Everything in `files/backups/`, newest first — exports and the copies a restore made. */
export function listBackups(): BackupFileInfo[] {
  const dir = new Directory(Paths.document, BACKUPS_DIR);
  if (!dir.exists) return [];
  return dir
    .list()
    .filter((e): e is File => e instanceof File)
    .flatMap((f) => {
      const format = formatOf(f.name);
      if (!format || !isBackupName(f.name)) return [];
      const kind = kindOf(f.name);
      return [{ uri: f.uri, name: f.name, size: f.size, format, kind, stamp: stampOf(f.name, kind) }];
    })
    .sort((a, b) => b.stamp.localeCompare(a.stamp));
}

/**
 * Keep the newest `keep` exports OF EACH FORMAT.
 *
 * Per format on purpose: someone who exports `.db` weekly should not lose
 * their one readable `.json` to three fresh `.db` files.
 */
export function pruneBackups(keep = KEEP_BACKUPS): number {
  const dir = new Directory(Paths.document, BACKUPS_DIR);
  if (!dir.exists) return 0;
  const names = dir
    .list()
    .filter((e): e is File => e instanceof File)
    .map((f) => f.name);
  const doomed = backupsToDelete(names, keep);
  for (const name of doomed) deleteIfExists(new File(dir, name));
  return doomed.length;
}

const conn: MigrationConnection = {
  exec: (sql) => sqliteDb.execSync(sql),
  all: <T>(sql: string) => sqliteDb.getAllSync(sql) as T[],
};

/** The migration index this database is at, for the header a restore checks. */
export function currentMigrationIdx(): number {
  const entries = migrations.journal.entries as JournalEntry[];
  return appliedMigrationIdx(entries, lastAppliedMillis(conn)) ?? bundledMigrationIdx(entries);
}

export interface ExportResult {
  file: BackupFileInfo;
  /** What went into it, for the confirmation line. */
  counts?: Record<string, number>;
}

/**
 * Write a `.db` export, encrypted when a passphrase is given.
 *
 * Synchronous: both `VACUUM INTO` and `sqlcipher_export` run on the JS thread.
 * On the 50k-row test database that is a fraction of a second, and it is a
 * deliberate button press rather than something happening during a scroll.
 */
export function exportDatabaseFile(passphrase?: string): ExportResult {
  const dir = backupsDir();
  const format: BackupFormat = passphrase ? 'encrypted-db' : 'db';
  const target = new File(dir, backupFileName(format, timestampForFile()));
  deleteIfExists(target);

  if (passphrase) {
    writeEncryptedCopy(target, passphrase);
  } else {
    // Fold the WAL in first so VACUUM has the least to reach through, then
    // copy. VACUUM INTO refuses to overwrite, hence the delete above.
    try {
      sqliteDb.execSync('PRAGMA wal_checkpoint(TRUNCATE)');
    } catch {
      // A busy reader only means VACUUM reads through the WAL instead.
    }
    sqliteDb.execSync(`VACUUM INTO ${quoteSql(sqlitePath(target))}`);
  }

  pruneBackups();
  return { file: describe(target, format) };
}

/** The async reader: a JSON export of 50k rows runs on expo-sqlite's native thread, not the JS one. */
const reader: BackupReader = {
  all: <T>(sql: string, params: readonly unknown[] = []) =>
    openReadConnection().getAllAsync(sql, ...(params as SQLiteParam[])) as Promise<T[]>,
};

type SQLiteParam = string | number | null;

/** Build the JSON payload without writing it, for the dev harness and tests. */
export async function buildJsonPayload(): Promise<BackupPayload> {
  return buildBackupJson(reader, { schemaMigrationIdx: currentMigrationIdx() });
}

export async function exportJsonFile(): Promise<ExportResult> {
  const payload = await buildJsonPayload();
  const dir = backupsDir();
  const target = new File(dir, backupFileName('json', timestampForFile()));
  deleteIfExists(target);
  // Two-space indent: this format's whole reason for existing is that a person
  // can open it. A 50k-row ledger is around 20 MB either way.
  target.write(JSON.stringify(payload, null, 2));
  pruneBackups();
  return { file: describe(target, 'json'), counts: payload.row_counts };
}

function describe(file: File, format: BackupFormat): BackupFileInfo {
  const kind = kindOf(file.name);
  return { uri: file.uri, name: file.name, size: file.size, format, kind, stamp: stampOf(file.name, kind) };
}

export { describeSize, describeStamp, formatOf, type BackupFormat, type BackupKind };

const MIME: Record<BackupFormat, string> = {
  db: 'application/x-sqlite3',
  'encrypted-db': 'application/octet-stream',
  json: 'application/json',
};

/**
 * Let someone choose a backup from anywhere on the phone — a cloud drive, the
 * Downloads folder, wherever they put it.
 *
 * This is what makes the drill in TASKS.md possible at all: after an
 * uninstall, `files/backups/` is gone with the app, so the only copy left is
 * the one that was shared out. Android hands it back as a `content://` URI
 * through the Storage Access Framework, which is not a real file path — SQLite
 * cannot open it and `ATTACH` cannot read it. So the first thing that happens
 * is a copy into the app's own cache, and everything downstream works on that.
 *
 * `expo-file-system` provides the picker, so this costs no new native module
 * and no rebuild.
 */
export async function pickBackupFile(): Promise<BackupFileInfo | null> {
  const picked = await File.pickFileAsync({
    // Android's SAF filters by MIME type, and a `.db` file usually has none
    // that matches, so the list stays wide rather than hiding the very file
    // someone is looking for.
    mimeTypes: ['application/json', 'application/x-sqlite3', 'application/octet-stream', '*/*'],
  });
  if (picked.canceled || !picked.result) return null;

  const source = picked.result;
  const name = safeName(source.name, timestampForFile());
  const target = new File(Paths.cache, name);
  deleteIfExists(target);
  try {
    source.copySync(target);
  } catch {
    // A SAF document that refuses a direct copy still reads as bytes.
    target.write(await source.bytes());
  }
  return describe(target, formatOf(name) ?? 'db');
}

/**
 * Hand the file to the share sheet — the only way data leaves this app, and
 * the only reason a backup survives losing the phone.
 */
export async function shareBackup(file: BackupFileInfo): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('This phone has nothing to share files with. The backup is saved in the app.');
  }
  await Sharing.shareAsync(file.uri, {
    mimeType: MIME[file.format],
    dialogTitle: 'Save your SpendWise backup somewhere safe',
  });
}
