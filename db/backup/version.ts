import type { JournalEntry } from '../migrate';

/**
 * Which schema version a database is at, as a number a backup can carry.
 *
 * Drizzle records migrations by TIMESTAMP, not by index: `__drizzle_migrations`
 * holds `created_at` millis, and "pending" means "newer than the last applied"
 * (db/migrate.ts). That is the right key for applying migrations and the wrong
 * one for a backup file, where the question is "can this build read it?" — a
 * comparison a person can also make sense of when it is refused.
 *
 * So a backup stores the INDEX (`0008`), resolved from the timestamp here.
 * Pure, so Jest checks the edges: an unmigrated database, a file from a build
 * with migrations this one has never seen.
 */

/** The newest migration index this build ships. */
export function bundledMigrationIdx(entries: readonly JournalEntry[]): number {
  return entries.reduce((max, e) => Math.max(max, e.idx), -1);
}

/**
 * The index matching the newest migration a database has applied, or null when
 * it has applied none.
 *
 * A timestamp with no matching entry means the file was written by a build
 * whose migrations this one does not have. That is exactly the "newer backup"
 * case, so it resolves to one past what we ship rather than to null, and
 * `checkMigrationIndex` refuses it with the right sentence.
 */
export function appliedMigrationIdx(entries: readonly JournalEntry[], lastApplied: number | null): number | null {
  if (lastApplied == null) return null;
  const applied = entries.filter((e) => e.when <= lastApplied);
  if (applied.length === 0) return null;
  const known = entries.some((e) => e.when === lastApplied);
  if (!known) return bundledMigrationIdx(entries) + 1;
  return applied.reduce((max, e) => Math.max(max, e.idx), -1);
}
