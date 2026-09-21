import {
  enrich,
  getNextRenewal,
  getUrgency,
  renewalCountdown,
  toMonthlyPaise,
  toYearlyPaise,
  upcomingRenewals,
  type RenewalInput,
} from '../subscriptions';
import { daysBetween } from '../dates';
import { deterministicColor, deterministicIcon } from '../identity';

/**
 * The one renewal domain (A10). These tests used to live in two files —
 * `dates.test.ts` for the cycle maths and `renewals.test.ts` for the Home
 * enricher — because the code did too.
 */

interface Row extends RenewalInput {
  id: number;
}

describe('getNextRenewal — the self-correcting calculation', () => {
  it('returns the anchor when it is still in the future', () => {
    expect(getNextRenewal('2026-06-15', 'monthly', '2026-03-01')).toBe('2026-06-15');
  });

  it('returns today when the anchor is today', () => {
    expect(getNextRenewal('2026-03-15', 'monthly', '2026-03-15')).toBe('2026-03-15');
  });

  it('advances a monthly cycle past a long-stale anchor', () => {
    expect(getNextRenewal('2024-01-10', 'monthly', '2026-03-15')).toBe('2026-04-10');
  });

  it('clamps a 31st anchor into February', () => {
    expect(getNextRenewal('2026-01-31', 'monthly', '2026-02-01')).toBe('2026-02-28');
    expect(getNextRenewal('2028-01-31', 'monthly', '2028-02-01')).toBe('2028-02-29');
  });

  it('recovers the 31st after a clamped month — no permanent drift', () => {
    // This is the failure the web app's _enrich was written to avoid.
    expect(getNextRenewal('2026-01-31', 'monthly', '2026-03-01')).toBe('2026-03-31');
  });

  it('handles quarterly and yearly cycles', () => {
    expect(getNextRenewal('2026-01-15', 'quarterly', '2026-02-01')).toBe('2026-04-15');
    expect(getNextRenewal('2026-01-15', 'quarterly', '2026-05-01')).toBe('2026-07-15');
    expect(getNextRenewal('2024-03-10', 'yearly', '2026-03-15')).toBe('2027-03-10');
  });

  it('handles a yearly 29 Feb anchor in a non-leap year', () => {
    expect(getNextRenewal('2028-02-29', 'yearly', '2029-01-01')).toBe('2029-02-28');
  });

  it('handles weekly cycles', () => {
    expect(getNextRenewal('2026-03-01', 'weekly', '2026-03-10')).toBe('2026-03-15');
    expect(getNextRenewal('2026-03-01', 'weekly', '2026-03-08')).toBe('2026-03-08');
  });

  it('always returns a date on or after today', () => {
    const anchors = ['2020-01-31', '2023-02-28', '2025-12-31', '2019-06-15'];
    const cycles = ['weekly', 'monthly', 'quarterly', 'yearly'] as const;
    for (const anchor of anchors) {
      for (const cycle of cycles) {
        const next = getNextRenewal(anchor, cycle, '2026-09-11');
        expect(daysBetween('2026-09-11', next)).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe('getUrgency', () => {
  it('mutes inactive subscriptions regardless of date', () => {
    expect(getUrgency(1, false)).toBe('muted');
    expect(getUrgency(90, false)).toBe('muted');
  });

  it('flags the next three days as soon', () => {
    expect(getUrgency(0, true)).toBe('soon');
    expect(getUrgency(3, true)).toBe('soon');
    expect(getUrgency(4, true)).toBe('ok');
  });
});

describe('toMonthlyPaise', () => {
  it('normalises every cycle to a monthly equivalent', () => {
    expect(toMonthlyPaise(49900, 'monthly')).toBe(49900);
    expect(toMonthlyPaise(599000, 'yearly')).toBe(49917);
    expect(toMonthlyPaise(150000, 'quarterly')).toBe(50000);
    expect(toMonthlyPaise(10000, 'weekly')).toBe(43333);
  });

  it('returns integers — never a fractional paise', () => {
    for (const cycle of ['monthly', 'yearly', 'quarterly', 'weekly'] as const) {
      expect(Number.isInteger(toMonthlyPaise(99999, cycle))).toBe(true);
    }
  });
});

describe('toYearlyPaise', () => {
  it('multiplies the charge, so a yearly plan costs exactly its price', () => {
    expect(toYearlyPaise(149900, 'yearly')).toBe(149900);
    expect(toYearlyPaise(49900, 'monthly')).toBe(49900 * 12);
    expect(toYearlyPaise(19900, 'quarterly')).toBe(19900 * 4);
    expect(toYearlyPaise(9900, 'weekly')).toBe(9900 * 52);
  });

  /**
   * The B3 bug in one line: the old code went through the rounded monthly
   * equivalent, which turned ₹1,499 into ₹1,499.04.
   */
  it('never round-trips through the monthly equivalent', () => {
    expect(toMonthlyPaise(149900, 'yearly') * 12).toBe(149904);
    expect(toYearlyPaise(149900, 'yearly')).toBe(149900);
  });

  it('is exact for every amount and cycle', () => {
    for (let paise = 1; paise < 200000; paise += 997) {
      expect(toYearlyPaise(paise, 'yearly')).toBe(paise);
      expect(Number.isInteger(toYearlyPaise(paise, 'weekly'))).toBe(true);
    }
  });
});

const sub = (over: Partial<Row>): Row => ({
  id: 1,
  name: 'Netflix',
  amountPaise: 64900,
  billingCycle: 'monthly',
  status: 'active',
  anchorDate: '2026-01-20',
  categoryIcon: 'clapperboard',
  categoryColor: '#8B5FBF',
  ...over,
});

describe('upcomingRenewals', () => {
  const today = '2026-09-14';

  it('computes the next date from the anchor, soonest first', () => {
    const list = upcomingRenewals(
      [
        sub({ id: 1, name: 'Netflix', anchorDate: '2026-01-20' }), // → 20 Sep, 6 days
        sub({ id: 2, name: 'Gym', anchorDate: '2026-03-15' }), // → 15 Sep, 1 day
        sub({ id: 3, name: 'Domain', billingCycle: 'yearly', anchorDate: '2025-10-01' }), // → 1 Oct, 17 days
      ],
      today,
    );
    expect(list.map((s) => [s.name, s.nextRenewal, s.daysUntil])).toEqual([
      ['Gym', '2026-09-15', 1],
      ['Netflix', '2026-09-20', 6],
      ['Domain', '2026-10-01', 17],
    ]);
  });

  it('skips paused and cancelled subscriptions', () => {
    const list = upcomingRenewals(
      [sub({ id: 1, status: 'paused' }), sub({ id: 2, status: 'cancelled' }), sub({ id: 3, name: 'Spotify' })],
      today,
    );
    expect(list.map((s) => s.name)).toEqual(['Spotify']);
  });

  it('marks renewals within three days as soon', () => {
    const [gym] = upcomingRenewals([sub({ name: 'Gym', anchorDate: '2026-03-16' })], today);
    expect(gym!.urgency).toBe('soon');
    const [later] = upcomingRenewals([sub({ anchorDate: '2026-01-30' })], today);
    expect(later!.urgency).toBe('ok');
  });

  it('limits the list and breaks ties by name', () => {
    const list = upcomingRenewals(
      [sub({ id: 1, name: 'B' }), sub({ id: 2, name: 'A' }), sub({ id: 3, name: 'C' }), sub({ id: 4, name: 'D' })],
      today,
      2,
    );
    expect(list.map((s) => s.name)).toEqual(['A', 'B']);
  });

  it('counts a renewal due today as zero days', () => {
    const [s] = upcomingRenewals([sub({ anchorDate: '2026-08-14' })], today);
    expect(s!.daysUntil).toBe(0);
  });
});

describe('renewalCountdown', () => {
  it('reads naturally', () => {
    expect(renewalCountdown(0)).toBe('Today');
    expect(renewalCountdown(1)).toBe('Tomorrow');
    expect(renewalCountdown(12)).toBe('in 12 days');
  });
});

describe('enrich — one set of facts, under one set of names', () => {
  const TODAY = '2026-03-15';

  const row = (over: Partial<RenewalInput> = {}): RenewalInput => ({
    name: 'Netflix',
    amountPaise: 64900,
    billingCycle: 'monthly',
    status: 'active',
    anchorDate: '2026-03-10',
    categoryIcon: null,
    categoryColor: null,
    ...over,
  });

  it('carries the row through and adds every derived field', () => {
    const e = enrich(row(), TODAY);
    expect(e.name).toBe('Netflix');
    expect(e.nextRenewal).toBe('2026-04-10');
    expect(e.daysUntil).toBe(26);
    expect(e.monthlyCostPaise).toBe(64900);
    expect(e.yearlyCostPaise).toBe(64900 * 12);
    expect(e.urgency).toBe('ok');
  });

  it('falls back to a NAME-derived icon and colour, not a generic one', () => {
    // This is the drift A10 existed to remove: Home drew a generic violet
    // `repeat` icon for every uncategorised subscription while the Tracker
    // drew a name-derived one, so one row looked like two different things on
    // two screens. One enricher cannot disagree with itself — but only if the
    // fallback is the shared one, which is what this asserts.
    const e = enrich(row(), TODAY);
    expect(e.icon).toBe(deterministicIcon('Netflix'));
    expect(e.color).toBe(deterministicColor('Netflix'));
  });

  it("prefers the category's own icon and colour when there is one", () => {
    const e = enrich(row({ categoryIcon: 'film', categoryColor: '#ff0000' }), TODAY);
    expect(e.icon).toBe('film');
    expect(e.color).toBe('#ff0000');
  });

  it('takes the yearly cost from the charge, never x12 of the monthly (B3)', () => {
    const e = enrich(row({ amountPaise: 119900, billingCycle: 'yearly' }), TODAY);
    expect(e.yearlyCostPaise).toBe(119900);
    expect(e.monthlyCostPaise).toBe(9992);
    // 9992 x 12 = 119904. Four paise of rounding error, which is exactly why
    // the yearly figure must come from the charge.
    expect(e.monthlyCostPaise * 12).not.toBe(e.yearlyCostPaise);
  });

  it('bands urgency, and mutes anything that is not active', () => {
    expect(enrich(row({ anchorDate: '2026-03-17' }), TODAY).urgency).toBe('soon');
    expect(enrich(row({ anchorDate: '2026-03-17', status: 'paused' }), TODAY).urgency).toBe('muted');
    expect(enrich(row({ status: 'cancelled' }), TODAY).urgency).toBe('muted');
  });
});
