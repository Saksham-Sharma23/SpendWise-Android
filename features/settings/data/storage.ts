import { databaseFootprint, quotaState, roomForTransactions, type Footprint, type QuotaState } from '@/db/backup';

/**
 * Database size against Android's auto-backup quota, bound to this app's
 * handles for the Settings card.
 *
 * Settings owns this rather than the backup feature because a feature may
 * never import a sibling (CLAUDE.md #9, rule 1); both bind the same engine in
 * `db/backup`, which is where the arithmetic and the thresholds live and are
 * tested.
 */

export interface StorageSnapshot {
  footprint: Footprint;
  quota: QuotaState;
  /** Roughly how many more transactions fit under the quota; null when too few rows to judge. */
  room: number | null;
}

export function storageState(): StorageSnapshot {
  const footprint = databaseFootprint();
  return {
    footprint,
    quota: quotaState(footprint.databaseBytes),
    room: roomForTransactions(footprint.databaseBytes, footprint.transactions),
  };
}
