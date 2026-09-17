import { eq } from 'drizzle-orm';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';

import { runWriteTx } from './tx';
import { appMeta, categories, META_KEYS, type CategoryKind } from './schema';

/**
 * System-category reconciliation, independent of the native handle so Jest
 * proves it against a real migrated schema. db/seed.ts binds it to the app.
 *
 * Identity is the fixed `uid` (`sys:rent`), never the name: a user may rename
 * "Rent" to "House rent", and that must not make the seeder add "Rent" again.
 */

 
export type SeedDatabase = BaseSQLiteDatabase<'sync', any, any>;

export interface SystemCategory {
  uid: `sys:${string}`;
  name: string;
  icon: string;
  color: string;
  kind: CategoryKind;
}

export function reconcileSystemCategories(
  database: SeedDatabase,
  list: readonly SystemCategory[],
  version: number,
  schemaVersion: string,
  now: string,
): { inserted: number; skipped: boolean } {
  const stored = database.select().from(appMeta).where(eq(appMeta.key, META_KEYS.SEED_VERSION)).limit(1).all()[0];
  if (stored?.value != null && Number(stored.value) >= version) return { inserted: 0, skipped: true };

  return runWriteTx(database, (tx) => {
    const present = new Set(
      (tx.select({ uid: categories.uid }).from(categories).all() as { uid: string }[]).map((r) => r.uid),
    );
    let inserted = 0;
    for (const c of list) {
      if (present.has(c.uid)) continue;
      // A clash with the user's own LIVE category of the same name (cat_name_unique)
      // is skipped rather than failing the launch.
      const res = tx
        .insert(categories)
        .values({ ...c, isSystem: true, createdAt: now })
        .onConflictDoNothing()
        .run() as { changes: number };
      inserted += res.changes;
    }
    const upsert = (key: string, value: string) =>
      tx
        .insert(appMeta)
        .values({ key, value, updatedAt: now })
        .onConflictDoUpdate({ target: appMeta.key, set: { value, updatedAt: now } })
        .run();
    upsert(META_KEYS.SEED_VERSION, String(version));
    upsert(META_KEYS.SCHEMA_VERSION, schemaVersion);
    tx.insert(appMeta).values({ key: META_KEYS.SEEDED_AT, value: now, updatedAt: now }).onConflictDoNothing().run();
    return { inserted, skipped: false };
  });
}
