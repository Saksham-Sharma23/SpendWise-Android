import { nowISO } from '@/lib/dates';
import { db } from './client';
import { reconcileSystemCategories } from './seedCore';
import { SCHEMA_VERSION, SEED_VERSION, SYSTEM_CATEGORIES } from './seedData';

/**
 * System categories, reconciled at every launch (the list is db/seedData.ts).
 *
 * A fresh install with no categories cannot record a transaction at all, so
 * this is part of the launch sequence, behind the splash with migrations.
 *
 * `app_meta` reads and writes used to live here too, so the dashboard imported
 * the SEEDER to dismiss onboarding. They are in db/meta.ts and data/meta.ts now.
 */

/** Idempotent, synchronous, atomic. Cheap when nothing is due: one indexed read. */
export function seedIfNeeded(): { inserted: number } {
  const { inserted } = reconcileSystemCategories(db, SYSTEM_CATEGORIES, SEED_VERSION, SCHEMA_VERSION, nowISO());
  return { inserted };
}
