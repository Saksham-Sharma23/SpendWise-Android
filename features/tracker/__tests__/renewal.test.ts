import { ICON_NAMES } from '../../../lib/icons';
import { deterministicColor, deterministicIcon, initials } from '../identity';
import { arrange, enrich, summarise, type SubscriptionRow } from '../renewal';

/**
 * The renewal port is the code that "looks right and is wrong four months
 * later" (TASKS.md, Phase 4). It is pure, so the month-end and leap-year
 * cases that break it are cheap to pin down here.
 */

const sub = (over: Partial<SubscriptionRow> = {}): SubscriptionRow => ({
  id: 1,
  name: 'Netflix',
  amountPaise: 649_00,
  billingCycle: 'monthly',
  status: 'active',
  anchorDate: '2026-01-05',
  categoryId: null,
  reminderDaysBefore: 2,
  categoryName: null,
  categoryIcon: null,
  categoryColor: null,
  ...over,
});

describe('enrich — renewal computed on read', () => {
  it('advances a stale anchor to the next real occurrence', () => {
    const e = enrich(sub({ anchorDate: '2025-03-10' }), '2026-09-14');
    expect(e.nextRenewal).toBe('2026-10-10');
    expect(e.daysUntilRenewal).toBe(26);
  });

  it('keeps a future anchor as the next renewal', () => {
    const e = enrich(sub({ anchorDate: '2026-12-01' }), '2026-09-14');
    expect(e.nextRenewal).toBe('2026-12-01');
  });

  it('renews today when the anchor is today', () => {
    const e = enrich(sub({ anchorDate: '2026-09-14' }), '2026-09-14');
    expect(e.nextRenewal).toBe('2026-09-14');
    expect(e.daysUntilRenewal).toBe(0);
    expect(e.urgency).toBe('soon');
  });

  it('clamps a 31 Jan anchor into February and recovers in March', () => {
    expect(enrich(sub({ anchorDate: '2026-01-31' }), '2026-02-15').nextRenewal).toBe('2026-02-28');
    // The month-end date must come back, not stay stuck on the 28th.
    expect(enrich(sub({ anchorDate: '2026-01-31' }), '2026-03-01').nextRenewal).toBe('2026-03-31');
  });

  it('handles a 29 Feb yearly anchor in a non-leap year', () => {
    const e = enrich(sub({ anchorDate: '2024-02-29', billingCycle: 'yearly' }), '2026-01-01');
    expect(e.nextRenewal).toBe('2026-02-28');
  });

  it('recovers 29 Feb at the next leap year', () => {
    const e = enrich(sub({ anchorDate: '2024-02-29', billingCycle: 'yearly' }), '2028-01-01');
    expect(e.nextRenewal).toBe('2028-02-29');
  });

  it('handles quarterly across a year boundary', () => {
    const e = enrich(sub({ anchorDate: '2025-11-30', billingCycle: 'quarterly' }), '2026-09-14');
    expect(e.nextRenewal).toBe('2026-11-30');
  });

  it('handles weekly cycles', () => {
    const e = enrich(sub({ anchorDate: '2026-09-01', billingCycle: 'weekly' }), '2026-09-14');
    expect(e.nextRenewal).toBe('2026-09-15');
  });
});

describe('enrich — cost normalisation', () => {
  it('normalises every cycle to a monthly equivalent', () => {
    expect(enrich(sub({ amountPaise: 199_00 }), '2026-09-14').monthlyCostPaise).toBe(199_00);
    expect(enrich(sub({ amountPaise: 1_499_00, billingCycle: 'yearly' }), '2026-09-14').monthlyCostPaise).toBe(
      Math.round(1_499_00 / 12),
    );
    expect(enrich(sub({ amountPaise: 900_00, billingCycle: 'quarterly' }), '2026-09-14').monthlyCostPaise).toBe(300_00);
    expect(enrich(sub({ amountPaise: 100_00, billingCycle: 'weekly' }), '2026-09-14').monthlyCostPaise).toBe(
      Math.round((100_00 * 52) / 12),
    );
  });

  it('keeps costs as integer paise — a fractional paise cannot exist', () => {
    const e = enrich(sub({ amountPaise: 1_499_00, billingCycle: 'yearly' }), '2026-09-14');
    expect(Number.isInteger(e.monthlyCostPaise)).toBe(true);
    expect(Number.isInteger(e.yearlyCostPaise)).toBe(true);
  });
});

describe('enrich — urgency', () => {
  it('flags the next three days as soon', () => {
    expect(enrich(sub({ anchorDate: '2026-09-17' }), '2026-09-14').urgency).toBe('soon');
    expect(enrich(sub({ anchorDate: '2026-09-18' }), '2026-09-14').urgency).toBe('ok');
  });

  it('mutes paused and cancelled subscriptions whatever the date', () => {
    expect(enrich(sub({ status: 'paused', anchorDate: '2026-09-14' }), '2026-09-14').urgency).toBe('muted');
    expect(enrich(sub({ status: 'cancelled', anchorDate: '2026-09-14' }), '2026-09-14').urgency).toBe('muted');
  });
});

