import { eq } from 'drizzle-orm';

import { nowISO } from '@/lib/dates';
import { appMeta, META_KEYS } from '@/db/schema';
import { allSync, type AnyDb, type SyncDb } from '@/db/types';

/**
 * `app_meta` — a small key/value table for app state that is not user data:
 * schema and seed versions, the last backup date, onboarding, integrity flags.
 *
 * The raw reads and writes, taking the database as a parameter so they are
 * tested in Node. Screens use `@/data/meta`, which binds them to the app's
 * handles and adds a live hook.
 */

export type MetaKey = (typeof META_KEYS)[keyof typeof META_KEYS];

/** The value for `key`, as a query any handle can run. */
export function metaQuery(db: AnyDb, key: MetaKey) {
  return db.select({ value: appMeta.value }).from(appMeta).where(eq(appMeta.key, key)).limit(1);
}

/** Read one value synchronously; null when unset. */
export function readMeta(db: SyncDb, key: MetaKey): string | null {
  return allSync<{ value: string }>(metaQuery(db, key))[0]?.value ?? null;
}

/** Insert or update one value. */
export function writeMeta(db: SyncDb, key: MetaKey, value: string): void {
  const now = nowISO();
  db.insert(appMeta)
    .values({ key, value, updatedAt: now })
    .onConflictDoUpdate({ target: appMeta.key, set: { value, updatedAt: now } })
    .run();
}
