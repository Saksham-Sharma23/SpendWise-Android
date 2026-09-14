import { daysBetween, getNextRenewal, getUrgency, type BillingCycle, type ISODate, type Urgency } from './dates';

/**
 * Upcoming renewals for the Home card — pure, so ordering and countdowns are
 * tested without a database.
 *
 * Renewal dates are never stored: each is computed on read from the anchor
 * date and cycle (lib/dates `getNextRenewal`), which is self-correcting — an
 * app left closed for three months still shows the right next date.
 */

export interface SubscriptionLike {
  id: number;
  name: string;
  amountPaise: number;
  billingCycle: BillingCycle;
  status: 'active' | 'paused' | 'cancelled';
  anchorDate: ISODate;
  categoryIcon: string | null;
  categoryColor: string | null;
}

export interface UpcomingRenewal extends SubscriptionLike {
  nextDate: ISODate;
  daysUntil: number;
  urgency: Urgency;
}

/**
 * Active subscriptions, soonest first, at most `limit`. Paused and cancelled
 * ones do not renew, so they are not "upcoming". Ties break by name so the
 * order is stable between renders.
 */
export function upcomingRenewals(subs: SubscriptionLike[], today: ISODate, limit = 3): UpcomingRenewal[] {
  return subs
    .filter((s) => s.status === 'active')
    .map((s) => {
      const nextDate = getNextRenewal(s.anchorDate, s.billingCycle, today);
      const daysUntil = daysBetween(today, nextDate);
      return { ...s, nextDate, daysUntil, urgency: getUrgency(daysUntil, true) };
    })
    .sort((a, b) => a.daysUntil - b.daysUntil || a.name.localeCompare(b.name))
    .slice(0, limit);
}

/** "Today", "Tomorrow", "in 5 days". */
export function renewalCountdown(daysUntil: number): string {
  if (daysUntil <= 0) return 'Today';
  if (daysUntil === 1) return 'Tomorrow';
  return `in ${daysUntil} days`;
}
