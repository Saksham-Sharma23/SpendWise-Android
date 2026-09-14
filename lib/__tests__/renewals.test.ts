import { renewalCountdown, upcomingRenewals, type SubscriptionLike } from '../renewals';

const sub = (over: Partial<SubscriptionLike>): SubscriptionLike => ({
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
    expect(list.map((s) => [s.name, s.nextDate, s.daysUntil])).toEqual([
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
