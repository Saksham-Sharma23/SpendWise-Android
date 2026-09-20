import { drizzle } from 'drizzle-orm/expo-sqlite';
import { migrate } from 'drizzle-orm/expo-sqlite/migrator';
import { File } from 'expo-file-system';
import * as SQLite from 'expo-sqlite';

import { bootDatabase, type BootOutcome } from '../boot';
import { closeConnection, sqliteDb } from '../connection';
import { hasPlainSqliteHeader } from '../encryptedCopy';
import {
  BACKUPS_DIR,
  appDir,
  databaseFiles,
  deleteIfExists,
  quoteSql,
  sqliteDir,
  sqlitePath,
  STAGING_DB_NAME,
  timestampForFile,
} from '../files';
import { type JournalEntry, type MigrationConnection, migrateWithForeignKeysOff } from '../migrate';
import migrations from '../migrations/migrations';
import { countRows, restoreJsonInto, type BackupWriter } from './json';
import type { BackupFileInfo } from './export';
import { failedRestoreName, preRestoreName, type BackupFormat } from './naming';
import { TABLE_SPECS, quoteId } from './tables';
import {
  checkMigrationIndex,
  compareCounts,
  describeBackup,
  fatal,
  isFatal,
  parseBackupJson,
  type Problem,
} from './validate';
import { appliedMigrationIdx, bundledMigrationIdx } from './version';

/**
 * Restoring a backup — the most destructive thing this app can do, and the
 * only one where getting it wrong is unrecoverable.
 *
 * THE CONTRACT: until `applyRestore` is called, the live database has not been
 * touched. Every check runs against a STAGING copy assembled beside it, so a
 * file that turns out to be the wrong one, truncated, encrypted with a
 * forgotten passphrase or written by a newer build costs nothing but the
 * staging file — which is deleted on the way out.
 *
 * And when the swap does happen, the database being replaced is copied first.
 * If the restored file then fails to boot, the copy goes straight back. The
 * worst realistic outcome is "nothing changed, here is why", never "both
 * copies are gone".
 *
 *   prepareRestore()   stage → validate → describe, touching nothing live
 *   applyRestore()     snapshot → close → swap → boot → roll back if it fails
 *   discardRestore()   delete the staging file
 */

export interface RestorePlan {
  /** What the file is, as the staging copy proved rather than as its name claimed. */
  format: BackupFormat;
  sourceUri: string;
  /** Row counts read out of the staged database. */
  counts: Record<string, number>;
  /** A sentence for the confirmation screen: "1,284 transactions · 6 budgets". */
  summary: string;
  /** The schema version in the file; below the bundled one it is migrated as it opens. */
  migrationIdx: number;
  /** Non-fatal things worth showing before someone agrees. */
  warnings: Problem[];
}

export class RestoreError extends Error {
  constructor(
    message: string,
    readonly problems: Problem[] = [],
  ) {
    super(message);
    this.name = 'RestoreError';
  }
}

function stagingFile(suffix = ''): File {
  return new File(sqliteDir(), `${STAGING_DB_NAME}${suffix}`);
}

/** Remove the staging database and its side files. Safe to call at any point. */
export function discardRestore(): void {
  for (const suffix of ['', '-wal', '-shm']) deleteIfExists(stagingFile(suffix));
}

function bundledIdx(): number {
  return bundledMigrationIdx(migrations.journal.entries as JournalEntry[]);
}

/**
 * Fold any write-ahead log back into the staged file and leave it without one.
 *
 * `applyRestore` moves ONE file into place. If the staged database still had a
 * `-wal` holding committed rows, moving the main file alone would leave those
 * rows behind — the exact failure mode the `.db` export uses `VACUUM INTO` to
 * avoid, arriving by the back door. Switching the journal mode to DELETE
 * checkpoints the log and removes it, so after this there is genuinely nothing
 * but the one file.
 */
function foldStagingWal(): void {
  const staging = SQLite.openDatabaseSync(STAGING_DB_NAME);
  try {
    staging.execSync('PRAGMA journal_mode = DELETE');
  } finally {
    staging.closeSync();
  }
}

/**
 * What a file actually IS, read from its first bytes rather than its name.
 *
 * A file that has been mailed, synced and downloaded again arrives called
 * anything at all — `backup (1)`, `spendwise.db.txt`, no extension. Guessing
 * from the name produces the worst kind of error message: a JSON backup
 * reported as "encrypted", sending someone to hunt for a passphrase that never
 * existed.
 */
