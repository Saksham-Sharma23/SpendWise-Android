import { addDays, addMonthsClamped, daysBetween, fromISODate, todayISO, type ISODate } from './dates';
import { deterministicColor, deterministicIcon } from './identity';

/**
 * Everything derived from a subscription: the one place it is worked out.
 *
 * Nothing here is stored. The next renewal, the days until it, the monthly
 * and yearly equivalents and the urgency band are all computed from
 * `anchorDate` + `billingCycle` on every read. That design is self-correcting
 * — whatever the anchor, the answer is always the next real occurrence — so
 * the app needs no background job to keep renewals current, and this file can
 * be pure and exhaustively tested.
 *
 * It used to live in three places (A10): the cycle maths in `lib/dates.ts`,
 * an enricher in `lib/renewals.ts` for Home, and a second enricher in
 * `features/tracker/domain/renewal.ts`. The two enrichers computed the same
 * fields under different names, and had drifted: an uncategorised
 * subscription drew a generic violet `repeat` icon on Home and a
 * name-derived icon in the Tracker, so the same row looked like two
 * different things on two screens. One `enrich` cannot disagree with itself.
 */

// ---------------------------------------------------------------------------
// Cycles
// ---------------------------------------------------------------------------

export type BillingCycle = 'weekly' | 'monthly' | 'quarterly' | 'yearly';
export type SubscriptionStatus = 'active' | 'paused' | 'cancelled';
export type Urgency = 'ok' | 'soon' | 'muted';

/**
 * Next renewal date, computed on read. Port of the web app's `_enrich`.
 *
 * Advances `anchorDate` by the billing cycle until it lands on or after
 * `today`. Self-correcting, so no background job is needed: whatever the
 * anchor was, the answer is always the next real occurrence.
 *
 * Month-end clamping matters — a subscription anchored on 31 Jan renews on
 * 28 Feb, then 31 Mar, and must not drift to the 28th forever. Anchoring the
 * arithmetic to the ORIGINAL date rather than the last computed one is what
 * prevents that drift.
 */
export function getNextRenewal(anchorDate: ISODate, cycle: BillingCycle, today: ISODate = todayISO()): ISODate {
  if (daysBetween(today, anchorDate) >= 0) return anchorDate;

  if (cycle === 'weekly') {
    const diff = daysBetween(anchorDate, today);
    const weeks = Math.ceil(diff / 7);
    let next = addDays(anchorDate, weeks * 7);
    if (daysBetween(today, next) < 0) next = addDays(next, 7);
    return next;
  }

  const step = cycle === 'monthly' ? 1 : cycle === 'quarterly' ? 3 : 12;

  // Estimate how many steps we need, then walk the last one or two. Always
  // measuring from the original anchor keeps month-end dates from drifting.
  const a = fromISODate(anchorDate);
  const t = fromISODate(today);
  const monthsApart = (t.getFullYear() - a.getFullYear()) * 12 + (t.getMonth() - a.getMonth());

  let n = Math.max(0, Math.floor(monthsApart / step));
  let next = addMonthsClamped(anchorDate, n * step);

  // Walk forward until we are on or after today. Bounded to avoid any chance
  // of an infinite loop on malformed input.
  let guard = 0;
  while (daysBetween(today, next) < 0 && guard < 600) {
    n += 1;
    next = addMonthsClamped(anchorDate, n * step);
    guard += 1;
  }

  return next;
}

/**
 * Urgency band for a renewal countdown. Value names match the web app's
 * ('ok' | 'soon' | 'muted') rather than colour names, so theming can change
 * without the data becoming a lie.
 */
export function getUrgency(daysUntil: number, isActive: boolean): Urgency {
  if (!isActive) return 'muted';
  return daysUntil <= 3 ? 'soon' : 'ok';
}

/**
 * Normalise any billing cycle to a monthly-equivalent cost, in paise.
 *
 * This one ROUNDS: a yearly plan has no exact monthly price, so the figure is
 * a display equivalent. Never multiply it back up — use `toYearlyPaise`.
 */
