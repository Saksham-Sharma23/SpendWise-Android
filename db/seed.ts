import { eq, sql } from 'drizzle-orm';
import { db } from './client';
import { appMeta, categories, META_KEYS } from './schema';

/**
 * System categories, seeded on first launch.
 *
 * The server used to do this. A fresh install with no categories cannot
 * record a transaction at all, so this is not optional — it is part of the
 * launch sequence, gated behind the splash screen alongside migrations.
 *
 * Icons are lucide names, matching the web app so the two clients look the
 * same. Colours are the web palette's category hues.
 */
const SYSTEM_CATEGORIES: Array<{ name: string; icon: string; color: string }> = [
  { name: 'Food & Dining', icon: 'utensils', color: '#E8833A' },
  { name: 'Groceries', icon: 'shopping-basket', color: '#4B9B6E' },
  { name: 'Transport', icon: 'car', color: '#3A7CA5' },
  { name: 'Shopping', icon: 'shopping-bag', color: '#C2548A' },
  { name: 'Entertainment', icon: 'clapperboard', color: '#8B5FBF' },
  { name: 'Bills & Utilities', icon: 'receipt', color: '#D4A32C' },
  { name: 'Health', icon: 'heart-pulse', color: '#D4544E' },
  { name: 'Education', icon: 'graduation-cap', color: '#2F8F8F' },
  { name: 'Rent', icon: 'house', color: '#7A6A5A' },
  { name: 'Travel', icon: 'plane', color: '#4E86C7' },
  { name: 'Subscriptions', icon: 'repeat', color: '#9B6BC4' },
  { name: 'Personal Care', icon: 'sparkles', color: '#D97BA0' },
  { name: 'Gifts & Donations', icon: 'gift', color: '#C75E5E' },
  { name: 'Investments', icon: 'trending-up', color: '#3F9160' },
  { name: 'Salary', icon: 'wallet', color: '#2E8B57' },
  { name: 'Other Income', icon: 'circle-plus', color: '#5F9EA0' },
  { name: 'Miscellaneous', icon: 'circle-ellipsis', color: '#8A8A8A' },
];

/** Current schema generation. Bumped only for breaking data-shape changes. */
export const SCHEMA_VERSION = '1';

/**
 * Idempotent. Safe to call on every launch — it checks a marker first and
 * inserts only what is genuinely missing, so a partial previous run (killed
 * mid-seed) still converges.
 */
export async function seedIfNeeded(): Promise<{ seeded: boolean; inserted: number }> {
  const marker = await db
    .select()
    .from(appMeta)
    .where(eq(appMeta.key, META_KEYS.SEEDED_AT))
    .limit(1);

  const alreadySeeded = marker.length > 0;

  // Even when the marker exists, reconcile: a category the user deleted stays
  // deleted (we match on name), but one never inserted gets added.
  const existing = await db.select({ name: categories.name }).from(categories);
  const existingLower = new Set(existing.map((c) => c.name.toLowerCase()));

  const missing = SYSTEM_CATEGORIES.filter((c) => !existingLower.has(c.name.toLowerCase()));

  if (missing.length > 0 && !alreadySeeded) {
    await db.insert(categories).values(
      missing.map((c) => ({
        name: c.name,
        icon: c.icon,
        color: c.color,
        isSystem: true,
      })),
    );
  }

  if (!alreadySeeded) {
    const now = new Date().toISOString();
    await db
      .insert(appMeta)
      .values([
        { key: META_KEYS.SEEDED_AT, value: now },
        { key: META_KEYS.SCHEMA_VERSION, value: SCHEMA_VERSION },
      ])
      .onConflictDoNothing();
  }

  return { seeded: !alreadySeeded, inserted: alreadySeeded ? 0 : missing.length };
}

/** Read a single app_meta value. */
export async function getMeta(key: string): Promise<string | null> {
  const rows = await db.select().from(appMeta).where(eq(appMeta.key, key)).limit(1);
  return rows[0]?.value ?? null;
}

/** Write a single app_meta value, inserting or updating as needed. */
export async function setMeta(key: string, value: string): Promise<void> {
  await db
    .insert(appMeta)
    .values({ key, value, updatedAt: sql`(CURRENT_TIMESTAMP)` })
    .onConflictDoUpdate({
      target: appMeta.key,
      set: { value, updatedAt: sql`(CURRENT_TIMESTAMP)` },
    });
}