describe('enrich — look', () => {
  it('prefers the category icon and colour when there is one', () => {
    const e = enrich(sub({ categoryIcon: 'utensils', categoryColor: '#123456' }), '2026-09-14');
    expect(e.icon).toBe('utensils');
    expect(e.color).toBe('#123456');
  });

  it('falls back to a deterministic look derived from the name', () => {
    const e = enrich(sub({ name: 'Netflix' }), '2026-09-14');
    expect(e.icon).toBe('clapperboard');
    expect(e.color).toBe(deterministicColor('Netflix'));
  });
});

describe('arrange — status filter and sort', () => {
  const today = '2026-09-14';
  const rows = [
    enrich(sub({ id: 1, name: 'Spotify', amountPaise: 119_00, anchorDate: '2026-09-20' }), today),
    enrich(sub({ id: 2, name: 'Netflix', amountPaise: 649_00, anchorDate: '2026-09-16' }), today),
    enrich(sub({ id: 3, name: 'Gym', amountPaise: 12_000_00, billingCycle: 'yearly', anchorDate: '2026-10-01' }), today),
    enrich(sub({ id: 4, name: 'Old thing', status: 'cancelled', anchorDate: '2026-09-15' }), today),
    enrich(sub({ id: 5, name: 'Paused thing', status: 'paused', anchorDate: '2026-09-15' }), today),
  ];

  it('filters by status', () => {
    expect(arrange(rows, 'active', 'renewal').map((r) => r.id)).toEqual([2, 1, 3]);
    expect(arrange(rows, 'paused', 'renewal').map((r) => r.id)).toEqual([5]);
    expect(arrange(rows, 'cancelled', 'renewal').map((r) => r.id)).toEqual([4]);
  });

  it('sorts by amount using the MONTHLY equivalent, not the charge', () => {
    // The ₹12,000 yearly gym is ₹1,000/month, so it outranks Netflix.
    expect(arrange(rows, 'active', 'amount').map((r) => r.id)).toEqual([3, 2, 1]);
  });

  it('sorts by name', () => {
    expect(arrange(rows, 'active', 'name').map((r) => r.name)).toEqual(['Gym', 'Netflix', 'Spotify']);
  });

  it('puts cancelled last under "all" — their renewal is never going to happen', () => {
    const ids = arrange(rows, 'all', 'renewal').map((r) => r.id);
    expect(ids[ids.length - 1]).toBe(4);
    expect(ids.indexOf(5)).toBeGreaterThan(ids.indexOf(1));
  });

  it('does not mutate the array it was given', () => {
    const before = rows.map((r) => r.id);
    arrange(rows, 'all', 'name');
    expect(rows.map((r) => r.id)).toEqual(before);
  });
});

describe('summarise', () => {
  const today = '2026-09-14';

  it('totals only active subscriptions', () => {
    const rows = [
      enrich(sub({ id: 1, amountPaise: 200_00, anchorDate: '2026-09-20' }), today),
      enrich(sub({ id: 2, amountPaise: 1_200_00, billingCycle: 'yearly', anchorDate: '2026-09-15' }), today),
      enrich(sub({ id: 3, amountPaise: 999_00, status: 'cancelled', anchorDate: '2026-09-15' }), today),
    ];
    const s = summarise(rows);
    expect(s.monthlyTotalPaise).toBe(200_00 + 100_00);
    expect(s.yearlyTotalPaise).toBe((200_00 + 100_00) * 12);
    expect(s.activeCount).toBe(2);
    expect(s.dueSoonCount).toBe(1);
    expect(s.next?.id).toBe(2);
  });

  it('is all zeros with nothing to track', () => {
    expect(summarise([])).toEqual({
      monthlyTotalPaise: 0,
      yearlyTotalPaise: 0,
      activeCount: 0,
      dueSoonCount: 0,
      next: null,
    });
  });
});

describe('identity — deterministic look (group-utils port)', () => {
  it('gives the same name the same icon and colour every time', () => {
    expect(deterministicIcon('Some Local Service')).toBe(deterministicIcon('Some Local Service'));
    expect(deterministicColor('Some Local Service')).toBe(deterministicColor('Some Local Service'));
  });

  it('matches known services inside a longer name', () => {
    expect(deterministicIcon('Netflix (family plan)')).toBe('clapperboard');
    expect(deterministicIcon('Airtel postpaid')).toBe('smartphone');
  });

  it('is case-insensitive', () => {
    expect(deterministicIcon('SPOTIFY')).toBe(deterministicIcon('spotify'));
  });

  it('only ever returns an icon the renderer knows', () => {
    const names = ['Netflix', 'Gym', 'Unknown thing', 'zzz', '', 'Airtel', 'SIP', 'Rent'];
    for (const n of names) {
      expect(ICON_NAMES).toContain(deterministicIcon(n));
    }
  });

  it('builds initials from one or two words', () => {
    expect(initials('Netflix')).toBe('N');
    expect(initials('Amazon Prime')).toBe('AP');
    expect(initials('   ')).toBe('?');
  });
});
