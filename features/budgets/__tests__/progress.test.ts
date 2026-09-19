import { addDays, getCycleWindow } from '@/lib/dates';
import { budgetStatus, budgetTotals, daysLeftLabel, WARNING_RATIO, type BudgetRow } from '../domain/progress';

/**
 * The thresholds a person acts on. These are cheap to test and expensive to
 * get wrong: a budget that only warns you after you are over is useless, and
 * one that warns too early gets ignored.
 */

const row = (over: Partial<BudgetRow> = {}): BudgetRow => ({
  id: 1,
  categoryId: 7,
  limitPaise: 1_000_00, // ₹1,000
  resetDay: 1,
  isActive: true,
  categoryName: 'Food',
  categoryIcon: 'utensils',
  categoryColor: '#F87171',
  ...over,
});

// A plain calendar month, so the numbers below are easy to read.
const march = getCycleWindow(1, '2026-03-10');

describe('budgetStatus — states', () => {
  it('is under below 75%', () => {
    expect(budgetStatus(row(), march, 74_99).state).toBe('under');
  });

  it('warns exactly AT 75%, not one paise later', () => {
    const at = budgetStatus(row(), march, Math.round(1_000_00 * WARNING_RATIO));
    expect(at.state).toBe('warning');
    expect(budgetStatus(row(), march, 750_00 - 1).state).toBe('under');
  });

  it('is over exactly at the limit — spending it all is not "nearly there"', () => {
    expect(budgetStatus(row(), march, 1_000_00).state).toBe('over');
    expect(budgetStatus(row(), march, 999_99).state).toBe('warning');
  });

  it('reports paused ahead of any threshold', () => {
    expect(budgetStatus(row({ isActive: false }), march, 5_000_00).state).toBe('paused');
  });

  it('treats a zero limit as over only once something is spent', () => {
    expect(budgetStatus(row({ limitPaise: 0 }), march, 0).state).toBe('under');
    expect(budgetStatus(row({ limitPaise: 0 }), march, 1).state).toBe('over');
  });
});

describe('budgetStatus — figures', () => {
  it('keeps remaining signed but clamps the bar fill', () => {
    const p = budgetStatus(row(), march, 1_500_00);
    expect(p.remainingPaise).toBe(-500_00);
    expect(p.ratio).toBeCloseTo(1.5);
    expect(p.fill).toBe(1);
  });

  it('carries the cycle window through', () => {
    const p = budgetStatus(row({ resetDay: 15 }), getCycleWindow(15, '2026-03-20'), 0);
    expect(p.cycleStart).toBe('2026-03-15');
    expect(p.cycleEnd).toBe('2026-04-14');
  });

  it('spreads what is left over the remaining days, today included', () => {
    // 10 Mar in a 31-day cycle: 21 days left, plus today = 22.
    const p = budgetStatus(row(), march, 0);
    expect(p.daysLeft).toBe(21);
    expect(p.perDayLeftPaise).toBe(Math.floor(1_000_00 / 22));
  });

  it('has nothing left to spread once it is over', () => {
    expect(budgetStatus(row(), march, 1_200_00).perDayLeftPaise).toBe(0);
  });

  it('never divides by zero on the last day of a cycle', () => {
    const last = getCycleWindow(1, '2026-03-31');
    expect(last.daysLeft).toBe(0);
    expect(budgetStatus(row(), last, 0).perDayLeftPaise).toBe(1_000_00);
  });
});

describe('budgetTotals', () => {
  it('sums the active budgets and counts the states', () => {
    const rows = [
      budgetStatus(row({ id: 1 }), march, 200_00), // under
      budgetStatus(row({ id: 2, limitPaise: 400_00 }), march, 300_00), // warning
      budgetStatus(row({ id: 3, limitPaise: 100_00 }), march, 150_00), // over
    ];
    const t = budgetTotals(rows);
    expect(t.limitPaise).toBe(1_500_00);
    expect(t.spentPaise).toBe(650_00);
    expect(t.remainingPaise).toBe(850_00);
    expect(t.warningCount).toBe(1);
    expect(t.overCount).toBe(1);
  });

  it('excludes paused budgets — they are not limiting anything', () => {
    const rows = [
      budgetStatus(row({ id: 1 }), march, 200_00),
      budgetStatus(row({ id: 2, isActive: false, limitPaise: 9_999_00 }), march, 9_000_00),
    ];
    const t = budgetTotals(rows);
    expect(t.limitPaise).toBe(1_000_00);
    expect(t.spentPaise).toBe(200_00);
  });

  it('is zero for no budgets', () => {
    expect(budgetTotals([])).toEqual({
      limitPaise: 0,
      spentPaise: 0,
      remainingPaise: 0,
      overCount: 0,
      warningCount: 0,
    });
  });
});

describe('daysLeftLabel', () => {
  it('reads naturally at the edges', () => {
    // Zero days left is the cycle's LAST day; the reset is tomorrow (B23).
    expect(daysLeftLabel(0)).toBe('Last day');
    expect(daysLeftLabel(1)).toBe('1 day left');
    expect(daysLeftLabel(12)).toBe('12 days left');
  });
});

describe('the reset date (B23)', () => {
  it('is the day after the cycle ends, which is the next cycle’s first day', () => {
    // Resets on the 1st: the September cycle ends on the 30th and resets on 1 Oct.
    const sep = getCycleWindow(1, '2026-09-19');
    expect(sep.end).toBe('2026-09-30');
    expect(addDays(sep.end, 1)).toBe('2026-10-01');
    expect(getCycleWindow(1, addDays(sep.end, 1)).start).toBe(addDays(sep.end, 1));

    // Resets on the 15th: 15 Sep → 14 Oct, resetting on 15 Oct.
    const mid = getCycleWindow(15, '2026-09-19');
    expect(addDays(mid.end, 1)).toBe('2026-10-15');
    expect(getCycleWindow(15, addDays(mid.end, 1)).start).toBe('2026-10-15');
  });

  it('shows "Last day" on the cycle’s last day, not "Resets today"', () => {
    const last = getCycleWindow(1, '2026-09-30');
    expect(last.daysLeft).toBe(0);
    expect(daysLeftLabel(last.daysLeft)).toBe('Last day');
  });
});
