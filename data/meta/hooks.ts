import { db } from '@/db/client';
import { metaQuery, readMeta, writeMeta, type MetaKey } from './sql';
import { readDb } from '@/db/read';
import { META_KEYS } from '@/db/schema';
import { useDbQuery, type DbQueryResult } from '@/lib/db/useDbQuery';

/** `app_meta` bound to the app's handles: the sync write handle and the async read handle. */

export { META_KEYS, type MetaKey };

export function getMeta(key: MetaKey): string | null {
  return readMeta(db, key);
}

export function setMeta(key: MetaKey, value: string): void {
  writeMeta(db, key, value);
}

/** A live value: re-reads when `app_meta` changes. `null` while unset. */
export function useMeta(key: MetaKey): DbQueryResult<string | null> {
  return useDbQuery(async () => (await metaQuery(readDb, key))[0]?.value ?? null, ['app_meta'], [key], null);
}
