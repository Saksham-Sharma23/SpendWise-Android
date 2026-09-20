import { toast } from 'sonner-native';

import { getMeta, META_KEYS, setMeta } from '@/data/meta';
import {
  appendHistory,
  applyRestore,
  backupAge,
  discardRestore,
  exportDatabaseFile,
  exportJsonFile,
  listBackups,
  parseHistory,
  pickBackupFile,
  prepareRestore,
  RestoreError,
  serialiseHistory,
  shareBackup,
  type BackupFileInfo,
  type HistoryEntry,
  type HistoryEvent,
  type RestorePlan,
} from '@/db/backup';
import { nowISO } from '@/lib/dates';
import { notifyDatabaseReplaced } from '@/lib/db/useDbQuery';

/**
 * What the Backup screen calls.
 *
 * The engine is in `db/backup`; this binds it to the app — the share sheet,
 * the toast, and `last_backup_at`, which Phase 8's monthly nudge reads and
 * which is the difference between "I think I backed up" and knowing.
 *
 * `last_backup_at` is recorded when the FILE EXISTS, not when the share sheet
 * closes: the export is already saved in `files/backups/` by then, and
 * someone who cancelled the share still has a copy. Recording it only on a
 * completed share would mean the nudge nagged people who had in fact backed up.
 */

export type ExportFormat = 'db' | 'encrypted-db' | 'json';
type BackupFormat = ExportFormat;

export interface ExportOutcome {
  ok: boolean;
  file?: BackupFileInfo;
  message?: string;
}

/**
 * Record that something happened, in both places that ask.
 *
 * `last_backup_at` is what Phase 8's monthly nudge reads; the history is what
 * the screen shows. Neither is allowed to fail the operation it describes — a
 * backup that succeeded and then failed to write a log entry is a successful
 * backup, and saying otherwise would send someone to make another one.
 */
function record(event: HistoryEvent, format: BackupFormat, bytes: number, transactions: number): void {
  try {
    const at = nowISO();
    if (event === 'export') setMeta(META_KEYS.LAST_BACKUP_AT, at);
    const entry: HistoryEntry = { at, event, format, bytes, transactions };
    setMeta(META_KEYS.BACKUP_HISTORY, serialiseHistory(appendHistory(readHistory(), entry)));
  } catch (e) {
    if (__DEV__) console.warn('[backup] could not record history', e);
  }
}

/** When the last export was made, or null if never. */
export function lastBackupAt(): string | null {
  return getMeta(META_KEYS.LAST_BACKUP_AT);
}

/** The export/restore log, newest first. Never throws: a broken log is not a broken app. */
export function readHistory(): HistoryEntry[] {
  try {
    return parseHistory(getMeta(META_KEYS.BACKUP_HISTORY));
  } catch {
    return [];
  }
}

/** How long since the last EXPORT, and whether that is long enough to nag about. */
export function backupFreshness(): { days: number | null; stale: boolean } {
  return backupAge(readHistory());
}

export async function runExport(format: ExportFormat, passphrase?: string): Promise<ExportOutcome> {
  try {
    const result =
      format === 'json'
        ? await exportJsonFile()
        : exportDatabaseFile(format === 'encrypted-db' ? passphrase : undefined);
    record('export', result.file.format, result.file.size, result.counts?.transactions ?? 0);
    try {
      await shareBackup(result.file);
    } catch (e) {
      // The file exists either way. Say where it is rather than calling this a failure.
      toast.error(e instanceof Error ? e.message : 'Could not open the share sheet');
      return { ok: true, file: result.file, message: 'Saved in the app. Sharing was not available.' };
    }
    return { ok: true, file: result.file };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (__DEV__) console.warn('[backup] export failed', e);
    toast.error(`Could not make a backup — ${message}`);
    return { ok: false, message };
  }
}

export function savedBackups(): BackupFileInfo[] {
  return listBackups();
}

export async function shareSavedBackup(file: BackupFileInfo): Promise<void> {
  try {
    await shareBackup(file);
  } catch (e) {
    toast.error(e instanceof Error ? e.message : 'Could not share that file');
  }
}

/**
 * Choose a backup from anywhere on the phone. Returns null when the picker is
 * dismissed, which is not an error and must not toast.
 */
export async function chooseBackupFile(): Promise<BackupFileInfo | null> {
  try {
    return await pickBackupFile();
  } catch (e) {
    toast.error(e instanceof Error ? e.message : 'Could not open the file picker');
    return null;
  }
}

export interface CheckOutcome {
  ok: boolean;
  plan?: RestorePlan;
  message?: string;
  /** The file is encrypted and no passphrase was given: ask for one and retry. */
  needsPassphrase?: boolean;
}

/**
 * Check a backup WITHOUT changing anything, so the confirmation screen can
 * say what is in it. Nothing here touches the live database.
 */
export async function checkBackup(uri: string, passphrase?: string): Promise<CheckOutcome> {
  try {
    return { ok: true, plan: await prepareRestore(uri, passphrase) };
  } catch (e) {
    const message = e instanceof RestoreError ? e.message : e instanceof Error ? e.message : String(e);
    return { ok: false, message, needsPassphrase: /encrypted|passphrase/i.test(message) };
  }
}

export interface RestoreOutcome {
  ok: boolean;
  message?: string;
  counts?: Record<string, number>;
}

/** Swap in a checked backup. The database it replaces is copied first (`db/backup/restore.ts`). */
export async function confirmRestore(plan: RestorePlan): Promise<RestoreOutcome> {
  try {
    const result = await applyRestore(plan);
    // The file was REPLACED, not written to, so expo-sqlite fired no change
    // event and every query already on screen is still showing the old
    // database. Wake them all (see notifyDatabaseReplaced).
    notifyDatabaseReplaced();
    record('restore', plan.format, 0, plan.counts.transactions ?? 0);
    return { ok: true, counts: result.counts };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (__DEV__) console.warn('[backup] restore failed', e);
    return { ok: false, message };
  }
}

/** Drop the staged copy — called when the confirmation is dismissed. */
export function cancelRestore(): void {
  try {
    discardRestore();
  } catch (e) {
    if (__DEV__) console.warn('[backup] could not clear the staged restore', e);
  }
}
