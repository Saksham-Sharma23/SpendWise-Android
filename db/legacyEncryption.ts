import * as SecureStore from 'expo-secure-store';
import { File } from 'expo-file-system';

import { closeConnection, openConnection } from './connection';
import {
  LEGACY_DIR,
  appDir,
  databaseFile,
  deleteIfExists,
  moveIfExists,
  quoteSql,
  sqlitePath,
  timestampForFile,
} from './files';

/**
 * One-time conversion of a database that an earlier build SQLCipher-encrypted
 * with a Keystore-held key (decision F0-1, 2026-09-14: the main database is
 * now unkeyed so Android auto-backup can restore it on another phone).
 *
 * Flow, all before migrations run:
 *   1. Open unkeyed. If `sqlite_master` reads, there is nothing to convert.
 *   2. Otherwise read the old key from SecureStore. No key → the file is
 *      genuinely unreadable (boot shows the recovery screen).
 *   3. Reopen with the key, `sqlcipher_export` into a plain file, and compare
 *      the row count of every table before trusting it.
 *   4. Swap: the encrypted original moves to files/legacy/ (kept), the plain
 *      copy becomes spendwise.db.
 *   5. On the NEXT successful launch, `cleanUpLegacyEncryption` deletes the
 *      kept original and the SecureStore key. Until then both remain, so a
 *      conversion that later turns out wrong is recoverable.
 *
 * Remove this module (and expo-secure-store) once no installed build can
 * still hold an encrypted database — tracked in TASKS2 F1 batch 1B.
 */

const LEGACY_KEY_ALIAS = 'spendwise.db.key';

export class LegacyConversionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LegacyConversionError';
  }
}

export type LegacyCheck = 'plain' | 'converted' | 'unreadable';

function readsAsSqlite(): boolean {
  try {
    openConnection().getFirstSync('SELECT count(*) AS n FROM sqlite_master');
    return true;
  } catch {
    return false;
  }
}

async function legacyKey(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(LEGACY_KEY_ALIAS);
  } catch {
    // DecryptException: a key restored from another device's backup. Unusable.
    return null;
  }
}

function tableCounts(conn: ReturnType<typeof openConnection>, schemaName: 'main' | 'plaintext'): Map<string, number> {
  const tables = conn.getAllSync<{ name: string }>(
    `SELECT name FROM ${schemaName}.sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`,
  );
  const counts = new Map<string, number>();
  for (const { name } of tables) {
    const row = conn.getFirstSync<{ n: number }>(`SELECT count(*) AS n FROM ${schemaName}."${name.replace(/"/g, '""')}"`);
    counts.set(name, row?.n ?? 0);
  }
  return counts;
}

export async function convertLegacyEncryptionIfNeeded(): Promise<LegacyCheck> {
  if (readsAsSqlite()) return 'plain';

  const key = await legacyKey();
  if (!key) return 'unreadable';

  const plain = databaseFile('.converting');
  deleteIfExists(plain);

  // A connection that failed an unkeyed read must not be reused for PRAGMA key.
  closeConnection();
  const conn = openConnection();
  try {
    conn.execSync(`PRAGMA key = ${quoteSql(key)}`);
    try {
      conn.getFirstSync('SELECT count(*) AS n FROM sqlite_master');
    } catch {
      return 'unreadable'; // the stored key does not open this file
    }
    conn.execSync(`ATTACH DATABASE ${quoteSql(sqlitePath(plain))} AS plaintext KEY ''`);
    try {
      conn.getFirstSync(`SELECT sqlcipher_export('plaintext')`);
      const before = tableCounts(conn, 'main');
      const after = tableCounts(conn, 'plaintext');
      for (const [table, n] of before) {
        if (after.get(table) !== n) {
          throw new LegacyConversionError(`Conversion check failed: ${table} has ${n} rows but the copy has ${after.get(table) ?? 0}`);
        }
      }
    } finally {
      conn.execSync('DETACH DATABASE plaintext');
    }
  } catch (e) {
    closeConnection();
    deleteIfExists(plain);
    throw e instanceof LegacyConversionError ? e : new LegacyConversionError(e instanceof Error ? e.message : String(e));
  }
  closeConnection();

  // Swap. If the plain copy fails to move in, put the original back.
  const stamp = timestampForFile();
  const legacy = appDir(LEGACY_DIR);
  const kept = new File(legacy, `spendwise-encrypted-${stamp}.db`);
  moveIfExists(databaseFile(), kept);
  moveIfExists(databaseFile('-wal'), new File(legacy, `spendwise-encrypted-${stamp}.db-wal`));
  moveIfExists(databaseFile('-shm'), new File(legacy, `spendwise-encrypted-${stamp}.db-shm`));
  try {
    plain.moveSync(databaseFile());
  } catch (e) {
    moveIfExists(kept, databaseFile());
    throw new LegacyConversionError(`Could not put the converted database in place: ${e instanceof Error ? e.message : String(e)}`);
  }

  if (!readsAsSqlite()) {
    closeConnection();
    moveIfExists(databaseFile(), databaseFile('.failed-conversion'));
    moveIfExists(kept, databaseFile());
    throw new LegacyConversionError('The converted database could not be opened; the original was restored.');
  }
  return 'converted';
}

/** Delete kept encrypted originals and the old key. Call only after a launch that booted successfully. */
export async function cleanUpLegacyEncryption(): Promise<void> {
  const legacy = appDir(LEGACY_DIR);
  for (const entry of legacy.list()) {
    if (entry instanceof File) entry.delete();
  }
  try {
    await SecureStore.deleteItemAsync(LEGACY_KEY_ALIAS);
  } catch {
    // Nothing stored, or unreadable on this device: either way there is nothing to keep.
  }
}
