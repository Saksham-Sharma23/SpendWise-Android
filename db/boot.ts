import { migrate } from 'drizzle-orm/expo-sqlite/migrator';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { db } from './client';
import { applyConnectionPragmas, closeConnection, databaseReadable, enableForeignKeys, sqliteDb } from './connection';
import {
  SNAPSHOTS_DIR,
  UNREADABLE_DIR,
  appDir,
  databaseFiles,
  deleteIfExists,
  moveIfExists,
  quoteSql,
  sqlitePath,
  timestampForFile,
} from './files';
import {
  existingTables,
  ForeignKeyViolationError,
  integrityFailureRecorded,
  lastAppliedMillis,
  migrateWithForeignKeysOff,
  pendingMigrations,
  recheckIntegrity,
  SHARE_PREFIX,
  shareCopiesToDelete,
  snapshotName,
  snapshotsToDelete,
  userDataProbeSql,
  type JournalEntry,
  type MigrationConnection,
} from './migrate';
import migrations from './migrations/migrations';
import { purgeExpired } from './retention';
import { seedIfNeeded } from './seed';
import { record } from '@/lib/crashlog';

/**
 * The launch sequence, as one function that returns a typed outcome.
 *
 *   1. Make sure the file opens and reads as SQLite at all.
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
  | { kind: 'ready'; snapshot: string | null }
  | { kind: 'unreadable'; message: string }
  | { kind: 'migration-failed'; message: string; snapshot: string | null }
  | { kind: 'failed'; message: string };

const conn: MigrationConnection = {
  exec: (sql) => sqliteDb.execSync(sql),
  all: <T>(sql: string) => sqliteDb.getAllSync(sql) as T[],
};

const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Whether this database holds anything the user entered — in ANY feature, not
 * just the ledger (B13). Decides whether to snapshot before migrating.
 *
 * The table list and the SQL live in db/migrate.ts so they can be tested in
 * Node against real migrated schemas.
 */
function hasUserData(): boolean {
  const sql = userDataProbeSql(existingTables(conn));
  if (sql == null) return false;
  const row = sqliteDb.getFirstSync<{ has_data: number }>(sql);
  return (row?.has_data ?? 0) > 0;
}

/** VACUUM INTO a consistent single-file copy (no WAL needed), then prune to the newest two. */
function snapshotBeforeMigrating(pending: JournalEntry[]): string {
  const dir = appDir(SNAPSHOTS_DIR);
  const latest = pending[pending.length - 1]!;
  const target = new File(dir, snapshotName(latest.idx, new Date()));
  sqliteDb.execSync(`VACUUM INTO ${quoteSql(sqlitePath(target))}`);
  const names = dir
    .list()
    .filter((e): e is File => e instanceof File)
    .map((f) => f.name);
  for (const name of snapshotsToDelete(names, 2)) new File(dir, name).delete();
  return target.uri;
}

/**
 * Boot, and write a failure down before showing it.
 *
 * A boot failure is the one error the user definitely notices and the one we
 * have the least chance of reproducing: it happens before any screen exists,
 * on their data, on their phone. The failure screen shows a sentence; the log
 * keeps which step failed and what the underlying error said, so the person
 * sharing it hands over something diagnosable rather than a screenshot.
 */
export async function bootDatabase(): Promise<BootOutcome> {
  const outcome = await runBoot();
  if (outcome.kind !== 'ready') {
    const e = new Error(`${outcome.kind}: ${outcome.message}`);
    e.name = 'BootFailure';
    // No stack: it would point at this wrapper, not at the step that failed,
    // and `outcome.kind` already names the step.
    e.stack = undefined;
    record(e, 'fatal');
  }
  return outcome;
}

async function runBoot(): Promise<BootOutcome> {
  // 1. Readable?
  if (!databaseReadable()) {
    return {
      kind: 'unreadable',
      message: 'This file is not a database SpendWise can open. It may be damaged, or encrypted by an older version.',
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
      return {
        kind: 'unreadable',
        message: `The database failed an integrity check (${check?.quick_check ?? 'no result'}).`,
      };
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

  // 4b. A previous launch recorded broken references (B8).
  //
  // The check that finds them can only run AFTER drizzle has committed, so
  // this state outlives the launch that produced it. Before the flag existed
  // the failure screen appeared once and every later launch — finding nothing
  // pending — opened straight onto the damaged data.
  if (integrityFailureRecorded(conn)) {
    const remaining = recheckIntegrity(conn);
    if (remaining > 0) {
      return {
        kind: 'migration-failed',
        message: new ForeignKeyViolationError(remaining).message,
        snapshot,
      };
    }
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

  // Copies shared from the failure screen have done their job once the app opens (B27).
  try {
    pruneShareCopies(0);
  } catch (e) {
    if (__DEV__) console.warn('[boot] could not remove old share copies', e);
  }

  return { kind: 'ready', snapshot };
}

// ---------------------------------------------------------------------------
// Recovery actions for the boot-failure screen
// ---------------------------------------------------------------------------

/**
 * Share a copy of the database (or a snapshot) through the Android share sheet.
 *
 * A snapshot is already one consistent file. The live database is not: after
 * a failed launch its latest commits can still be in `spendwise.db-wal`, which
 * a plain copy of `spendwise.db` leaves behind (B27). So the live database is
 * copied with `VACUUM INTO`, which reads through the WAL into one file, as the
 * snapshots are. Only when SQLite can't read the file at all is it copied
 * byte for byte — and then its WAL, if it holds anything, is shared straight
 * after, named to sit beside it.
 */
export async function shareDatabaseCopy(sourceUri?: string): Promise<void> {
  const dir = appDir(UNREADABLE_DIR);
  // Keep the previous copy: a receiving app may still be reading it.
  pruneShareCopies(1);
  const stamp = timestampForFile();
  const copy = new File(dir, `${SHARE_PREFIX}${stamp}.db`);
  deleteIfExists(copy);
  let wal: File | null = null;

  if (sourceUri) {
    const source = new File(sourceUri);
    if (!source.exists) throw new Error('There is no database file to share.');
    source.copySync(copy);
  } else {
    const [main, liveWal] = databaseFiles();
    if (!main!.exists) throw new Error('There is no database file to share.');
    try {
      sqliteDb.execSync(`VACUUM INTO ${quoteSql(sqlitePath(copy))}`);
    } catch {
      // Not readable as SQLite (the "unreadable" outcome): copy the bytes as they are.
      deleteIfExists(copy);
      main!.copySync(copy);
      if (liveWal!.exists && liveWal!.size > 0) {
        wal = new File(dir, `${SHARE_PREFIX}${stamp}.db-wal`);
        deleteIfExists(wal);
        liveWal!.copySync(wal);
      }
    }
  }

  await Sharing.shareAsync(copy.uri, {
    mimeType: 'application/x-sqlite3',
    dialogTitle: wal ? 'Save a copy of your SpendWise data (1 of 2)' : 'Save a copy of your SpendWise data',
  });
  if (wal) {
    await Sharing.shareAsync(wal.uri, {
      mimeType: 'application/octet-stream',
      dialogTitle: 'Save its latest changes too (2 of 2). Keep both files together',
    });
  }
}

/** Delete all but the newest `keep` share copies. Never creates the folder. */
function pruneShareCopies(keep: number): void {
  const dir = new Directory(Paths.document, UNREADABLE_DIR);
  if (!dir.exists) return;
  const names = dir
    .list()
    .filter((e): e is File => e instanceof File)
    .map((f) => f.name);
  for (const name of shareCopiesToDelete(names, keep)) new File(dir, name).delete();
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
