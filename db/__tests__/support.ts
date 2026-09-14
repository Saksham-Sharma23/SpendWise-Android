import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import * as schema from '../schema';
import { migrateWithForeignKeysOff, type JournalEntry, type MigrationConnection } from '../migrate';

/**
 * Test support: migrate a better-sqlite3 database through drizzle's REAL
 * migrator — the same SQLiteSyncDialect.migrate (one BEGIN…COMMIT) the phone
 * runs — wrapped exactly as db/boot.ts wraps it.
 */

export const MIGRATIONS_DIR = join(__dirname, '..', 'migrations');

export function journal(): JournalEntry[] {
  return JSON.parse(readFileSync(join(MIGRATIONS_DIR, 'meta', '_journal.json'), 'utf8')).entries;
}

/** A migrations folder containing only migrations 0..upToIdx. */
function folderUpTo(upToIdx: number): string {
  const dir = mkdtempSync(join(tmpdir(), 'spendwise-migrations-'));
  mkdirSync(join(dir, 'meta'));
  const j = JSON.parse(readFileSync(join(MIGRATIONS_DIR, 'meta', '_journal.json'), 'utf8'));
  j.entries = j.entries.filter((e: JournalEntry) => e.idx <= upToIdx);
  writeFileSync(join(dir, 'meta', '_journal.json'), JSON.stringify(j));
  for (const e of j.entries as JournalEntry[]) {
    copyFileSync(join(MIGRATIONS_DIR, `${e.tag}.sql`), join(dir, `${e.tag}.sql`));
  }
  return dir;
}

export function connectionOf(sqlite: Database.Database): MigrationConnection {
  return {
    exec: (sql) => void sqlite.exec(sql),
    all: <T>(sql: string) => sqlite.prepare(sql).all() as T[],
  };
}

/** Migrate as the app does: foreign keys off outside the transaction, checked after. */
export async function migrateSafely(sqlite: Database.Database, upToIdx?: number): Promise<void> {
  const folder = upToIdx == null ? MIGRATIONS_DIR : folderUpTo(upToIdx);
  await migrateWithForeignKeysOff(connectionOf(sqlite), () => migrate(drizzle(sqlite), { migrationsFolder: folder }));
}

/** Migrate the UNSAFE way (foreign keys on during the migration transaction). For the regression test only. */
export function migrateWithForeignKeysOn(sqlite: Database.Database, upToIdx?: number): void {
  sqlite.pragma('foreign_keys = ON');
  const folder = upToIdx == null ? MIGRATIONS_DIR : folderUpTo(upToIdx);
  migrate(drizzle(sqlite), { migrationsFolder: folder });
}

/** A fully migrated in-memory database with foreign keys on, plus its Drizzle handle. */
export async function freshDb() {
  const sqlite = new Database(':memory:');
  await migrateSafely(sqlite);
  sqlite.pragma('foreign_keys = ON');
  return { sqlite, db: drizzle(sqlite, { schema }) };
}
