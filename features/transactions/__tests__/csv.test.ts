import { CSV_BOM, csvCell, csvFileName, csvHeader, csvLine } from '../csv';

describe('csvCell', () => {
  it('leaves plain values alone', () => {
    expect(csvCell('Chai')).toBe('Chai');
    expect(csvCell('')).toBe('');
    expect(csvCell(null)).toBe('');
  });

  it('quotes values containing commas, quotes and line breaks', () => {
    expect(csvCell('Rent, September')).toBe('"Rent, September"');
    expect(csvCell('the "good" chai')).toBe('"the ""good"" chai"');
    expect(csvCell('line one\nline two')).toBe('"line one\nline two"');
  });

  it('neutralises spreadsheet formula injection', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('+91 call')).toBe("'+91 call");
    expect(csvCell('-50 refund')).toBe("'-50 refund");
    expect(csvCell('@home')).toBe("'@home");
  });

  it('keeps the rupee sign intact', () => {
    expect(csvCell('₹500 gift')).toBe('₹500 gift');
  });
});

describe('csvHeader / csvLine', () => {
  it('starts with a UTF-8 BOM and uses CRLF', () => {
    const h = csvHeader();
    expect(h.startsWith(CSV_BOM)).toBe(true);
    expect(h.endsWith('\r\n')).toBe(true);
    expect(h).toContain('Date,Type,Amount,Category,Note');
    expect(h).not.toContain('Recurring');
  });

  it('writes amounts as exact decimals from paise', () => {
    const line = csvLine({
      date: '2026-09-14',
      type: 'expense',
      amountPaise: 12455001,
      categoryName: 'Food & Dining',
      note: 'Dinner, with friends',
    });
    expect(line).toBe('2026-09-14,Expense,124550.01,Food & Dining,"Dinner, with friends"\r\n');
  });

  it('handles income and a missing category', () => {
    const line = csvLine({
      date: '2026-09-01',
      type: 'income',
      amountPaise: 500,
      categoryName: null,
      note: null,
    });
    expect(line).toBe('2026-09-01,Income,5.00,,\r\n');
  });
});

describe('csvFileName', () => {
  it('marks filtered exports', () => {
    expect(csvFileName('2026-09-14', false)).toBe('spendwise-transactions-2026-09-14.csv');
    expect(csvFileName('2026-09-14', true)).toBe('spendwise-transactions-filtered-2026-09-14.csv');
  });
});
