/**
 * What a backup file is called, and what that name means.
 *
 * Pure string handling, in its own file for one reason: `backupsToDelete`
 * decides which files get removed, and one of the things in that folder is the
 * copy taken just before a restore — the only way back from the most
 * destructive action in the app. Logic like that should be provable in Node,
 * not only observable on a phone. (`db/migrate.ts` splits `snapshotsToDelete`
 * out for exactly the same reason.)
 *
 *   spendwise-20260920T171200.db                  an export
 *   spendwise-20260920T171200.enc.db              an export, passphrase-protected
 *   spendwise-20260920T171200.json                an export, readable
 *   spendwise-before-restore-20260920T171200.db   what a restore replaced
 *   spendwise-failed-restore-20260920T171200.db   a restore that would not open
 */

export type BackupFormat = 'db' | 'encrypted-db' | 'json';

/**
 * Why a file is in `files/backups/`.
 *
 * `export` files are the ones someone asked for, and are pruned to the newest
 * few. The other two are made BY a restore and are NEVER pruned: a safety copy
 * that a later export can delete is not a safety copy. They are still listed,
 * because "put it back the way it was" is the most likely next thing someone
 * wants after a restore they regret.
 */
export type BackupKind = 'export' | 'pre-restore' | 'failed-restore';

export const PREFIX = 'spendwise-';
export const PRE_RESTORE_PREFIX = 'spendwise-before-restore-';
export const FAILED_RESTORE_PREFIX = 'spendwise-failed-restore-';

const EXTENSIONS: Record<BackupFormat, string> = {
  db: '.db',
  'encrypted-db': '.enc.db',
  json: '.json',
};

const PREFIX_FOR: Record<BackupKind, string> = {
  export: PREFIX,
  'pre-restore': PRE_RESTORE_PREFIX,
  'failed-restore': FAILED_RESTORE_PREFIX,
};

/** `.enc.db` is checked before `.db`, or every encrypted file would read as plain. */
export function formatOf(name: string): BackupFormat | null {
  if (name.endsWith('.enc.db')) return 'encrypted-db';
  if (name.endsWith('.json')) return 'json';
  if (name.endsWith('.db')) return 'db';
  return null;
}

export function kindOf(name: string): BackupKind {
  if (name.startsWith(PRE_RESTORE_PREFIX)) return 'pre-restore';
  if (name.startsWith(FAILED_RESTORE_PREFIX)) return 'failed-restore';
  return 'export';
}

/** `spendwise-before-restore-20260920T171200.db` → `20260920T171200`. Names sort chronologically. */
export function stampOf(name: string, kind = kindOf(name)): string {
  return name.slice(PREFIX_FOR[kind].length).replace(/\.(enc\.db|db|json)$/, '');
}

export function isBackupName(name: string): boolean {
  return name.startsWith(PREFIX) && formatOf(name) !== null;
}

export function backupFileName(format: BackupFormat, stamp: string): string {
  return `${PREFIX}${stamp}${EXTENSIONS[format]}`;
}

export function preRestoreName(stamp: string): string {
  return `${PRE_RESTORE_PREFIX}${stamp}.db`;
}

export function failedRestoreName(stamp: string): string {
  return `${FAILED_RESTORE_PREFIX}${stamp}.db`;
}

/**
 * Which files to remove so only the newest `keep` EXPORTS of each format
 * remain.
 *
 * Per format, so someone who exports `.db` weekly does not lose their one
 * readable `.json` to three fresh `.db` files. Never a `pre-restore` or
 * `failed-restore` file, whatever the count.
 */
export function backupsToDelete(names: readonly string[], keep: number): string[] {
  const byFormat = new Map<BackupFormat, string[]>();
  for (const name of names) {
    if (!isBackupName(name) || kindOf(name) !== 'export') continue;
    const format = formatOf(name)!;
    byFormat.set(format, [...(byFormat.get(format) ?? []), name]);
  }
  const doomed: string[] = [];
  for (const list of byFormat.values()) {
    // Newest last, so everything before the final `keep` goes.
    const sorted = [...list].sort((a, b) => stampOf(a).localeCompare(stampOf(b)));
    doomed.push(...sorted.slice(0, Math.max(0, sorted.length - keep)));
  }
  return doomed;
}

/**
 * A name for a file chosen from outside the app.
 *
 * It arrives from the Storage Access Framework and is whatever the other app
 * called it, so it is stripped to characters that are safe in a path and
 * capped — the extension is kept, because that is the end of the string.
 */
export function safeName(name: string, fallbackStamp: string): string {
  const cleaned = name
    .replace(/[^\w.\- ]+/g, '_')
    .replace(/^[.\s]+/, '')
    .slice(-120);
  return cleaned.length > 0 ? cleaned : `picked-${fallbackStamp}.db`;
}

/** `20260920T171200` → `20 Sep 2026, 17:12`, for the screen. */
export function describeStamp(stamp: string): string {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})/.exec(stamp);
  if (!m) return stamp;
  const [, y, mo, d, h, min] = m;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${Number(d)} ${months[Number(mo) - 1]} ${y}, ${h}:${min}`;
}

export function describeSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
