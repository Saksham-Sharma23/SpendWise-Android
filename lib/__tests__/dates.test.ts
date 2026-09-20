import {
  toISODate,
  fromISODate,
  daysInMonth,
  daysBetween,
  addDays,
  addMonthsClamped,
  monthKey,
  getCycleWindow,
} from '../dates';

describe('fromISODate — the timezone trap', () => {
  it('parses to LOCAL midnight, not UTC', () => {
    // `new Date('2026-03-15')` parses as UTC; in IST that is 15 Mar 05:30,
    // and in a negative offset it would be 14 Mar. Round-tripping proves we
    // are in local space.
    const d = fromISODate('2026-03-15');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(2); // March
    expect(d.getDate()).toBe(15);
    expect(toISODate(d)).toBe('2026-03-15');
  });

  it('round-trips every day of a leap February', () => {
    for (let day = 1; day <= 29; day++) {
      const iso = `2028-02-${String(day).padStart(2, '0')}`;
      expect(toISODate(fromISODate(iso))).toBe(iso);
    }
  });
});

describe('daysInMonth', () => {
  it('knows month lengths', () => {
    expect(daysInMonth(2026, 1)).toBe(31);
    expect(daysInMonth(2026, 4)).toBe(30);
    expect(daysInMonth(2026, 2)).toBe(28);
  });

  it('handles leap years, including the century rules', () => {
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2000, 2)).toBe(29); // divisible by 400
    expect(daysInMonth(1900, 2)).toBe(28); // divisible by 100, not 400
  });
});

describe('daysBetween / addDays', () => {
  it('counts whole days in both directions', () => {
    expect(daysBetween('2026-03-01', '2026-03-15')).toBe(14);
    expect(daysBetween('2026-03-15', '2026-03-01')).toBe(-14);
    expect(daysBetween('2026-03-01', '2026-03-01')).toBe(0);
  });

  it('crosses month and year boundaries', () => {
    expect(daysBetween('2026-12-28', '2027-01-03')).toBe(6);
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31');
  });

  it('counts across a leap day', () => {
    expect(daysBetween('2028-02-28', '2028-03-01')).toBe(2);
    expect(daysBetween('2026-02-28', '2026-03-01')).toBe(1);
  });
});

describe('addMonthsClamped — month-end handling', () => {
  it('clamps 31 Jan to the end of February', () => {
    expect(addMonthsClamped('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonthsClamped('2028-01-31', 1)).toBe('2028-02-29');
  });

  it('does NOT overflow into the following month', () => {
    // Naive Date arithmetic gives 2026-03-03 here. That is the bug.
    expect(addMonthsClamped('2026-01-31', 1)).not.toBe('2026-03-03');
  });

  it('clamps 31 to 30-day months', () => {
    expect(addMonthsClamped('2026-03-31', 1)).toBe('2026-04-30');
    expect(addMonthsClamped('2026-05-31', 1)).toBe('2026-06-30');
  });

  it('crosses years in both directions', () => {
    expect(addMonthsClamped('2026-12-15', 1)).toBe('2027-01-15');
    expect(addMonthsClamped('2026-01-15', -1)).toBe('2025-12-15');
    expect(addMonthsClamped('2026-06-15', 12)).toBe('2027-06-15');
  });

  it('does not drift when stepping from the original anchor', () => {
    // Anchored at 31 Jan, each step is computed from the ORIGINAL date, so
    // the 31st reappears whenever the month is long enough.
    expect(addMonthsClamped('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonthsClamped('2026-01-31', 2)).toBe('2026-03-31');
    expect(addMonthsClamped('2026-01-31', 3)).toBe('2026-04-30');
    expect(addMonthsClamped('2026-01-31', 4)).toBe('2026-05-31');
  });
});

describe('monthKey', () => {
  it('matches the SQL substr(date,1,7) grouping', () => {
    expect(monthKey('2026-03-15')).toBe('2026-03');
  });
});

describe('getCycleWindow — budget cycles', () => {
  it('behaves like a calendar month when resetDay is 1', () => {
    const w = getCycleWindow(1, '2026-03-15');
    expect(w.start).toBe('2026-03-01');
    expect(w.end).toBe('2026-03-31');
    expect(w.daysTotal).toBe(31);
  });

  it('spans two calendar months for a mid-month reset', () => {
    const w = getCycleWindow(15, '2026-03-20');
    expect(w.start).toBe('2026-03-15');
    expect(w.end).toBe('2026-04-14');
  });

  it("uses last month's start when today precedes the reset day", () => {
    const w = getCycleWindow(15, '2026-03-10');
    expect(w.start).toBe('2026-02-15');
    expect(w.end).toBe('2026-03-14');
  });

  it('treats the reset day itself as the first day of the new cycle', () => {
    const w = getCycleWindow(15, '2026-03-15');
    expect(w.start).toBe('2026-03-15');
  });

  it('clamps resetDay 31 into February', () => {
    const w = getCycleWindow(31, '2026-02-15');
    expect(w.start).toBe('2026-01-31');
    expect(w.end).toBe('2026-02-27');
  });

  it('crosses the year boundary', () => {
    const w = getCycleWindow(15, '2027-01-10');
    expect(w.start).toBe('2026-12-15');
    expect(w.end).toBe('2027-01-14');
  });

  it('reports daysLeft, never negative', () => {
    expect(getCycleWindow(1, '2026-03-01').daysLeft).toBe(30);
    expect(getCycleWindow(1, '2026-03-31').daysLeft).toBe(0);
  });
});
