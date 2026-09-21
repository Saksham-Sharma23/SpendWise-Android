import { addDays, daysBetween, todayISO, type ISODate } from '../dates';

/**
 * WHAT to notify and WHEN — all of it pure, so every judgement in the
 * notification layer is decided here and tested in Node.
 *
 * The runtime (`runtime.ts`) only carries these out. That split matters
 * because a reminder that fires on the wrong morning, twice, or for a
 * subscription that was cancelled is invisible in a unit test of the native
 * calls but obvious in a test of the plan.
 *
 * Nothing here imports expo-notifications, React Native or the database.
 * `lib` may only import `lib` (eslint.config.js), which is also why the
 * budget THRESHOLD is not re-derived here: `data/ledger/budgetState.ts`
 * already owns and tests that judgement, so the caller passes its answer in.
 * Importing it would have duplicated the decision point, not shared it.
 */

// ---------------------------------------------------------------------------
// Channels
// ---------------------------------------------------------------------------

/**
 * Android drops a post to a channel that does not exist, SILENTLY. Creating
 * them is the first thing the app does with notifications, and these ids are
 * the contract between that call and every `schedule` below.
 */
export const CHANNELS = {
  renewals: 'renewals',
  budgets: 'budget-alerts',
  backup: 'backup',
} as const;

export type ChannelId = (typeof CHANNELS)[keyof typeof CHANNELS];

export interface ChannelSpec {
  id: ChannelId;
  name: string;
  description: string;
  /** Android importance: 3 = default (sound, no heads-up), 4 = high. */
  importance: 3 | 4;
}

/**
 * Three channels, so someone who wants renewal reminders but not budget
 * nagging can have exactly that in Android's own settings. One channel for
 * everything would make it an all-or-nothing choice.
 */
export const CHANNEL_SPECS: readonly ChannelSpec[] = [
  {
    id: CHANNELS.renewals,
    name: 'Renewals',
    description: 'A reminder before a subscription renews.',
    importance: 4,
  },
  {
    id: CHANNELS.budgets,
    name: 'Budget alerts',
    description: 'When a category passes 75% or 100% of its limit.',
    importance: 3,
  },
  {
    id: CHANNELS.backup,
    name: 'Backup',
    description: 'A monthly nudge when you have not exported your data in a while.',
    importance: 3,
  },
];

// ---------------------------------------------------------------------------
// The shape of a planned notification
// ---------------------------------------------------------------------------

export interface PlannedNotification {
  /**
   * Stable across reschedules, so a cancel-all-then-schedule cannot leave a
   * duplicate behind and a test can assert on identity rather than order.
   */
  id: string;
  channel: ChannelId;
  title: string;
  body: string;
  /** Local wall-clock date the notification should fire on. */
  date: ISODate;
  /** Hour of the local day, 0–23. */
  hour: number;
  /** Deep link to open when tapped. */
  url?: string;
}

/**
 * 09:00 local. Early enough to act on before the day gets away, late enough
 * not to wake anyone. Deliberately an INEXACT alarm: `SCHEDULE_EXACT_ALARM`
 * is scrutinised by Play review and a reminder that lands at 09:07 is not
 * worse than one at 09:00.
 */
export const NOTIFY_HOUR = 9;

// ---------------------------------------------------------------------------
// Renewal reminders
// ---------------------------------------------------------------------------

export interface RenewalReminderInput {
  id: number;
  name: string;
  amountPaise: number;
  /** Next renewal, already computed by lib/subscriptions. */
  nextRenewal: ISODate;
  status: 'active' | 'paused' | 'cancelled';
  /** Days before the renewal to remind. 0 means on the day. */
  reminderDaysBefore: number;
}

/**
 * One reminder per active subscription, `reminderDaysBefore` ahead of its
 * next renewal.
 *
 * Paused and cancelled subscriptions are skipped: they have a computed
 * renewal date like any other row, but it is not going to happen, and a
 * reminder for a cancelled subscription is worse than no reminder at all.
 *
 * A reminder whose date has already passed is dropped rather than fired
 * immediately — waking someone at 14:00 about a renewal that was this
 * morning helps nobody. The next write reschedules it from the new date.
 */
