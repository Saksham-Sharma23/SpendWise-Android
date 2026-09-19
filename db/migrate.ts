/**
 * Migration safety, independent of any native module so Jest proves it.
 *
 * Drizzle's migrator runs every pending migration inside ONE `BEGIN … COMMIT`.
 * drizzle-kit's table rebuilds start with `PRAGMA foreign_keys=OFF`, but that
 * pragma is a NO-OP inside a transaction. So if foreign keys are on when
 * migrations start, rebuilding `categories` runs an implicit
 * `DELETE FROM categories` first — which fires ON DELETE CASCADE (every budget
 * gone) and ON DELETE SET NULL (every transaction uncategorised). Silently.
 *
 * `migrateWithForeignKeysOff` therefore turns FKs off OUTSIDE the transaction,
 * migrates, runs `PRAGMA foreign_key_check`, and turns them back on.
 * db/__tests__/migrations.test.ts demonstrates the data loss without it.
 */

export interface MigrationConnection {
  exec(sql: string): void;
  all<T = Record<string, unknown>>(sql: string): T[];
}

export interface JournalEntry {
  idx: number;
  when: number;
  tag: string;
}

export class ForeignKeyViolationError extends Error {
  constructor(readonly violations: number) {
    super(`Migration left ${violations} foreign key violation(s). Your data was not deleted; a snapshot was kept.`);
    this.name = 'ForeignKeyViolationError';
  }
}

/** The newest migration timestamp recorded, or null on a database that has never been migrated. */
export function lastAppliedMillis(conn: MigrationConnection): number | null {
  const table = conn.all<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = '__drizzle_migrations'",
  );
  if (table.length === 0) return null;
  const rows = conn.all<{ created_at: number | string | null }>(
    'SELECT created_at FROM __drizzle_migrations ORDER BY created_at DESC LIMIT 1',
  );
  const v = rows[0]?.created_at;
  return v == null ? null : Number(v);
}

/** Exactly drizzle's rule: a migration is pending when its `when` is newer than the last applied. */
export function pendingMigrations(entries: readonly JournalEntry[], lastApplied: number | null): JournalEntry[] {
  return entries.filter((e) => lastApplied == null || e.when > lastApplied);
}

export async function migrateWithForeignKeysOff(
  conn: MigrationConnection,
  migrate: () => void | Promise<void>,
): Promise<void> {
  conn.exec('PRAGMA foreign_keys = OFF');
  try {
    await migrate();
    const violations = conn.all('PRAGMA foreign_key_check');
    if (violations.length > 0) {
      // Drizzle has already COMMITTED by now — it runs every pending migration
      // in one transaction — so the damage cannot be rolled back here. Record
      // it instead, and refuse to boot until it is gone (B8).
      recordIntegrityFailure(conn, violations.length);
      throw new ForeignKeyViolationError(violations.length);
    }
  } finally {
    conn.exec('PRAGMA foreign_keys = ON');
  }
}

export const SNAPSHOT_PREFIX = 'pre-migration-';

/** Snapshot file name for a migration run: `pre-migration-0005-20260914T101112.db`. */
export function snapshotName(latestIdx: number, at: Date): string {
  const stamp = at
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, '');
  return `${SNAPSHOT_PREFIX}${String(latestIdx).padStart(4, '0')}-${stamp}.db`;
}

/** Which snapshot files to delete so only the newest `keep` remain. Names sort chronologically. */
export function snapshotsToDelete(names: readonly string[], keep = 2): string[] {
  const snaps = names.filter((n) => n.startsWith(SNAPSHOT_PREFIX) && n.endsWith('.db')).sort();
  return snaps.slice(0, Math.max(0, snaps.length - keep));
}

/**
 * Copies the boot-failure screen shares: `spendwise-share-20260919T101112.db`,
 * sometimes with a `.db-wal` beside it. Each is a whole database, so they are
 * pruned rather than left to pile up (B27).
 */
export const SHARE_PREFIX = 'spendwise-share-';

/** Which share copies to delete so only the newest `keep` remain; a copy's `-wal` goes with it. */
export function shareCopiesToDelete(names: readonly string[], keep: number): string[] {
  const COPY = /\.db(-wal)?$/;
  const stampOf = (n: string) => n.slice(SHARE_PREFIX.length).replace(COPY, '');
  const ours = names.filter((n) => n.startsWith(SHARE_PREFIX) && COPY.test(n));
  const stamps = [...new Set(ours.map(stampOf))].sort();
  const doomed = new Set(stamps.slice(0, Math.max(0, stamps.length - keep)));
  return ours.filter((n) => doomed.has(stampOf(n)));
}

