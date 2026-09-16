import {
  activeDays,
  clampMonth,
  monthKeys,
  perDayPaise,
  periodWindow,
  savingsRate,
  shiftMonth,
  toSlices,
  type CategoryTotal,
} from '../period';

describe('month keys', () => {
  it('shifts across year boundaries both ways', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2025-12', 1)).toBe('2026-01');
    expect(shiftMonth('2026-09', -23)).toBe('2024-10');
  });

  it('lists consecutive months oldest first', () => {
    expect(monthKeys('2025-11', 4)).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
    expect(monthKeys('2025-11', 0)).toEqual([]);
  });
});

describe('periodWindow', () => {
  it('counts the current month as the last of the range', () => {
    expect(periodWindow(3, '2026-09-15')).toEqual({ firstMonth: '2026-07', start: '2026-07-01' });
    expect(periodWindow(24, '2026-09-15')).toEqual({ firstMonth: '2024-10', start: '2024-10-01' });
  });

  it('does not drift when today is a month-end', () => {
    // A naive date shift from the 31st lands in the wrong month.
    expect(periodWindow(6, '2026-08-31').firstMonth).toBe('2026-03');
  });

  it('treats 0 or negative as a one-month range', () => {
    expect(periodWindow(0, '2026-09-15').firstMonth).toBe('2026-09');
  });
});

describe('activeDays', () => {
  it('runs from the window start through today inclusive', () => {
    expect(activeDays('2026-09-01', '2020-01-01', '2026-09-15')).toBe(15);
  });

  it('starts at the first transaction when the ledger is younger than the window', () => {
    // 24 months selected, but tracking began on 10 Sep: 6 days, not 730.
    expect(activeDays('2024-10-01', '2026-09-10', '2026-09-15')).toBe(6);
  });

  it('is at least one day, even for an empty or future-dated ledger', () => {
    expect(activeDays('2026-09-01', null, '2026-09-01')).toBe(1);
    expect(activeDays('2026-09-01', '2026-09-20', '2026-09-15')).toBe(1);
  });

  it('crosses a leap day correctly', () => {
    expect(activeDays('2028-02-01', null, '2028-03-01')).toBe(30);
  });
});

describe('perDayPaise', () => {
  it('rounds to whole paise', () => {
    expect(perDayPaise(100_00, 3)).toBe(3333);
    expect(perDayPaise(200, 3)).toBe(67);
    expect(Number.isInteger(perDayPaise(123_457, 7))).toBe(true);
  });

  it('is zero with no days', () => {
    expect(perDayPaise(500, 0)).toBe(0);
  });
});

describe('savingsRate', () => {
  it('is the share of income kept', () => {
    expect(savingsRate(100_000_00, 60_000_00)).toBeCloseTo(40);
  });

  it('goes negative when spending exceeds income', () => {
    expect(savingsRate(50_000_00, 75_000_00)).toBeCloseTo(-50);
  });

  it('is null with no income, rather than 0% or -Infinity', () => {
    expect(savingsRate(0, 5_000_00)).toBeNull();
  });
});

const cat = (id: number | null, totalPaise: number, name: string | null = id == null ? null : `C${id}`): CategoryTotal => ({
  id,
  name,
  color: null,
  icon: null,
  totalPaise,
});

describe('toSlices', () => {
  it('keeps every category when there are few, with shares summing to 1', () => {
    const slices = toSlices([cat(1, 600), cat(null, 300), cat(2, 100)]);
    expect(slices.map((s) => s.key)).toEqual(['1', 'none', '2']);
    expect(slices.map((s) => s.share)).toEqual([0.6, 0.3, 0.1]);
    expect(slices.every((s) => s.members === 1)).toBe(true);
  });

  it('folds the tail into Other past the limit', () => {
    const rows = [cat(1, 50), cat(2, 20), cat(3, 10), cat(4, 8), cat(5, 7), cat(6, 5)];
    const slices = toSlices(rows, 4);
    expect(slices.map((s) => s.key)).toEqual(['1', '2', '3', 'other']);
    const other = slices[3]!;
    expect(other.totalPaise).toBe(20);
    expect(other.members).toBe(3);
    expect(slices.reduce((a, s) => a + s.totalPaise, 0)).toBe(100);
    expect(slices.reduce((a, s) => a + s.share, 0)).toBeCloseTo(1);
  });

  it('does not fold a single category into Other', () => {
    const slices = toSlices([cat(1, 5), cat(2, 4), cat(3, 3)], 3);
    expect(slices.map((s) => s.key)).toEqual(['1', '2', '3']);
  });

  it('drops zero rows and returns nothing for an empty month', () => {
    expect(toSlices([cat(1, 0)])).toEqual([]);
    expect(toSlices([])).toEqual([]);
  });
});

describe('clampMonth', () => {
  it('holds browsing between the first month and now', () => {
    expect(clampMonth('2026-10', '2025-01', '2026-09')).toBe('2026-09');
    expect(clampMonth('2024-12', '2025-01', '2026-09')).toBe('2025-01');
    expect(clampMonth('2025-06', '2025-01', '2026-09')).toBe('2025-06');
    expect(clampMonth('1999-01', null, '2026-09')).toBe('1999-01');
  });
});
