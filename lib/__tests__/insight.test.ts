import { buildInsight, type InsightInput } from '../insight';

const base: InsightInput = {
  incomePaise: 0,
  expensePaise: 0,
  count: 0,
  lastExpenseToDatePaise: 0,
  topCategory: null,
};
const r = (rupees: number) => rupees * 100;

describe('buildInsight', () => {
  it('greets an empty month', () => {
    expect(buildInsight(base)).toMatchObject({ tone: 'neutral', title: 'A fresh month' });
  });

  it('warns first when spending exceeds income', () => {
    const i = buildInsight({
      ...base,
      count: 5,
      incomePaise: r(10000),
      expensePaise: r(12500),
      lastExpenseToDatePaise: r(20000),
    });
    expect(i.tone).toBe('warn');
    expect(i.title).toBe('Spending more than you earned');
    expect(i.body).toContain('₹2,500');
  });

  it('praises a slower pace than last month, month-to-date', () => {
    const i = buildInsight({
      ...base,
      count: 5,
      incomePaise: r(50000),
      expensePaise: r(8000),
      lastExpenseToDatePaise: r(10000),
    });
    expect(i).toMatchObject({ tone: 'good', title: '20% less than last month' });
    expect(i.body).toContain('₹8,000');
    expect(i.body).toContain('₹10,000');
  });

  it('warns about a faster pace', () => {
    const i = buildInsight({
      ...base,
      count: 5,
      incomePaise: r(50000),
      expensePaise: r(12000),
      lastExpenseToDatePaise: r(10000),
    });
    expect(i).toMatchObject({ tone: 'warn', title: '20% more than last month' });
  });

  it('ignores pace changes that are just noise, then looks at categories', () => {
    const i = buildInsight({
      ...base,
      count: 5,
      incomePaise: r(50000),
      expensePaise: r(10500),
      lastExpenseToDatePaise: r(10000),
      topCategory: { name: 'Rent', totalPaise: r(6000) },
    });
    expect(i).toMatchObject({ tone: 'neutral', title: 'Rent leads your spending' });
    expect(i.body).toContain('57%');
  });

  it('celebrates a healthy savings rate when nothing else stands out', () => {
    const i = buildInsight({
      ...base,
      count: 5,
      incomePaise: r(50000),
      expensePaise: r(10000),
      lastExpenseToDatePaise: r(10000),
      topCategory: { name: 'Food', totalPaise: r(2000) },
    });
    expect(i).toMatchObject({ tone: 'good', title: 'Saving 80% of your income' });
  });

  it('falls back to a calm on-track message', () => {
    const noHistory = buildInsight({ ...base, count: 2, expensePaise: r(900) });
    expect(noHistory).toMatchObject({ tone: 'neutral', title: 'Right on track' });
    expect(noHistory.body).toContain('₹900');

    const withHistory = buildInsight({ ...base, count: 2, expensePaise: r(1000), lastExpenseToDatePaise: r(1000) });
    expect(withHistory.body).toContain("last month's pace");
  });

  it('never divides by zero', () => {
    const i = buildInsight({ ...base, count: 1, incomePaise: 0, expensePaise: 0, lastExpenseToDatePaise: 0 });
    expect(i.title).toBe('Right on track');
  });
});
