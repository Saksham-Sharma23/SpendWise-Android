import * as SQLite from 'expo-sqlite';

export const DATABASE_NAME = 'spendwise.db';

/**
 * The one SQLite connection, behind a handle that can be closed and reopened.
 *
 * Every module imports `sqliteDb` (and `db`, built on it) once at load time,
 * so the handle itself can never change identity. But boot needs to close the
 * file and reopen it — to move an unreadable database aside ("Start fresh"),
 * and to swap in the converted file when a legacy SQLCipher database is
 * decrypted. `sqliteDb` is therefore a forwarding proxy over whichever
 * connection is currently open, and reopening is invisible to its users.
 *
 * `enableChangeListener: true` feeds lib/db/changeHub: every write reports
 * its table, and live queries re-run from that.
 */

let current: SQLite.SQLiteDatabase | null = null;

export function openConnection(): SQLite.SQLiteDatabase {
  if (!current) {
    current = SQLite.openDatabaseSync(DATABASE_NAME, { enableChangeListener: true });
  }
  return current;
}

const beforeCloseHooks = new Set<() => void>();

/**
 * Run `hook` just before the connection closes — e.g. db/read.ts finalizes its
 * cached prepared statements, which belong to the connection being closed.
 */
export function onBeforeClose(hook: () => void): () => void {
  beforeCloseHooks.add(hook);
  return () => beforeCloseHooks.delete(hook);
}

/** Close the connection. The next use of `sqliteDb` opens it again. */
export function closeConnection(): void {
  if (!current) return;
  for (const hook of beforeCloseHooks) {
    try {
      hook();
    } catch {
      // A hook must never prevent the close.
    }
  }
  try {
    current.closeSync();
  } finally {
    current = null;
  }
}

export const sqliteDb: SQLite.SQLiteDatabase = new Proxy({} as SQLite.SQLiteDatabase, {
  get(_target, prop) {
    const conn = openConnection();
    const value = Reflect.get(conn, prop, conn) as unknown;
    return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(conn) : value;
  },
});

/**
 * Pragmas for every (re)opened connection. Deliberately NO `PRAGMA key`:
 * since 2026-09-14 the main database is unkeyed (CLAUDE.md → Locked
 * Decisions amendment). SQLCipher without a key behaves exactly like SQLite.
 *
 * `foreign_keys` is NOT set here — boot turns it on only after migrations,
 * because a migration that rebuilds a parent table with FKs on would
 * cascade-delete child rows (see db/migrate.ts).
 */
export function applyConnectionPragmas(): void {
  // WAL gives concurrent reads while a write is in flight — the async reads
  // in db/read.ts run on a native thread while the JS thread writes.
  sqliteDb.execSync('PRAGMA journal_mode = WAL');
  // Safe with WAL (durable at checkpoint, never corrupt) and much faster than FULL.
  sqliteDb.execSync('PRAGMA synchronous = NORMAL');
  // Wait rather than throwing SQLITE_BUSY if a write overlaps.
  sqliteDb.execSync('PRAGMA busy_timeout = 5000');
}

/**
 * Fold the WAL back into the main file. Called when the app goes to the
 * background, so Android auto-backup (which excludes `-wal`) copies a complete
 * database. Best-effort: a busy reader just means a partial checkpoint now and
 * a full one next time.
 */
export function checkpointWal(): void {
  try {
    sqliteDb.execSync('PRAGMA wal_checkpoint(TRUNCATE)');
  } catch {
    // Never let a checkpoint failure surface as an app error.
  }
}

export function enableForeignKeys(): void {
  sqliteDb.execSync('PRAGMA foreign_keys = ON');
}

export function disableForeignKeys(): void {
  sqliteDb.execSync('PRAGMA foreign_keys = OFF');
}
