import type { BackupFormat } from './naming';

/**
 * A short log of what was backed up and restored, and when.
 *
 * `last_backup_at` answers "when", and that is enough for Phase 8's monthly
 * nudge. It is not enough for the question a person actually asks, which is
 * "have I ever really backed this up, or do I just remember meaning to?" — a
 * single date cannot tell an export that went to a cloud drive from one that
 * was made and forgotten, and it says nothing at all about a restore.
 *
 * Stored as JSON in `app_meta` rather than a table: it is app state, not user
 * data (it is deliberately NOT in a backup — see db/backup/tables.ts), it is
 * bounded at `MAX_ENTRIES`, and adding a table would mean a migration for
 * something no query ever joins to.
 *
 * Pure, so the parsing is tested against the values a hand-edited or
 * half-written key can actually hold.
 */

export type HistoryEvent = 'export' | 'restore';

export interface HistoryEntry {
  /** ISO timestamp. */
  at: string;
  event: HistoryEvent;
  format: BackupFormat;
  /** Size of the file involved, in bytes. 0 when unknown. */
  bytes: number;
  /** Transactions in it, for a line someone can recognise. */
  transactions: number;
}

/**
 * Enough to answer the question, few enough that `app_meta` stays small. At
 * roughly 110 bytes an entry this caps the row near 3 KB.
 */
export const MAX_ENTRIES = 25;

const EVENTS: readonly HistoryEvent[] = ['export', 'restore'];
const FORMATS: readonly BackupFormat[] = ['db', 'encrypted-db', 'json'];

/**
 * Read the stored value, keeping only entries that are actually usable.
 *
 * Never throws. This is a log: a corrupted or half-written value must cost the
 * log, never the screen that displays it, and certainly never a backup.
 */
export function parseHistory(raw: string | null | undefined): HistoryEntry[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const entries: HistoryEntry[] = [];
  for (const row of parsed) {
    if (typeof row !== 'object' || row === null) continue;
    const r = row as Record<string, unknown>;
    if (typeof r.at !== 'string' || r.at === '') continue;
    if (typeof r.event !== 'string' || !EVENTS.includes(r.event as HistoryEvent)) continue;
    if (typeof r.format !== 'string' || !FORMATS.includes(r.format as BackupFormat)) continue;
    entries.push({
      at: r.at,
      event: r.event as HistoryEvent,
      format: r.format as BackupFormat,
      bytes: typeof r.bytes === 'number' && Number.isFinite(r.bytes) ? Math.max(0, Math.trunc(r.bytes)) : 0,
      transactions:
        typeof r.transactions === 'number' && Number.isFinite(r.transactions)
          ? Math.max(0, Math.trunc(r.transactions))
          : 0,
    });
  }
  return entries;
}

/** Newest first, capped. The returned list is what gets stored. */
export function appendHistory(existing: readonly HistoryEntry[], entry: HistoryEntry): HistoryEntry[] {
  return [entry, ...existing].slice(0, MAX_ENTRIES);
}

export function serialiseHistory(entries: readonly HistoryEntry[]): string {
  return JSON.stringify(entries);
}

/** The newest export, which is what "have I backed up?" really means. A restore is not a backup. */
export function lastExport(entries: readonly HistoryEntry[]): HistoryEntry | null {
  return entries.find((e) => e.event === 'export') ?? null;
}

/** How many days ago, or null when the timestamp cannot be read. */
export function daysSince(iso: string, now: number = Date.now()): number | null {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return Math.floor((now - t) / 86_400_000);
}

/**
 * "Never backed up", or how long ago the last one was.
 *
 * Phase 8's nudge fires past 30 days; this is the same judgement said out
 * loud, so the screen and the notification can never disagree.
 */
export const STALE_AFTER_DAYS = 30;

export function backupAge(
  entries: readonly HistoryEntry[],
  now: number = Date.now(),
): {
  days: number | null;
  stale: boolean;
} {
  const last = lastExport(entries);
  if (!last) return { days: null, stale: true };
  const days = daysSince(last.at, now);
  return { days, stale: days == null || days >= STALE_AFTER_DAYS };
}
