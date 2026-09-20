/**
 * How big the database is, against the ceiling nobody is told about.
 *
 * Android's auto-backup has a **25 MB quota, and it fails SILENTLY**. There is
 * no error, no notification and no entry anywhere the user can see: the backup
 * simply stops happening, and the first anyone learns of it is when a new
 * phone restores an empty app. Measured on this project's own dev build
 * (2026-09-15), a 16 MB database plus the dev-launcher bundle already exceeded
 * it and `bmgr backupnow` answered "Size quota exceeded".
 *
 * That is the entire reason this file exists: the only defence against a
 * silent limit is to show the number before it is reached.
 *
 * Pure arithmetic, so the thresholds are tested rather than eyeballed. What
 * counts toward the quota is decided by `plugins/withBackupRules.js`: the
 * exclusions there (snapshots, backups, the WAL, the dev bundle) are exactly
 * the things NOT measured here.
 */

export const AUTO_BACKUP_QUOTA_BYTES = 25 * 1024 * 1024;

/** Past this share of the quota, the screen starts saying so. */
export const WARN_FRACTION = 0.7;

export type QuotaLevel = 'ok' | 'warn' | 'over';

export interface QuotaState {
  bytes: number;
  quota: number;
  /** 0–1, clamped, for a bar. */
  fraction: number;
  level: QuotaLevel;
  /** Bytes still available, floored at 0. */
  remaining: number;
}

export function quotaState(bytes: number, quota: number = AUTO_BACKUP_QUOTA_BYTES): QuotaState {
  const size = Number.isFinite(bytes) && bytes > 0 ? bytes : 0;
  const fraction = quota > 0 ? Math.min(1, size / quota) : 0;
  const level: QuotaLevel = size >= quota ? 'over' : fraction >= WARN_FRACTION ? 'warn' : 'ok';
  return { bytes: size, quota, fraction, level, remaining: Math.max(0, quota - size) };
}

/**
 * Roughly how many more transactions fit before the quota is reached.
 *
 * Deliberately stated in transactions rather than megabytes: "about 80,000
 * more entries" is a fact someone can act on, where "10 MB left" is not. The
 * per-row figure is measured from this database rather than assumed, so it
 * accounts for indexes, notes and whatever else is in there.
 *
 * Returns null when there is not enough data to divide by.
 */
export function roomForTransactions(
  bytes: number,
  rows: number,
  quota: number = AUTO_BACKUP_QUOTA_BYTES,
): number | null {
  if (!Number.isFinite(bytes) || !Number.isFinite(rows) || rows < 500 || bytes <= 0) return null;
  const perRow = bytes / rows;
  if (perRow <= 0) return null;
  return Math.max(0, Math.floor((quota - bytes) / perRow));
}
