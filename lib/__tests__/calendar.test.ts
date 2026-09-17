import {
  GRID_DAYS,
  clampDate,
  inMonth,
  monthGrid,
  monthRange,
  openingMonth,
  sameDayInMonth,
  shiftMonthKey,
} from '../calendar';
import { addDays } from '../dates';

describe('monthGrid', () => {
  it('always returns six full weeks', () => {
    for (const month of ['2026-01', '2026-02', '2024-02', '2026-08', '2027-05']) {
      expect(monthGrid(month)).toHaveLength(GRID_DAYS);
    }
  });

  it('starts on the Sunday on or before the 1st', () => {
    // 1 Sep 2026 is a Tuesday, so the grid opens on Sunday 30 Aug.
    expect(monthGrid('2026-09')[0]).toBe('2026-08-30');
    // 1 Feb 2026 is a Sunday: no leading days at all.
    expect(monthGrid('2026-02')[0]).toBe('2026-02-01');
  });

  it('runs consecutively with no gaps or repeats', () => {
    const grid = monthGrid('2026-03');
    for (let i = 1; i < grid.length; i++) {
      expect(grid[i]).toBe(addDays(grid[i - 1]!, 1));
    }
  });

  it('contains every day of the month exactly once', () => {
    // February in a leap year is the case that catches off-by-one errors.
    const grid = monthGrid('2024-02');
    const own = grid.filter((d) => inMonth(d, '2024-02'));
    expect(own).toHaveLength(29);
    expect(own[0]).toBe('2024-02-01');
    expect(own[28]).toBe('2024-02-29');
    expect(new Set(own).size).toBe(29);
  });
});

describe('shiftMonthKey / monthRange', () => {
  it('crosses year boundaries in both directions', () => {
    expect(shiftMonthKey('2026-12', 1)).toBe('2027-01');
    expect(shiftMonthKey('2026-01', -1)).toBe('2025-12');
    expect(shiftMonthKey('2026-06', 18)).toBe('2027-12');
  });

  it('lists an inclusive run of months, oldest first', () => {
    expect(monthRange('2026-11', '2027-02')).toEqual(['2026-11', '2026-12', '2027-01', '2027-02']);
    expect(monthRange('2026-05', '2026-05')).toEqual(['2026-05']);
  });

  it('covers two years in one strip, so no month needs repeated stepping', () => {
    expect(monthRange('2024-09', '2026-09')).toHaveLength(25);
  });

  it('returns nothing when the range is inverted', () => {
    expect(monthRange('2026-09', '2026-01')).toEqual([]);
  });
});

describe('sameDayInMonth', () => {
  it('clamps to the target month rather than overflowing', () => {
    expect(sameDayInMonth('2026-03-31', '2026-02')).toBe('2026-02-28');
    expect(sameDayInMonth('2024-03-31', '2024-02')).toBe('2024-02-29');
    expect(sameDayInMonth('2026-01-15', '2026-11')).toBe('2026-11-15');
  });
});

describe('clampDate / openingMonth', () => {
  it('holds a date inside its bounds', () => {
    expect(clampDate('2020-01-01', '2024-01-01', '2026-12-31')).toBe('2024-01-01');
    expect(clampDate('2030-01-01', '2024-01-01', '2026-12-31')).toBe('2026-12-31');
    expect(clampDate('2025-06-06', '2024-01-01', '2026-12-31')).toBe('2025-06-06');
    expect(clampDate('2030-01-01')).toBe('2030-01-01');
  });

  it('opens on the value’s month, or the nearest month in the strip', () => {
    expect(openingMonth('2025-04-09', '2024-01', '2026-09')).toBe('2025-04');
    expect(openingMonth('2019-04-09', '2024-01', '2026-09')).toBe('2024-01');
    expect(openingMonth('2030-04-09', '2024-01', '2026-09')).toBe('2026-09');
  });
});
