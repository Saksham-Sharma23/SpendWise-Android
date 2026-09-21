import { db } from '@/db/client';
import { META_KEYS, readMeta } from '@/data/meta';
import { budgetSpend } from '@/data/ledger';
import { budgetRatio, budgetState } from '@/data/ledger/budgetState';
import { getCycleWindow, todayISO } from '@/lib/dates';
import { formatINR } from '@/lib/money';
import {
  ensureChannels,
  notifyNow,
  planBackupNudge,
  planBudgetAlert,
  planRenewalReminders,
  reschedule,
  type PlannedNotification,
} from '@/lib/notifications';
import { enrich } from '@/lib/subscriptions';
import { alreadyNotified, rememberNotified } from './memory';
import { budgetForAlertQuery, reminderSubscriptionsQuery } from './sql';

/**
 * Where the notification layer meets the database.
 *
 * Nothing here decides anything: the reads are in `sql.ts`, the judgements
 * are in `lib/notifications/plan.ts`, and this file carries data between
 * them. That is what lets every rule about when a reminder fires be tested
 * in Node without a device.
 *
 * **Every entry point swallows its own errors.** A notification is a
 * courtesy; the write that triggered it is the product. A reminder that
 * cannot be scheduled must never surface as a failed save.
 */

export { forgetAllBudgetAlerts } from './memory';

/**
 * Cancel everything and schedule it again from current data.
 *
 * Called after ANY subscription write and at boot. Never a diff: the app's
 * idea of what is pending and Android's drift apart on every reboot,
 * force-stop, restore and clock change, and reconciling them is more code
 * than simply rebuilding the list.
 */
export async function rescheduleAll(): Promise<number> {
  try {
    await ensureChannels();
    const today = todayISO();

    const rows = await reminderSubscriptionsQuery(db);
    const subs = rows.map((r) => ({
      id: r.id,
      name: r.name,
      amountPaise: r.amountPaise,
      status: r.status,
      reminderDaysBefore: r.reminderDaysBefore,
      // The next renewal is never stored — computed here from the anchor,
      // through the same enrich() the Tracker and Home use.
      nextRenewal: enrich(
        {
          name: r.name,
          amountPaise: r.amountPaise,
          billingCycle: r.billingCycle,
          status: r.status,
          anchorDate: r.anchorDate,
          categoryIcon: null,
          categoryColor: null,
        },
        today,
      ).nextRenewal,
    }));

    const planned: PlannedNotification[] = planRenewalReminders(subs, today, formatINR);

    const nudge = planBackupNudge(readMeta(db, META_KEYS.LAST_BACKUP_AT), today);
    if (nudge) planned.push(nudge);

    return await reschedule(planned);
  } catch {
    // A reminder that cannot be scheduled is not worth a crash.
    return 0;
  }
}

/**
 * After a transaction write, tell the user if its category just crossed a
 * budget threshold.
 *
 * Runs on the ONE category that was touched, not every budget: a write
 * cannot change the spend of a category it did not involve, and checking all
 * of them would put a table scan behind every save.
 */
export async function checkBudgetAfterWrite(categoryId: number | null): Promise<boolean> {
  if (categoryId == null) return false;
  try {
    const [budget] = await budgetForAlertQuery(db, categoryId);
    if (!budget || !budget.isActive) return false;

    const today = todayISO();
    const window = getCycleWindow(budget.resetDay, today);
    const [spend] = await budgetSpend(db, [{ categoryId, start: window.start, end: window.end }]);
    const spentPaise = spend?.spentPaise ?? 0;

    const ratio = budgetRatio(spentPaise, budget.limitPaise);
    const alert = planBudgetAlert({
      categoryId,
      categoryName: budget.categoryName,
      // The threshold judgement stays in data/ledger, where the Budgets
      // screen and Home already read it. One definition, three consumers.
      state: budgetState(ratio, budget.isActive),
      ratio,
      alreadyNotified: alreadyNotified(categoryId, window.start),
    });
    if (!alert) return false;

    await notifyNow(alert);
    rememberNotified(categoryId, window.start, alert.level);
    return true;
  } catch {
    return false;
  }
}

/** Boot: channels must exist before anything can post to them. */
export async function initNotifications(): Promise<void> {
  try {
    await ensureChannels();
  } catch {
    // An app that cannot create channels still works; it just stays quiet.
  }
}
