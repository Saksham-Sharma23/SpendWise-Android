import { and, asc, eq, isNull } from 'drizzle-orm';

import { budgets, categories, subscriptions } from '@/db/schema';
import type { AnyDb } from '@/db/types';

/**
 * The notification layer's own reads.
 *
 * Narrower than the Tracker's and Budgets' queries on purpose: a reminder
 * needs a name, an amount and a date, not the category colour or the icon a
 * screen would draw. They live here rather than in either feature because a
 * feature may not import a sibling, and both a transaction write and a
 * subscription write can trigger a notification.
 */

/** Live subscriptions, for cancel-all-and-reschedule. */
export function reminderSubscriptionsQuery(db: AnyDb) {
  return db
    .select({
      id: subscriptions.id,
      name: subscriptions.name,
      amountPaise: subscriptions.amountPaise,
      billingCycle: subscriptions.billingCycle,
      status: subscriptions.status,
      anchorDate: subscriptions.anchorDate,
      reminderDaysBefore: subscriptions.reminderDaysBefore,
    })
    .from(subscriptions)
    .where(isNull(subscriptions.deletedAt))
    .orderBy(asc(subscriptions.id));
}

/**
 * The live budget on one category, with the category's name for the alert
 * text. Returns nothing when the category has no budget, which is the common
 * case and must not cost a query per transaction beyond this one.
 */
export function budgetForAlertQuery(db: AnyDb, categoryId: number) {
  return db
    .select({
      id: budgets.id,
      categoryId: budgets.categoryId,
      categoryName: categories.name,
      limitPaise: budgets.limitPaise,
      resetDay: budgets.resetDay,
      isActive: budgets.isActive,
    })
    .from(budgets)
    .innerJoin(categories, eq(budgets.categoryId, categories.id))
    .where(and(eq(budgets.categoryId, categoryId), isNull(budgets.deletedAt), isNull(categories.deletedAt)))
    .limit(1);
}