export function planRenewalReminders(
  subs: readonly RenewalReminderInput[],
  today: ISODate = todayISO(),
  formatAmount: (paise: number) => string = (p) => String(p),
): PlannedNotification[] {
  const out: PlannedNotification[] = [];

  for (const s of subs) {
    if (s.status !== 'active') continue;

    const lead = Number.isFinite(s.reminderDaysBefore) ? Math.max(0, Math.trunc(s.reminderDaysBefore)) : 0;
    const date = addDays(s.nextRenewal, -lead);

    // Already gone. A write reschedules from the next occurrence.
    if (daysBetween(today, date) < 0) continue;

    out.push({
      id: `renewal:${s.id}`,
      channel: CHANNELS.renewals,
      title: lead === 0 ? `${s.name} renews today` : `${s.name} renews ${inDays(lead)}`,
      body: `${formatAmount(s.amountPaise)} · ${s.nextRenewal}`,
      date,
      hour: NOTIFY_HOUR,
      url: '/tracker',
    });
  }

  return out;
}

function inDays(n: number): string {
  if (n === 1) return 'tomorrow';
  return `in ${n} days`;
}

// ---------------------------------------------------------------------------
// Budget alerts
// ---------------------------------------------------------------------------

export type BudgetAlertLevel = 'warning' | 'over';

export interface BudgetAlertInput {
  categoryId: number;
  categoryName: string;
  /** From `data/ledger/budgetState.budgetState()` — not recomputed here. */
  state: 'under' | 'warning' | 'over' | 'paused';
  /** From `budgetRatio()`. Used only for the wording. */
  ratio: number;
  /**
   * The level already announced for this budget in this cycle, if any.
   * Without it, every transaction after 75% would fire the same alert again.
   */
  alreadyNotified: BudgetAlertLevel | null;
}

/**
 * At most one alert per budget per cycle step.
 *
 * Crossing 75% announces once; crossing 100% announces once more. Spending
 * further past either does nothing, which is what makes this a signal rather
 * than a nag — the single most likely way to get notifications turned off is
 * to fire on every transaction after a threshold.
 *
 * `alreadyNotified` is the caller's memory of what it has sent. Returning
 * null means "nothing to say", not "nothing is wrong".
 */
export function planBudgetAlert(b: BudgetAlertInput): (PlannedNotification & { level: BudgetAlertLevel }) | null {
  const level: BudgetAlertLevel | null = b.state === 'over' ? 'over' : b.state === 'warning' ? 'warning' : null;
  if (!level) return null;

  // Never repeat a level, and never go backwards: once 'over' has been sent,
  // dropping back under 100% (an edit, a delete) must not re-announce 75%.
  if (b.alreadyNotified === level) return null;
  if (b.alreadyNotified === 'over') return null;

  const pct = Math.round(b.ratio * 100);
  return {
    id: `budget:${b.categoryId}`,
    channel: CHANNELS.budgets,
    level,
    title: level === 'over' ? `${b.categoryName} is over budget` : `${b.categoryName} is at ${pct}%`,
    body:
      level === 'over'
        ? `You have spent ${pct}% of this cycle's limit.`
        : `${pct}% of this cycle's limit is gone. ${100 - pct}% left.`,
    // Fired in response to a write, so it goes out now rather than at 09:00.
    date: todayISO(),
    hour: -1,
    url: '/budgets',
  };
}

// ---------------------------------------------------------------------------
// Backup nudge
// ---------------------------------------------------------------------------

/**
 * Past this many days without an export, the nudge fires. Same number as
 * `STALE_AFTER_DAYS` in db/backup/history.ts — the screen that says "you have
 * not backed up in a while" and the notification that says it must not be
 * able to disagree.
 */
export const BACKUP_STALE_DAYS = 30;

/**
 * A single monthly nudge, scheduled for `BACKUP_STALE_DAYS` after the last
 * export — or tomorrow, if that moment has already passed.
 *
 * Returns null when a backup is recent enough, so "no notification" is the
 * default state rather than something the caller has to remember to cancel.
 */
export function planBackupNudge(lastBackupAt: string | null, today: ISODate = todayISO()): PlannedNotification | null {
  const never = !lastBackupAt;
  let date: ISODate;

  if (never) {
    // Someone who has never exported is the person who most needs this, but
    // a nudge on day one is noise: give them a month of using the app first.
    date = addDays(today, BACKUP_STALE_DAYS);
  } else {
    const last = lastBackupAt.slice(0, 10) as ISODate;
    const due = addDays(last, BACKUP_STALE_DAYS);
    // Already overdue: tomorrow morning, not this instant.
    date = daysBetween(today, due) < 0 ? addDays(today, 1) : due;
  }

  return {
    id: 'backup:nudge',
    channel: CHANNELS.backup,
    title: never ? 'Back up your data' : 'Time for a backup',
    body: never
      ? 'SpendWise keeps everything on this phone. An export is the only copy you can rely on.'
      : `Your last export was over ${BACKUP_STALE_DAYS} days ago.`,
    date,
    hour: NOTIFY_HOUR,
    url: '/backup',
  };
}
