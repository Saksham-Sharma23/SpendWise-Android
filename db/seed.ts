import { eq } from 'drizzle-orm';

import { nowISO } from '@/lib/dates';
import { db } from './client';
import { appMeta } from './schema';
import { reconcileSystemCategories, type SystemCategory } from './seedCore';

/**
 * System categories, reconciled at every launch.
 *
 * A fresh install with no categories cannot record a transaction at all, so
 * this is part of the launch sequence, behind the splash with migrations.
 *
 * Identity is the fixed `uid` (`sys:rent`), never the name (db/seedCore.ts).
 * Migration 0003 gave existing system rows these uids.
 *
 * `SEED_VERSION` is bumped whenever this list gains an entry. Existing installs
 * reconcile once per bump: missing uids are inserted, nothing present is
 * touched, and a name that clashes with a user's own live category is skipped.
 *
 * Icons are lucide names, matching the web app.
 */

export const SYSTEM_CATEGORIES: readonly SystemCategory[] = [
  { uid: 'sys:food-dining', name: 'Food & Dining', icon: 'utensils', color: '#E8833A', kind: 'expense' },
  { uid: 'sys:groceries', name: 'Groceries', icon: 'shopping-basket', color: '#4B9B6E', kind: 'expense' },
  { uid: 'sys:transport', name: 'Transport', icon: 'car', color: '#3A7CA5', kind: 'expense' },
  { uid: 'sys:shopping', name: 'Shopping', icon: 'shopping-bag', color: '#C2548A', kind: 'expense' },
  { uid: 'sys:entertainment', name: 'Entertainment', icon: 'clapperboard', color: '#8B5FBF', kind: 'expense' },
  { uid: 'sys:bills-utilities', name: 'Bills & Utilities', icon: 'receipt', color: '#D4A32C', kind: 'expense' },
  { uid: 'sys:health', name: 'Health', icon: 'heart-pulse', color: '#D4544E', kind: 'expense' },
  { uid: 'sys:education', name: 'Education', icon: 'graduation-cap', color: '#2F8F8F', kind: 'expense' },
  { uid: 'sys:rent', name: 'Rent', icon: 'house', color: '#7A6A5A', kind: 'expense' },
  { uid: 'sys:travel', name: 'Travel', icon: 'plane', color: '#4E86C7', kind: 'expense' },
  { uid: 'sys:subscriptions', name: 'Subscriptions', icon: 'repeat', color: '#9B6BC4', kind: 'expense' },
  { uid: 'sys:personal-care', name: 'Personal Care', icon: 'sparkles', color: '#D97BA0', kind: 'expense' },
  { uid: 'sys:gifts-donations', name: 'Gifts & Donations', icon: 'gift', color: '#C75E5E', kind: 'both' },
  { uid: 'sys:investments', name: 'Investments', icon: 'trending-up', color: '#3F9160', kind: 'both' },
  { uid: 'sys:salary', name: 'Salary', icon: 'wallet', color: '#2E8B57', kind: 'income' },
  { uid: 'sys:other-income', name: 'Other Income', icon: 'circle-plus', color: '#5F9EA0', kind: 'income' },
  { uid: 'sys:miscellaneous', name: 'Miscellaneous', icon: 'circle-ellipsis', color: '#8A8A8A', kind: 'both' },
];

/** Bump when SYSTEM_CATEGORIES gains an entry. */
export const SEED_VERSION = 1;

/** Current schema generation. Bumped only for breaking data-shape changes. */
export const SCHEMA_VERSION = '1';

/** Idempotent, synchronous, atomic. Cheap when nothing is due: one indexed read. */
export function seedIfNeeded(): { inserted: number } {
  const { inserted } = reconcileSystemCategories(db, SYSTEM_CATEGORIES, SEED_VERSION, SCHEMA_VERSION, nowISO());
  return { inserted };
}

/** Read a single app_meta value. */
export function getMeta(key: string): string | null {
  const rows = db.select().from(appMeta).where(eq(appMeta.key, key)).limit(1).all();
  return rows[0]?.value ?? null;
}

/** Write a single app_meta value, inserting or updating as needed. */
export function setMeta(key: string, value: string): void {
  const now = nowISO();
  db.insert(appMeta)
    .values({ key, value, updatedAt: now })
    .onConflictDoUpdate({ target: appMeta.key, set: { value, updatedAt: now } })
    .run();
}
