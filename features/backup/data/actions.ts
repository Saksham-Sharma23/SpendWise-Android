import { toast } from 'sonner-native';

import { getMeta, META_KEYS, setMeta } from '@/data/meta';
import {
  applyRestore,
  discardRestore,
  exportDatabaseFile,
  exportJsonFile,
  listBackups,
  pickBackupFile,
  prepareRestore,
  RestoreError,
  shareBackup,
  type BackupFileInfo,
  type RestorePlan,
} from '@/db/backup';
import { nowISO } from '@/lib/dates';

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

export interface ExportOutcome {
  ok: boolean;
  file?: BackupFileInfo;
  message?: string;
}

function markBackedUp(): void {
  try {
    setMeta(META_KEYS.LAST_BACKUP_AT, nowISO());
  } catch (e) {
    // The backup itself succeeded; failing to write the date is not a reason
    // to tell someone their backup failed.
    if (__DEV__) console.warn('[backup] could not record last_backup_at', e);
  }
}

/** When the last export was made, or null if never. */
export function lastBackupAt(): string | null {
  return getMeta(META_KEYS.LAST_BACKUP_AT);
}

export async function runExport(format: ExportFormat, passphrase?: string): Promise<ExportOutcome> {
  try {
    const result =
      format === 'json'
        ? await exportJsonFile()
        : exportDatabaseFile(format === 'encrypted-db' ? passphrase : undefined);
    markBackedUp();
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
