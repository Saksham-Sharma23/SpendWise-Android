import { toast } from 'sonner-native';

/**
 * Run a database write and turn a failure into a toast + a result the caller
 * can branch on.
 *
 * Without this, a write that throws (disk full, a constraint) escapes the
 * press handler: no message appears, and a modal closes as though the save
 * worked. Convention #18: the write reports the error, so the screen only
 * has to stay open when `ok` is false.
 */

export type WriteResult<T> = { ok: true; value: T } | { ok: false; message: string };

/** Map SQLite's terse errors to something a person can act on. Pure, so it is tested. */
export function describeWriteError(e: unknown, action: string): string {
  const raw = e instanceof Error ? e.message : String(e);
  if (/SQLITE_FULL|database or disk is full/i.test(raw)) {
    return `Couldn't ${action} — your phone's storage is full`;
  }
  if (/UNIQUE constraint/i.test(raw)) return `Couldn't ${action} — it clashes with something that already exists`;
  if (/FOREIGN KEY constraint/i.test(raw)) return `Couldn't ${action} — something it refers to no longer exists`;
  if (/SQLITE_READONLY|readonly/i.test(raw)) return `Couldn't ${action} — storage is read-only right now`;
  return `Couldn't ${action}. Please try again`;
}

export function safeWrite<T>(action: string, fn: () => T): WriteResult<T> {
  try {
    return { ok: true, value: fn() };
  } catch (e) {
    if (__DEV__) console.warn(`[safeWrite] ${action} failed`, e);
    const message = describeWriteError(e, action);
    toast.error(message);
    return { ok: false, message };
  }
}
