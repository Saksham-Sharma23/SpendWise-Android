import { migrate } from 'drizzle-orm/expo-sqlite/migrator';
import { File } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { db } from './client';
import { applyConnectionPragmas, closeConnection, enableForeignKeys, sqliteDb } from './connection';
import {
  SNAPSHOTS_DIR,
  UNREADABLE_DIR,
  appDir,
  databaseFile,
  databaseFiles,
  moveIfExists,
  quoteSql,
  sqlitePath,
  timestampForFile,
} from './files';
import { cleanUpLegacyEncryption, convertLegacyEncryptionIfNeeded, LegacyConversionError } from './legacyEncryption';
import {
  lastAppliedMillis,
  migrateWithForeignKeysOff,
  pendingMigrations,
  snapshotName,
  snapshotsToDelete,
  type JournalEntry,
  type MigrationConnection,
} from './migrate';
import migrations from './migrations/migrations';
import { purgeExpired } from './retention';
import { seedIfNeeded } from './seed';

/**
 * The launch sequence, as one function that returns a typed outcome.
 *
 *   1. Make sure the file reads as SQLite (converting a legacy SQLCipher file once).
 *   2. Pragmas (WAL, synchronous, busy timeout).
 *   3. If a migration is pending on a non-empty database: integrity check,
 *      then `VACUUM INTO` a snapshot, keeping the newest two.
 *   4. Migrate with foreign keys OFF (see db/migrate.ts for why), check, turn them on.
 *   5. Seed.
 *   6. Purge soft-deleted rows past their retention window (db/retention.ts).
 *
 * Every failure path leaves the original file where it was, or moved aside
 * intact. Step 6 is the only step that removes anything, and only rows the
 * user deleted themselves more than RETENTION_DAYS ago — which Settings →
 * Recently deleted shows them, with the date, before it happens.
 */

export type BootOutcome =
  | { kind: 'ready'; convertedLegacy: boolean; snapshot: string | null }
  | { kind: 'unreadable'; message: string }
  | { kind: 'migration-failed'; message: string; snapshot: string | null }
  | { kind: 'failed'; message: string };

const conn: MigrationConnection = {
  exec: (sql) => sqliteDb.execSync(sql),
  all: <T>(sql: string) => sqliteDb.getAllSync(sql) as T[],
};

const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

function hasUserData(): boolean {
  const table = sqliteDb.getFirstSync<{ n: number }>(
    "SELECT count(*) AS n FROM sqlite_master WHERE type = 'table' AND name = 'transactions'",
  );
  if (!table?.n) return false;
  const rows = sqliteDb.getFirstSync<{ n: number }>('SELECT count(*) AS n FROM (SELECT 1 FROM transactions LIMIT 1)');
  return (rows?.n ?? 0) > 0;
}

/** VACUUM INTO a consistent single-file copy (no WAL needed), then prune to the newest two. */
function snapshotBeforeMigrating(pending: JournalEntry[]): string {
  const dir = appDir(SNAPSHOTS_DIR);
  const latest = pending[pending.length - 1]!;
  const target = new File(dir, snapshotName(latest.idx, new Date()));
  sqliteDb.execSync(`VACUUM INTO ${quoteSql(sqlitePath(target))}`);
  const names = dir.list().filter((e): e is File => e instanceof File).map((f) => f.name);
  for (const name of snapshotsToDelete(names, 2)) new File(dir, name).delete();
  return target.uri;
}

export async function bootDatabase(): Promise<BootOutcome> {
  // 1. Readable?
  let convertedLegacy = false;
  try {
    const check = await convertLegacyEncryptionIfNeeded();
    if (check === 'unreadable') {
      return {
        kind: 'unreadable',
        message: 'This file is not a database SpendWise can open. It may be damaged, or encrypted by an older version.',
      };
    }
    convertedLegacy = check === 'converted';
  } catch (e) {
    return {
      kind: 'unreadable',
      message: e instanceof LegacyConversionError ? e.message : `Could not open your data: ${messageOf(e)}`,
    };
  }

  // 2. Pragmas.
  try {
    applyConnectionPragmas();
  } catch (e) {
    return { kind: 'failed', message: `Could not configure the database: ${messageOf(e)}` };
  }

  // 3. Pending migrations → check integrity and snapshot first.
  let snapshot: string | null = null;
  const pending = pendingMigrations(migrations.journal.entries as JournalEntry[], lastAppliedMillis(conn));
  if (pending.length > 0 && hasUserData()) {
    const check = sqliteDb.getFirstSync<{ quick_check: string }>('PRAGMA quick_check(1)');
    if (check?.quick_check !== 'ok') {
      return { kind: 'unreadable', message: `The database failed an integrity check (${check?.quick_check ?? 'no result'}).` };
    }
    try {
      snapshot = snapshotBeforeMigrating(pending);
    } catch (e) {
      // Without a snapshot, do not migrate: the migration could be the thing that breaks.
      return { kind: 'failed', message: `Could not make a safety copy before updating your data: ${messageOf(e)}` };
    }
  }

  // 4. Migrate.
  try {
    if (pending.length > 0) {
      await migrateWithForeignKeysOff(conn, () => migrate(db, migrations));
    } else {
      enableForeignKeys();
    }
  } catch (e) {
    return { kind: 'migration-failed', message: messageOf(e), snapshot };
  }

  // 5. Seed.
  try {
    seedIfNeeded();
  } catch (e) {
    return { kind: 'failed', message: `Could not prepare the built-in categories: ${messageOf(e)}` };
  }

  // 6. Drop soft-deleted rows past their retention window. Deliberately after
  //    the snapshot and the migration, and deliberately not fatal: failing to
  //    tidy up is never a reason to refuse to open someone's data.
  try {
    const purged = purgeExpired(db);
    if (__DEV__ && purged > 0) console.log(`[boot] purged ${purged} expired deleted transactions`);
  } catch (e) {
    if (__DEV__) console.warn('[boot] could not purge expired deletions', e);
  }

  // A previous launch converted a legacy database and this one booted cleanly: drop the kept original.
  if (!convertedLegacy) {
    void cleanUpLegacyEncryption();
  }

  return { kind: 'ready', convertedLegacy, snapshot };
}

// ---------------------------------------------------------------------------
// Recovery actions for the boot-failure screen
// ---------------------------------------------------------------------------

/** Share a copy of the database file (or a snapshot) through the Android share sheet. */
export async function shareDatabaseCopy(sourceUri?: string): Promise<void> {
  const source = sourceUri ? new File(sourceUri) : databaseFile();
  if (!source.exists) throw new Error('There is no database file to share.');
  const copy = new File(appDir(UNREADABLE_DIR), `spendwise-share-${timestampForFile()}.db`);
  source.copySync(copy);
  await Sharing.shareAsync(copy.uri, { mimeType: 'application/x-sqlite3', dialogTitle: 'Save a copy of your SpendWise data' });
}

/**
 * Move the current database aside (never delete it) so the next boot starts
 * from an empty install. Caller re-runs `bootDatabase()` afterwards.
 */
export function moveDatabaseAside(): string {
  closeConnection();
  const dir = appDir(UNREADABLE_DIR);
  const stamp = timestampForFile();
  const [main, wal, shm] = databaseFiles();
  const target = new File(dir, `spendwise-unreadable-${stamp}.db`);
  moveIfExists(main!, target);
  moveIfExists(wal!, new File(dir, `spendwise-unreadable-${stamp}.db-wal`));
  moveIfExists(shm!, new File(dir, `spendwise-unreadable-${stamp}.db-shm`));
  return target.uri;
}
