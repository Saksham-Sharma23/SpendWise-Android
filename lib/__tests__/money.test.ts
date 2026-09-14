import {
  toPaise,
  fromPaise,
  paiseToDecimalString,
  groupIndianManually,
  formatINR,
  formatINRCompact,
  formatCount,
  parseAmountToPaise,
} from '../money';

describe('toPaise', () => {
  it('converts rupees to integer paise', () => {
    expect(toPaise(1245.5)).toBe(124550);
    expect(toPaise('1245.50')).toBe(124550);
    expect(toPaise(0)).toBe(0);
  });

  it('rounds rather than truncates, so error does not accumulate one way', () => {
    expect(toPaise(12.345)).toBe(1235);
    expect(toPaise(12.344)).toBe(1234);
  });

  it('survives the classic float representation traps', () => {
    // 0.1 + 0.2 === 0.30000000000000004
    expect(toPaise(0.1 + 0.2)).toBe(30);
    expect(toPaise(19.99)).toBe(1999);
    // 1.005 is really 1.00499999999999989 in binary float, so it rounds DOWN.
    // Documenting this rather than "fixing" it: any workaround (e.g. rounding
    // via string) would be lying about the input we were actually given. The
    // real defence is that amounts enter as strings from a form or a
    // spreadsheet cell and go through parseAmountToPaise, which never builds
    // a float at all.
    expect(toPaise(1.005)).toBe(100);
    expect(parseAmountToPaise('1.005')).toBe(101);
  });

  it('returns 0 for junk rather than NaN', () => {
    expect(toPaise('abc')).toBe(0);
    expect(toPaise(NaN)).toBe(0);
  });
});

describe('fromPaise / paiseToDecimalString', () => {
  it('round-trips', () => {
    expect(fromPaise(124550)).toBe(1245.5);
    expect(toPaise(fromPaise(124550))).toBe(124550);
  });

  it('formats a decimal string without float drift', () => {
    expect(paiseToDecimalString(124550)).toBe('1245.50');
    expect(paiseToDecimalString(5)).toBe('0.05');
    expect(paiseToDecimalString(100)).toBe('1.00');
    expect(paiseToDecimalString(-2300)).toBe('-23.00');
  });
});

describe('groupIndianManually — the ICU fallback', () => {
  it('groups in lakhs and crores, not thousands', () => {
    expect(groupIndianManually(124500)).toBe('1,24,500.00');
    expect(groupIndianManually(12345678.9)).toBe('1,23,45,678.90');
  });

  it('leaves short numbers alone', () => {
    expect(groupIndianManually(999)).toBe('999.00');
    expect(groupIndianManually(0)).toBe('0.00');
  });

  it('handles the 4-digit boundary where grouping starts', () => {
    expect(groupIndianManually(1000)).toBe('1,000.00');
    expect(groupIndianManually(99999)).toBe('99,999.00');
    expect(groupIndianManually(100000)).toBe('1,00,000.00');
  });

  it('handles negatives and zero fraction digits', () => {
    expect(groupIndianManually(-124500)).toBe('-1,24,500.00');
    expect(groupIndianManually(124500, 0)).toBe('1,24,500');
  });
});

describe('formatINR', () => {
  it('formats paise as grouped rupees', () => {
    expect(formatINR(12450000)).toBe('₹1,24,500.00');
  });

  it('respects whole, bare and signed options', () => {
    expect(formatINR(12450000, { whole: true })).toBe('₹1,24,500');
    expect(formatINR(12450000, { bare: true })).toBe('1,24,500.00');
    expect(formatINR(50000, { signed: true })).toBe('+₹500.00');
    expect(formatINR(-50000, { signed: true })).toBe('-₹500.00');
  });

  it('puts the minus outside the symbol', () => {
    expect(formatINR(-50000)).toBe('-₹500.00');
  });

  it('never renders NaN', () => {
    expect(formatINR(NaN)).toBe('₹0.00');
  });
});

