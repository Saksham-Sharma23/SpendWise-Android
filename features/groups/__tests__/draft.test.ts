import { paiseToDecimalString } from '../../../lib/money';
import { draftFromExpense, emptyDraft, evaluate } from '../draft';
import { formatPercent } from '../split';

const ME = 1;
const RAHUL = 2;
const PRIYA = 3;
const members = [ME, RAHUL, PRIYA];

describe('evaluate', () => {
  it('asks for an amount first', () => {
    expect(evaluate(emptyDraft(members, ME), members).problem).toBe('Enter an amount');
    expect(evaluate({ ...emptyDraft(members, ME), amount: 'abc' }, members).problem).toBe('Enter an amount');
  });

  it('you paid, split equally: exact paise, extra paisa to the first person', () => {
    const e = evaluate({ ...emptyDraft(members, ME), amount: '100' }, members);
    expect(e.problem).toBeNull();
    expect(e.payers).toEqual([{ personId: ME, paise: 10_000 }]);
    expect(e.shares).toEqual([
      { personId: ME, paise: 3334, input: null },
      { personId: RAHUL, paise: 3333, input: null },
      { personId: PRIYA, paise: 3333, input: null },
    ]);
    expect(e.perPersonPaise).toBe(3333);
  });

  it('equal split between only the people ticked', () => {
    const d = { ...emptyDraft(members, ME), amount: '1,200', included: { [ME]: true, [RAHUL]: false, [PRIYA]: true } };
    expect(evaluate(d, members).shares).toEqual([
      { personId: ME, paise: 60_000, input: null },
      { personId: PRIYA, paise: 60_000, input: null },
    ]);
    expect(evaluate({ ...d, included: {} }, members).problem).toBe('Pick at least one person to split with');
  });

  it('multiple payers must add up, and says by how much they do not', () => {
    const d = { ...emptyDraft(members, ME), amount: '1200', paidMode: 'multiple' as const, paid: { [ME]: '800', [RAHUL]: '300' } };
    const short = evaluate(d, members);
    expect(short.paidRemaining).toBe(100_00);
    expect(short.problem).toBe('Paid amounts are short of the total');
    expect(short.payers).toBeNull();

    const ok = evaluate({ ...d, paid: { [ME]: '800', [RAHUL]: '400' } }, members);
    expect(ok.problem).toBeNull();
    expect(ok.payers).toEqual([
      { personId: ME, paise: 800_00 },
      { personId: RAHUL, paise: 400_00 },
    ]);
  });

  it('exact amounts: remaining shown, zero people dropped, typed values kept', () => {
    const d = { ...emptyDraft(members, ME), amount: '1000', method: 'exact' as const, exact: { [ME]: '600', [RAHUL]: '280' } };
    expect(evaluate(d, members).splitRemaining).toBe(120_00);
    const ok = evaluate({ ...d, exact: { [ME]: '600', [RAHUL]: '400' } }, members);
    expect(ok.problem).toBeNull();
    expect(ok.shares).toEqual([
      { personId: ME, paise: 600_00, input: 600_00 },
      { personId: RAHUL, paise: 400_00, input: 400_00 },
    ]);
  });

  it('percentages must reach exactly 100%, and are split exactly', () => {
    const d = { ...emptyDraft(members, ME), amount: '100', method: 'percent' as const, percent: { [ME]: '50', [RAHUL]: '33.33' } };
    const short = evaluate(d, members);
    expect(short.splitRemaining).toBe(1667);
    expect(short.problem).toBe('Percentages must add up to 100%');

    const ok = evaluate({ ...d, percent: { [ME]: '50', [RAHUL]: '33.33', [PRIYA]: '16.67' } }, members);
    expect(ok.problem).toBeNull();
    expect(ok.shares!.reduce((a, s) => a + s.paise, 0)).toBe(10_000);
    expect(ok.shares!.map((s) => s.input)).toEqual([5000, 3333, 1667]);

    expect(evaluate({ ...d, percent: { [ME]: '33.333' } }, members).problem).toBe('Percentages can have up to two decimals');
  });

  it('shares like 2:1:1', () => {
    const d = { ...emptyDraft(members, ME), amount: '1000', method: 'shares' as const, shares: { [ME]: '2', [RAHUL]: '1', [PRIYA]: '1' } };
    expect(evaluate(d, members).shares!.map((s) => s.paise)).toEqual([500_00, 250_00, 250_00]);
    expect(evaluate({ ...d, shares: { [ME]: '0', [RAHUL]: '0', [PRIYA]: '0' } }, members).problem).toBe('Give at least one person a share');
    expect(evaluate({ ...d, shares: { [ME]: '1.5' } }, members).problem).toBe('Shares must be whole numbers');
  });
});

describe('draftFromExpense', () => {
  const round = (expense: Parameters<typeof draftFromExpense>[0]) => {
    const d = draftFromExpense(expense, members, ME, paiseToDecimalString, formatPercent);
    return evaluate(d, members);
  };

  it('rebuilds a percent split exactly as typed', () => {
    const e = round({
      amountPaise: 10_000,
      splitMethod: 'percent',
      payers: [{ personId: RAHUL, paise: 10_000 }],
      shares: [
        { personId: ME, paise: 5000, input: 5000 },
        { personId: RAHUL, paise: 3333, input: 3333 },
        { personId: PRIYA, paise: 1667, input: 1667 },
      ],
    });
    expect(e.problem).toBeNull();
    expect(e.payers).toEqual([{ personId: RAHUL, paise: 10_000 }]);
    expect(e.shares!.map((s) => s.input)).toEqual([5000, 3333, 1667]);
  });

  it('rebuilds multiple payers and an equal split among some members', () => {
    const e = round({
      amountPaise: 1_200_00,
      splitMethod: 'equal',
      payers: [
        { personId: ME, paise: 800_00 },
        { personId: RAHUL, paise: 400_00 },
      ],
      shares: [
        { personId: ME, paise: 600_00, input: null },
        { personId: PRIYA, paise: 600_00, input: null },
      ],
    });
    expect(e.problem).toBeNull();
    expect(e.payers).toEqual([
      { personId: ME, paise: 800_00 },
      { personId: RAHUL, paise: 400_00 },
    ]);
    expect(e.shares!.map((s) => s.personId)).toEqual([ME, PRIYA]);
  });
});