// ---------------------------------------------------------------------------
// "Is there anything worth protecting?" — decides the pre-migration snapshot
// ---------------------------------------------------------------------------

/**
 * Every table that can hold something the user typed, with the predicate that
 * separates their rows from seeded ones.
 *
 * `transactions` alone used to stand for "has user data" (B13), so anyone who
 * used only Groups, Budgets or the Tracker got NO safety copy before a
 * migration — the one moment the data is most at risk. A Groups-only user is
 * an ordinary user, not an edge case.
 *
 * System rows are excluded: the seeded categories and the `sys:self` person
 * exist in a brand-new install and are restored by seeding, so they are not
 * worth a snapshot on their own.
 */
const USER_DATA_PROBES: readonly (readonly [table: string, predicate: string])[] = [
  ['transactions', '1'],
  ['budgets', '1'],
  ['subscriptions', '1'],
  ['split_groups', '1'],
  ['split_expenses', '1'],
  ['settlements', '1'],
  ['people', 'is_self = 0'],
  ['categories', 'is_system = 0'],
];

/**
 * A single query answering "does any user data exist?", built only from the
 * tables that are actually present — older schemas predate several of them, so
 * probing a missing table would throw instead of answering.
 *
 * Returns null when none of the tables exist yet (a fresh database).
 */
export function userDataProbeSql(existingTables: readonly string[]): string | null {
  const present = new Set(existingTables);
  const probes = USER_DATA_PROBES.filter(([table]) => present.has(table));
  if (probes.length === 0) return null;

  // EXISTS short-circuits on the first row, so this stays O(1) per table
  // however large the ledger is — it must not slow down every launch.
  const clauses = probes.map(([table, predicate]) => `EXISTS (SELECT 1 FROM ${table} WHERE ${predicate} LIMIT 1)`);
  return `SELECT (${clauses.join(' OR ')}) AS has_data`;
}

/** The tables this database actually has, for `userDataProbeSql`. */
export function existingTables(conn: MigrationConnection): string[] {
  return conn.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'").map((r) => r.name);
}

// ---------------------------------------------------------------------------
// Integrity failures outlive the launch that found them (B8)
// ---------------------------------------------------------------------------

const INTEGRITY_FAILED_KEY = 'integrity_failed';

function quote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * Remember that `foreign_key_check` failed, so the next launch cannot quietly
 * accept the damage.
 *
 * Written with raw SQL rather than through Drizzle because this runs mid-boot,
 * when the ORM handle may not be usable, and it must not itself throw: losing
 * the flag would be worse than a clumsy write.
 */
export function recordIntegrityFailure(conn: MigrationConnection, violations: number): void {
  try {
    conn.exec(`CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL)`);
    const value = quote(`${violations}@${new Date().toISOString()}`);
    conn.exec(
      `INSERT INTO app_meta (key, value) VALUES (${quote(INTEGRITY_FAILED_KEY)}, ${value})
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    );
  } catch {
    // Best effort. A failed flag write must not mask the violation itself.
  }
}

/** Whether a previous launch recorded an unresolved integrity failure. */
export function integrityFailureRecorded(conn: MigrationConnection): boolean {
  try {
    const rows = conn.all<{ value: string }>(
      `SELECT value FROM app_meta WHERE key = ${quote(INTEGRITY_FAILED_KEY)} LIMIT 1`,
    );
    return rows.length > 0;
  } catch {
    // No app_meta yet (a database that never migrated) means nothing to clear.
    return false;
  }
}

/**
 * Re-check a database that failed before, and clear the flag only if it is
 * genuinely clean now — a later fix migration, or a restore, can resolve it.
 *
 * Returns the number of violations still present, so boot can refuse while it
 * is non-zero.
 */
export function recheckIntegrity(conn: MigrationConnection): number {
  const violations = conn.all('PRAGMA foreign_key_check');
  if (violations.length === 0) {
    try {
      conn.exec(`DELETE FROM app_meta WHERE key = ${quote(INTEGRITY_FAILED_KEY)}`);
    } catch {
      // If the row cannot be removed the next launch simply re-checks.
    }
  }
  return violations.length;
}
