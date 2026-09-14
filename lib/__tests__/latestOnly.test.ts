import { createLatestOnly } from '../db/latestOnly';
import { msUntilNextMidnight } from '../dates';

describe('createLatestOnly — stale results never overwrite fresh ones', () => {
  it('only the newest ticket is current', () => {
    const l = createLatestOnly();
    const a = l.begin(); // search "sw"
    const b = l.begin(); // search "swiggy"
    expect(l.isCurrent(a)).toBe(false);
    expect(l.isCurrent(b)).toBe(true);
  });

  it('a slow first request resolving last is ignored', async () => {
    const l = createLatestOnly();
    const delivered: string[] = [];
    const request = (label: string, ms: number) => {
      const ticket = l.begin();
      return new Promise<void>((resolve) =>
        setTimeout(() => {
          if (l.isCurrent(ticket)) delivered.push(label);
          resolve();
        }, ms),
      );
    };
    await Promise.all([request('sw', 30), request('swiggy', 5)]);
    expect(delivered).toEqual(['swiggy']);
  });

  it('cancel makes everything stale until the next begin', () => {
    const l = createLatestOnly();
    const a = l.begin();
    l.cancel();
    expect(l.isCurrent(a)).toBe(false);
    const b = l.begin();
    expect(l.isCurrent(b)).toBe(true);
  });
});

describe('msUntilNextMidnight — the today store re-arms from this', () => {
  it('counts to one second past the next local midnight', () => {
    expect(msUntilNextMidnight(new Date(2026, 8, 14, 23, 59, 0, 0))).toBe(61_000);
    expect(msUntilNextMidnight(new Date(2026, 8, 14, 0, 0, 1, 0))).toBe(86_400_000);
  });

  it('crosses month and year ends', () => {
    expect(msUntilNextMidnight(new Date(2026, 11, 31, 23, 0, 0, 0))).toBe(3_601_000);
  });

  it('never returns less than a second', () => {
    expect(msUntilNextMidnight(new Date(2026, 8, 15, 0, 0, 0, 999))).toBeGreaterThanOrEqual(1_000);
  });
});
