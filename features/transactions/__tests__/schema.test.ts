import { transactionFormSchema, toTransactionInput, emptyTransactionForm, type TransactionFormValues } from '../schema';

const base: TransactionFormValues = {
  type: 'expense',
  amount: '250.50',
  date: '2026-09-13',
  categoryId: 1,
  note: 'Lunch',
};

function parse(overrides: Partial<TransactionFormValues>) {
  return transactionFormSchema.safeParse({ ...base, ...overrides });
}

describe('transactionFormSchema', () => {
  it('accepts a well-formed entry', () => {
    expect(parse({}).success).toBe(true);
  });

  it('requires an amount', () => {
    expect(parse({ amount: '' }).success).toBe(false);
    expect(parse({ amount: '   ' }).success).toBe(false);
  });

  it('rejects a zero amount', () => {
    expect(parse({ amount: '0' }).success).toBe(false);
    expect(parse({ amount: '0.00' }).success).toBe(false);
  });

  it('rejects text that is not an amount', () => {
    expect(parse({ amount: 'abc' }).success).toBe(false);
    expect(parse({ amount: 'N/A' }).success).toBe(false);
  });

  it('accepts the messy amounts the parser handles', () => {
    expect(parse({ amount: '₹1,24,500.00' }).success).toBe(true);
    expect(parse({ amount: '(2,300)' }).success).toBe(true);
  });

  it('rejects an implausibly large amount, which is usually a missed decimal', () => {
    expect(parse({ amount: '999999999999' }).success).toBe(false);
  });

  it('requires an ISO date', () => {
    expect(parse({ date: '13/09/2026' }).success).toBe(false);
    expect(parse({ date: '2026-9-3' }).success).toBe(false);
    expect(parse({ date: '2026-09-13' }).success).toBe(true);
  });

  it('rejects dates that do not exist, and accepts leap days that do', () => {
    expect(parse({ date: '2026-02-31' }).success).toBe(false);
    expect(parse({ date: '2026-02-29' }).success).toBe(false);
    expect(parse({ date: '2026-13-01' }).success).toBe(false);
    expect(parse({ date: '2028-02-29' }).success).toBe(true);
  });

  it('allows a null category', () => {
    expect(parse({ categoryId: null }).success).toBe(true);
  });

  it('caps the note length', () => {
    expect(parse({ note: 'x'.repeat(201) }).success).toBe(false);
    expect(parse({ note: 'x'.repeat(200) }).success).toBe(true);
  });
});

describe('toTransactionInput', () => {
  it('converts the typed string straight to integer paise', () => {
    const out = toTransactionInput({ ...base, amount: '250.50' });
    expect(out.amountPaise).toBe(25050);
    expect(Number.isInteger(out.amountPaise)).toBe(true);
  });

  it('avoids the float round-trip that loses a paise', () => {
    // parseFloat('1.005') * 100 rounds DOWN to 100 because 1.005 is really
    // 1.00499...; parsing the text directly gives the 101 the user meant.
    expect(toTransactionInput({ ...base, amount: '1.005' }).amountPaise).toBe(101);
  });

  it('stores a magnitude and lets type carry the direction', () => {
    // A '(2,300)' entry parses negative, but an expense row must still hold a
    // positive amount — every aggregate splits on type via CASE, and a
    // negative row would corrupt the trend chart rather than fail loudly.
    const out = toTransactionInput({ ...base, type: 'expense', amount: '(2,300)' });
    expect(out.amountPaise).toBe(230000);
    expect(out.type).toBe('expense');
  });

  it('normalises an empty note to null rather than an empty string', () => {
    expect(toTransactionInput({ ...base, note: '   ' }).note).toBeNull();
    expect(toTransactionInput({ ...base, note: undefined }).note).toBeNull();
  });

  it('trims a real note', () => {
    expect(toTransactionInput({ ...base, note: '  Lunch  ' }).note).toBe('Lunch');
  });
});

describe('emptyTransactionForm', () => {
  it('defaults to an expense on the given date', () => {
    const f = emptyTransactionForm('2026-09-13');
    expect(f.type).toBe('expense');
    expect(f.date).toBe('2026-09-13');
    expect(f.amount).toBe('');
    // An empty form must not validate — otherwise the save button would be
    // enabled with nothing entered.
    expect(transactionFormSchema.safeParse(f).success).toBe(false);
  });
});

/**
 * B5: the guard read `MAX_PAISE = 100_00_00_000 * 100` — ₹100 crore — while
 * the comment beside it said ₹10 crore, and Groups enforced ₹10 crore. No test
 * asserted the boundary, which is exactly why the wrong value survived.
 */
describe('the amount typo guard', () => {
  const at = (amount: string) => transactionFormSchema.safeParse({ ...base, amount }).success;

  it('accepts ₹10 crore and refuses a paisa more', () => {
    expect(at('100000000')).toBe(true); // ₹10,00,00,000
    expect(at('100000000.01')).toBe(false);
  });

  it('refuses the old ₹100 crore ceiling', () => {
    expect(at('1000000000')).toBe(false);
  });

  it('applies to income as well as expense', () => {
    expect(transactionFormSchema.safeParse({ ...base, type: 'income', amount: '1000000000' }).success).toBe(false);
  });
});
