import { drizzle } from 'drizzle-orm/expo-sqlite';
import * as SQLite from 'expo-sqlite';
import * as schema from './schema';

export const DATABASE_NAME = 'spendwise.db';

/**
 * The SQLite connection.
 *
 * `enableChangeListener: true` is what makes Drizzle's `useLiveQuery` work:
 * any write re-runs affected queries and re-renders their components. It is
 * the single flag that lets this app do without a server-state library
 * (CLAUDE.md #6). Without it, writes land but nothing updates, and you end
 * up reaching for a cache you do not need.
 */
export const sqliteDb = SQLite.openDatabaseSync(DATABASE_NAME, {
  enableChangeListener: true,
});

/**
 * SQLCipher key + pragmas, applied immediately after open.
 *
 * PRAGMA key must be the FIRST statement on the connection — anything before
 * it touches the file unencrypted. See db/encryption.ts for where the key
 * comes from and why it is not a hardcoded constant.
 */
export function configureConnection(key: string): void {
  // Order matters: key first, then everything else.
  sqliteDb.execSync(`PRAGMA key = '${key.replace(/'/g, "''")}'`);

  // WAL gives us concurrent reads while a write is in flight, which matters
  // when a large import commits while the dashboard is subscribed.
  sqliteDb.execSync('PRAGMA journal_mode = WAL');

  // Off by default in SQLite. Our schema relies on ON DELETE CASCADE and
  // SET NULL, and silently ignoring them would orphan rows.
  sqliteDb.execSync('PRAGMA foreign_keys = ON');

  // Wait rather than throwing SQLITE_BUSY if a write overlaps.
  sqliteDb.execSync('PRAGMA busy_timeout = 5000');
}

/** The Drizzle handle every query in the app goes through. */
export const db = drizzle(sqliteDb, { schema });

export type DB = typeof db;
export { schema };
