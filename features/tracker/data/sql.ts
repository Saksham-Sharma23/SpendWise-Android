import { and, asc, eq, isNull } from 'drizzle-orm';

import { categories, subscriptions } from '@/db/schema';
import type { AnyDb } from '@/db/types';

/**
 * The Tracker's read builders. Each takes `db`, so tests run this exact SQL.
 *
 * Renewal dates, monthly cost and urgency are NOT stored — they are computed
 * on read in ../domain/renewal.ts, the port of the web app's `_enrich`. That is
 * what makes the feature self-correcting: an app left closed for three months
 * still shows the right next renewal, with no background job to drift.
 */

const columns = {
  id: subscriptions.id,
  name: subscriptions.name,
  amountPaise: subscriptions.amountPaise,
  billingCycle: subscriptions.billingCycle,
  status: subscriptions.status,
  anchorDate: subscriptions.anchorDate,
  categoryId: subscriptions.categoryId,
  reminderDaysBefore: subscriptions.reminderDaysBefore,
  categoryName: categories.name,
  categoryIcon: categories.icon,
  categoryColor: categories.color,
};

/** Every live subscription with its category's look, by name. */
export function subscriptionListQuery(db: AnyDb) {
  return db
    .select(columns)
    .from(subscriptions)
    .leftJoin(categories, eq(subscriptions.categoryId, categories.id))
    .where(isNull(subscriptions.deletedAt))
    .orderBy(asc(subscriptions.name));
}

/** One live subscription, for the edit form. */
export function subscriptionQuery(db: AnyDb, id: number) {
  return db
    .select(columns)
    .from(subscriptions)
    .leftJoin(categories, eq(subscriptions.categoryId, categories.id))
    .where(and(eq(subscriptions.id, id), isNull(subscriptions.deletedAt)))
    .limit(1);
}