export function toMonthlyPaise(amountPaise: number, cycle: BillingCycle): number {
  switch (cycle) {
    case 'monthly':
      return amountPaise;
    case 'yearly':
      return Math.round(amountPaise / 12);
    case 'quarterly':
      return Math.round(amountPaise / 3);
    case 'weekly':
      return Math.round((amountPaise * 52) / 12);
  }
}

/**
 * The exact cost of a full year of a billing cycle, in paise.
 *
 * Multiplies the CHARGE, never the rounded monthly equivalent (B3). The old
 * `toMonthlyPaise(x) * 12` turned ₹1,499/year into ₹1,499.04: round(149900/12)
 * = 12492, and 12492 × 12 = 149904. Four paise is nothing as money and a great
 * deal as a signal — it is exactly the drift integer paise exists to prevent,
 * in the Tracker's headline figure.
 */
export function toYearlyPaise(amountPaise: number, cycle: BillingCycle): number {
  switch (cycle) {
    case 'monthly':
      return amountPaise * 12;
    case 'yearly':
      return amountPaise;
    case 'quarterly':
      return amountPaise * 4;
    case 'weekly':
      return amountPaise * 52;
  }
}

// ---------------------------------------------------------------------------
// The one enricher
// ---------------------------------------------------------------------------

/** The least a row must carry for its renewal facts to be derivable. */
export interface RenewalInput {
  name: string;
  amountPaise: number;
  billingCycle: BillingCycle;
  status: SubscriptionStatus;
  anchorDate: ISODate;
  categoryIcon: string | null;
  categoryColor: string | null;
}

/** What `enrich` adds. Every screen reads these under the SAME names. */
export interface RenewalFacts {
  nextRenewal: ISODate;
  daysUntil: number;
  /** The cycle amount normalised to a month, so a yearly and a weekly compare. */
  monthlyCostPaise: number;
  yearlyCostPaise: number;
  urgency: Urgency;
  /** Category look when set, otherwise derived from the name — never persisted. */
  icon: string;
  color: string;
}

export type Enriched<T extends RenewalInput> = T & RenewalFacts;

/**
 * Generic in the row, so a caller keeps its own extra columns: the Tracker's
 * `categoryId` and `reminderDaysBefore` pass straight through, and Home's
 * narrower row needs no padding to fit. Both get identical renewal facts,
 * which is the whole point.
 */
export function enrich<T extends RenewalInput>(row: T, today: ISODate = todayISO()): Enriched<T> {
  const nextRenewal = getNextRenewal(row.anchorDate, row.billingCycle, today);
  const daysUntil = daysBetween(today, nextRenewal);

  return {
    ...row,
    nextRenewal,
    daysUntil,
    monthlyCostPaise: toMonthlyPaise(row.amountPaise, row.billingCycle),
    // From the CHARGE, never ×12 of the rounded monthly equivalent (B3):
    // a yearly plan's yearly cost IS the charge, to the paisa.
    yearlyCostPaise: toYearlyPaise(row.amountPaise, row.billingCycle),
    // Only an active subscription renews; paused and cancelled read as muted.
    urgency: getUrgency(daysUntil, row.status === 'active'),
    // Derived from the NAME when there is no category, so an uncategorised
    // subscription still gets a stable look of its own — and the same one
    // everywhere it appears.
    icon: row.categoryIcon ?? deterministicIcon(row.name),
    color: row.categoryColor ?? deterministicColor(row.name),
  };
}

/**
 * Active subscriptions, soonest first, at most `limit` — what Home shows.
 *
 * Paused and cancelled ones do not renew, so they are not "upcoming". Ties
 * break by name so the order is stable between renders.
 */
export function upcomingRenewals<T extends RenewalInput>(rows: T[], today: ISODate, limit = 3): Enriched<T>[] {
  return rows
    .filter((r) => r.status === 'active')
    .map((r) => enrich(r, today))
    .sort((a, b) => a.daysUntil - b.daysUntil || a.name.localeCompare(b.name))
    .slice(0, limit);
}

/** "Today", "Tomorrow", "in 5 days". */
export function renewalCountdown(daysUntil: number): string {
  if (daysUntil <= 0) return 'Today';
  if (daysUntil === 1) return 'Tomorrow';
  return `in ${daysUntil} days`;
}