describe('formatINRCompact', () => {
  it('uses Indian scale words', () => {
    expect(formatINRCompact(1_50_00_000 * 100)).toBe('₹1.5Cr');
    expect(formatINRCompact(2_50_000 * 100)).toBe('₹2.5L');
    expect(formatINRCompact(5_500 * 100)).toBe('₹5.5K');
    expect(formatINRCompact(999 * 100)).toBe('₹999');
  });
});

describe('parseAmountToPaise — real spreadsheet cells', () => {
  it('parses plain numbers', () => {
    expect(parseAmountToPaise(1245.5)).toBe(124550);
    expect(parseAmountToPaise('450')).toBe(45000);
  });

  it('strips currency symbols and Indian grouping', () => {
    expect(parseAmountToPaise('₹ 1,24,500.00')).toBe(12450000);
    expect(parseAmountToPaise('INR 2,300')).toBe(230000);
    expect(parseAmountToPaise('Rs. 99.50')).toBe(9950);
  });

  it('treats accounting parentheses as negative', () => {
    expect(parseAmountToPaise('(2,300)')).toBe(-230000);
    expect(parseAmountToPaise('(99.50)')).toBe(-9950);
  });

  it('honours DR and CR markers', () => {
    expect(parseAmountToPaise('2300 DR')).toBe(-230000);
    expect(parseAmountToPaise('2300 CR')).toBe(230000);
    expect(parseAmountToPaise('2300dr')).toBe(-230000);
  });

  it('handles explicit signs', () => {
    expect(parseAmountToPaise('-450')).toBe(-45000);
    expect(parseAmountToPaise('+450')).toBe(45000);
  });

  it('resolves comma-vs-dot decimals by taking the last separator', () => {
    expect(parseAmountToPaise('1.234,50')).toBe(123450); // European
    expect(parseAmountToPaise('1,234.50')).toBe(123450); // Anglo
  });

  it('reads a comma with 3 trailing digits as THOUSANDS', () => {
    // In Indian and Anglo sheets a comma is essentially always grouping.
    expect(parseAmountToPaise('1,234')).toBe(123400);
    expect(parseAmountToPaise('2,300')).toBe(230000);
  });

  it('reads a lone dot with 3 trailing digits as a DECIMAL', () => {
    // Deliberate policy. '1.234' vs '12.345' is unresolvable from digits
    // alone; we bias toward decimal because misreading a decimal as
    // thousands inflates the amount 1000x and is easy to miss on review.
    expect(parseAmountToPaise('1.234')).toBe(123);
    expect(parseAmountToPaise('12.345')).toBe(1235);
  });

  it('uses repeated separators as decisive evidence of grouping', () => {
    expect(parseAmountToPaise('1.234.567')).toBe(123456700);
    expect(parseAmountToPaise('1,234,567')).toBe(123456700);
  });

  it('is unambiguous once a real decimal is present', () => {
    expect(parseAmountToPaise('1,234.50')).toBe(123450);
    expect(parseAmountToPaise('12,34,567.89')).toBe(123456789);
  });

  it('rounds a third decimal digit rather than dropping it', () => {
    expect(parseAmountToPaise('12.345')).toBe(1235);
    expect(parseAmountToPaise('12.344')).toBe(1234);
  });

  it('handles bare fractions', () => {
    expect(parseAmountToPaise('.50')).toBe(50);
  });

  it('returns null for genuinely non-numeric cells', () => {
    expect(parseAmountToPaise('')).toBeNull();
    expect(parseAmountToPaise(null)).toBeNull();
    expect(parseAmountToPaise(undefined)).toBeNull();
    expect(parseAmountToPaise('N/A')).toBeNull();
    expect(parseAmountToPaise('—')).toBeNull();
  });
});

describe('formatCount', () => {
  it('groups counts the Indian way without decimals', () => {
    expect(formatCount(0)).toBe('0');
    expect(formatCount(999)).toBe('999');
    expect(formatCount(50000)).toBe('50,000');
    expect(formatCount(123456)).toBe('1,23,456');
    expect(formatCount(10000000)).toBe('1,00,00,000');
  });
});
