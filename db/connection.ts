import * as SQLite from 'expo-sqlite';

export const DATABASE_NAME = 'spendwise.db';

/**
 * Two SQLite connections to the one file, both behind handles that can be
 * closed and reopened.
 *
 * - The WRITE connection (`sqliteDb`, and `db` built on it): every write, the
 *   boot steps and tiny synchronous point reads.
 * - The READ connection (`openReadConnection`), used only by db/read.ts for
 *   every screen read (B22).
 *
 * Why two: SQLite serialises every call on one connection. With reads and
 * writes sharing it, a synchronous write waited on the JS thread for a long
 * aggregate to finish, and an async read could step between two statements
 * of a `writeTx` and see rows that were then rolled back. On its own
 * connection a read sees only committed data, and WAL lets it run while a
 * write is in flight.
 *
 * Every module imports `sqliteDb` (and `db`, built on it) once at load time,
 * so the handle itself can never change identity. But boot needs to close the
 * file and reopen it — to move an unreadable database aside ("Start fresh"),
 * and to swap in the converted file when a legacy SQLCipher database is
 * decrypted. `sqliteDb` is therefore a forwarding proxy over whichever
 * connection is currently open, and reopening is invisible to its users.
 * `closeConnection` closes both; each reopens on its next use.
 *
 * `enableChangeListener: true` (write connection only) feeds lib/db/changeHub:
 * every write reports its table, and live queries re-run from that.
 */

let current: SQLite.SQLiteDatabase | null = null;
let reader: SQLite.SQLiteDatabase | null = null;

export function openConnection(): SQLite.SQLiteDatabase {
  if (!current) {
    current = SQLite.openDatabaseSync(DATABASE_NAME, { enableChangeListener: true });
  }
  return current;
}

/**
 * The read connection, opened on first use — after boot, because nothing reads
 * before boot returns `ready`. By then the file is migrated and in WAL mode
 * (`journal_mode` is stored in the file, so this connection inherits it).
 *
 * `query_only` makes it read-only at the SQLite level: even raw SQL can't
 * write through it.
 */
export function openReadConnection(): SQLite.SQLiteDatabase {
  if (!reader) {
    const conn = SQLite.openDatabaseSync(DATABASE_NAME, { useNewConnection: true });
    try {
      conn.execSync('PRAGMA busy_timeout = 5000');
      conn.execSync('PRAGMA query_only = 1');
    } catch (e) {
      conn.closeSync();
      throw e;
    }
    reader = conn;
  }
  return reader;
}

const beforeCloseHooks = new Set<() => void>();

/**
 * Run `hook` just before the connections close — e.g. db/read.ts finalizes its
 * cached prepared statements, which belong to the read connection.
 */
export function onBeforeClose(hook: () => void): () => void {
  beforeCloseHooks.add(hook);
  return () => beforeCloseHooks.delete(hook);
}

/**
 * Close both connections, so the file can be moved or replaced. The next use
 * of `sqliteDb` or `openReadConnection` opens each again.
 */
export function closeConnection(): void {
  if (!current && !reader) return;
  for (const hook of beforeCloseHooks) {
    try {
      hook();
    } catch {
      // A hook must never prevent the close.
    }
  }
  try {
    reader?.closeSync();
  } catch {
    // The write connection must still close, or the file can't be moved.
  } finally {
    reader = null;
  }
  try {
    current?.closeSync();
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
  // WAL lets the read connection (db/read.ts) read while this one writes, and
  // shows it only committed data. The mode is stored in the file, so the read
  // connection inherits it.
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