function sniffFormat(file: File): BackupFormat {
  let head = '';
  try {
    const handle = file.open();
    try {
      head = String.fromCharCode(...handle.readBytes(16));
    } finally {
      handle.close();
    }
  } catch {
    // Unreadable head: let the SQLite path produce the real error.
    return 'db';
  }
  if (head.startsWith('SQLite format 3')) return 'db';
  // JSON may begin with whitespace, or a byte-order mark an editor added.
  if (/^[\s\uFEFF]*[[{]/.test(head)) return 'json';
  return 'encrypted-db';
}

// ---------------------------------------------------------------------------
// Staging
// ---------------------------------------------------------------------------

/**
 * Copy or decrypt the candidate into the staging slot.
 *
 * Everything here runs on the STAGING file's own connection, never the live
 * one. That is what lets a restore work from the boot-failure screen: the
 * database this app normally talks to may be the very thing that is broken,
 * and a recovery path that needs the broken database to work is not a
 * recovery path.
 *
 * For an encrypted file this is where a wrong passphrase is discovered.
 * SQLCipher accepts the ATTACH regardless and fails on the first READ, so
 * `sqlcipher_export` is the read that settles it. Its own message is about
 * page sizes and HMACs, which tells a person nothing, so it is replaced.
 */
function stageDatabaseFile(source: File, passphrase?: string): void {
  discardRestore();
  const target = stagingFile();

  if (passphrase) {
    // A fresh, unencrypted database at the staging path; the encrypted backup
    // is attached to IT and exported into its `main`. sqlcipher_export takes
    // (destination, source), so this decrypts src into the staging file.
    const staging = SQLite.openDatabaseSync(STAGING_DB_NAME);
    try {
      staging.execSync(`ATTACH DATABASE ${quoteSql(sqlitePath(source))} AS src KEY ${quoteSql(passphrase)}`);
      try {
        staging.getFirstSync(`SELECT sqlcipher_export('main', 'src')`);
      } finally {
        try {
          staging.execSync('DETACH DATABASE src');
        } catch {
          // The staging file is deleted on failure anyway.
        }
      }
    } catch {
      throw new RestoreError(
        'That passphrase does not open this backup. A backup cannot be opened without the passphrase it was made with.',
      );
    } finally {
      staging.closeSync();
    }
    return;
  }

  if (!hasPlainSqliteHeader(source)) {
    throw new RestoreError('This file is encrypted. Enter the passphrase it was made with to restore it.');
  }
  source.copySync(target);
}

/** Check the staged file on its OWN connection, so a broken live database cannot block a restore. */
function inspectStaged(): { problems: Problem[]; counts: Record<string, number>; migrationIdx: number | null } {
  const problems: Problem[] = [];
  const staging = SQLite.openDatabaseSync(STAGING_DB_NAME);
  try {
    const check = staging.getFirstSync<{ integrity_check: string }>('PRAGMA integrity_check(1)');
    if (check?.integrity_check !== 'ok') {
      problems.push(fatal(`This backup file is damaged (${check?.integrity_check ?? 'no result'}).`));
      return { problems, counts: {}, migrationIdx: null };
    }

    const tables = new Set(
      staging.getAllSync<{ name: string }>(`SELECT name FROM sqlite_master WHERE type = 'table'`).map((r) => r.name),
    );

    if (!tables.has('__drizzle_migrations')) {
      problems.push(fatal('This is a database, but not one SpendWise wrote: it has no version history.'));
      return { problems, counts: {}, migrationIdx: null };
    }
    if (!tables.has('transactions')) {
      problems.push(fatal('This is a database, but not a SpendWise backup: it has no ledger.'));
      return { problems, counts: {}, migrationIdx: null };
    }

    const applied = staging.getFirstSync<{ created_at: number | string | null }>(
      'SELECT created_at FROM __drizzle_migrations ORDER BY created_at DESC LIMIT 1',
    )?.created_at;
    const migrationIdx = appliedMigrationIdx(
      migrations.journal.entries as JournalEntry[],
      applied == null ? null : Number(applied),
    );

    const counts: Record<string, number> = {};
    for (const spec of TABLE_SPECS) {
      counts[spec.name] = tables.has(spec.name)
        ? (staging.getFirstSync<{ n: number }>(`SELECT count(*) AS n FROM ${quoteId(spec.name)}`)?.n ?? 0)
        : 0;
    }
    return { problems, counts, migrationIdx };
  } finally {
    staging.closeSync();
  }
}

/**
 * Build the staging database from a `.json` backup: migrate an empty file to
 * THIS build's schema, then insert the rows.
 *
 * This is why JSON survives a schema change. A `.db` file from an older build
 * is migrated forward after the swap; a JSON file is poured into a database
 * that is already current, so a column that moved between versions is a
 * mapping problem here rather than a migration problem later.
 */
async function stageJsonFile(text: string): Promise<{ problems: Problem[]; counts: Record<string, number> }> {
  const { payload, problems } = parseBackupJson(text);
  if (!payload || isFatal(problems)) return { problems, counts: {} };

  problems.push(...checkMigrationIndex(payload.schema_migration_idx, bundledIdx()));
  if (isFatal(problems)) return { problems, counts: {} };

  discardRestore();
  const staging = SQLite.openDatabaseSync(STAGING_DB_NAME);
  try {
    const stagingConn: MigrationConnection = {
      exec: (sql) => staging.execSync(sql),
      all: <T>(sql: string) => staging.getAllSync(sql) as T[],
    };
    // Same wrapper the app boots with: drizzle runs every migration in one
    // transaction, where PRAGMA foreign_keys=OFF is ignored (db/migrate.ts).
    // Awaited — the inserts below depend on the schema existing.
    await migrateWithForeignKeysOff(stagingConn, () => migrate(drizzle(staging), migrations));

    const writer: BackupWriter = {
      exec: (sql) => staging.execSync(sql),
      run: (sql, params = []) => void staging.runSync(sql, ...(params as SQLiteParam[])),
      all: <T>(sql: string, params: readonly unknown[] = []) =>
        staging.getAllSync(sql, ...(params as SQLiteParam[])) as T[],
    };
    restoreJsonInto(writer, payload);

    const counts = countRows(writer);
    problems.push(...compareCounts(payload.row_counts, counts));
    return { problems, counts };
  } catch (e) {
    problems.push(fatal(`This backup could not be rebuilt: ${e instanceof Error ? e.message : String(e)}`));
    return { problems, counts: {} };
  } finally {
    staging.closeSync();
  }
}

type SQLiteParam = string | number | null;

/**
 * Check a backup file and stage it, WITHOUT touching the live database.
 *
 * Throws `RestoreError` with the reasons on any fatal problem, having already
 * cleaned up the staging file — so a caller that shows the message and stops
 * has, by construction, changed nothing.
 */
export async function prepareRestore(sourceUri: string, passphrase?: string): Promise<RestorePlan> {
  const source = new File(sourceUri);
  if (!source.exists) throw new RestoreError('That backup file is no longer there.');

  // The name is a hint; the bytes are the answer. A `.json` name over SQLite
  // bytes is a renamed export, and restoring it as JSON would fail for a
  // reason nobody could act on.
  const format = sniffFormat(source);
  const warnings: Problem[] = [];

  try {
    if (format === 'json') {
      const { problems, counts } = await stageJsonFile(await source.text());
      if (isFatal(problems)) throw new RestoreError(problems.find((p) => p.severity === 'fatal')!.message, problems);
      warnings.push(...problems.filter((p) => p.severity === 'warning'));
      return {
        format,
        sourceUri,
        counts,
        summary: describeBackup(counts),
        migrationIdx: bundledIdx(),
        warnings,
      };
    }

    stageDatabaseFile(source, format === 'encrypted-db' ? (passphrase ?? '') : undefined);
    const { problems, counts, migrationIdx } = inspectStaged();
    problems.push(...checkMigrationIndex(migrationIdx, bundledIdx()));
    if (isFatal(problems)) throw new RestoreError(problems.find((p) => p.severity === 'fatal')!.message, problems);
    warnings.push(...problems.filter((p) => p.severity === 'warning'));

    return {
      format,
      sourceUri,
      counts,
      summary: describeBackup(counts),
      migrationIdx: migrationIdx ?? bundledIdx(),
      warnings,
    };
  } catch (e) {
    discardRestore();
    throw e instanceof RestoreError ? e : new RestoreError(e instanceof Error ? e.message : String(e));
  }
}

// ---------------------------------------------------------------------------
// The swap
// ---------------------------------------------------------------------------

export interface RestoreResult {
  boot: BootOutcome;
  /** The copy of the database that was replaced. Kept, and listed alongside the exports. */
  replacedCopy: string;
  counts: Record<string, number>;
}

/**
 * Copy the live database somewhere safe, then put the staged one in its place.
 *
 * The order matters, and every step is the conservative one:
 *
 *   1. VACUUM INTO a complete copy of what is about to be replaced. Not a file
 *      copy — the WAL would be left behind. If this fails, nothing else runs:
 *      a restore without a way back is not worth its convenience.
 *   2. Close BOTH connections (db/connection.ts reopens on next use) and drop
 *      the WAL and shared-memory files, which belong to the old database and
 *      would corrupt the new one.
 *   3. Move the staged file into place.
 *   4. Boot it. A file can pass every check and still fail to open — an older
 *      schema whose migration fails on this data, most plausibly — so a bad
 *      outcome here puts the copy from step 1 back and boots that instead.
 */
export interface ApplyOptions {
  /**
   * Set when restoring from the boot-failure screen, where the database being
   * replaced is the one that would not open.
   *
   * It changes two judgements. The safety copy falls back to MOVING the broken
   * files aside when `VACUUM INTO` cannot read them — a vacuum failure is a
   * reason to stop when the app is healthy and exactly what is expected when
   * it is not. And a restored file that still will not boot is NOT rolled
   * back, because rolling back would reinstate a database that was already
   * failing; both files are kept and named instead.
   */
  recovery?: boolean;
}

export async function applyRestore(plan: RestorePlan, options: ApplyOptions = {}): Promise<RestoreResult> {
  const staged = stagingFile();
  if (!staged.exists) throw new RestoreError('The checked copy is gone. Choose the backup again.');
  const recovery = options.recovery ?? false;

  const dir = appDir(BACKUPS_DIR);
  const replaced = new File(dir, preRestoreName(timestampForFile()));
  deleteIfExists(replaced);

  let copied = false;
  try {
    sqliteDb.execSync(`VACUUM INTO ${quoteSql(sqlitePath(replaced))}`);
    copied = true;
  } catch (e) {
    if (!recovery) {
      discardRestore();
      throw new RestoreError(
        `Could not copy your current data before replacing it, so nothing was changed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
    // Recovery: SQLite cannot read the file, which is why we are here. Keep
    // the BYTES instead — they are the only remaining evidence of whatever
    // went wrong, and someone may yet recover rows from them by hand.
    deleteIfExists(replaced);
  }

  // One file from here on: anything still in the staged WAL is folded in now,
  // because only the main file is moved.
  foldStagingWal();

  closeConnection();
  const [main, wal, shm] = databaseFiles();

  if (!copied) {
    // Move rather than delete, and take the WAL with it: a torn database plus
    // its log is still the best chance of reading anything back out.
    if (main!.exists) main!.moveSync(replaced);
    if (wal!.exists) wal!.moveSync(new File(dir, `${replaced.name}-wal`));
  }
  deleteIfExists(wal!);
  deleteIfExists(shm!);
  deleteIfExists(main!);
  staged.moveSync(main!);
  for (const suffix of ['-wal', '-shm']) deleteIfExists(stagingFile(suffix));

  const boot = await bootDatabase();
  if (boot.kind !== 'ready') {
    const failed = new File(dir, failedRestoreName(timestampForFile()));
    deleteIfExists(failed);

    if (recovery) {
      // Nothing to go back to that was any better. Say so plainly and leave
      // both files where they can be found.
      throw new RestoreError(
        `That backup could not be opened either. Your previous data is kept as ${replaced.name}. (${boot.message})`,
      );
    }

    // Put back exactly what was there. The failed file is kept beside the
    // copy, named so it is obvious which is which, because it is the only
    // evidence of why this did not work.
    closeConnection();
    if (main!.exists) main!.moveSync(failed);
    deleteIfExists(wal!);
    deleteIfExists(shm!);
    replaced.copySync(main!);
    const back = await bootDatabase();
    throw new RestoreError(
      back.kind === 'ready'
        ? `That backup could not be opened, so your data was put back unchanged. (${boot.message})`
        : `That backup could not be opened, and neither could the copy of your data. Your data is safe in ${replaced.name}. (${boot.message})`,
    );
  }

  return { boot, replacedCopy: replaced.uri, counts: plan.counts };
}

export type { BackupFileInfo };
