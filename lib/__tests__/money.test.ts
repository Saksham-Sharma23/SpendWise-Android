import {
  toPaise,
  fromPaise,
  paiseToDecimalString,
  groupIndianManually,
  formatINR,
  MAX_AMOUNT_PAISE,
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

  it('rounds whole rupees half up, and keeps the paise exact', () => {
    expect(formatINR(12449, { whole: true })).toBe('₹124');
    expect(formatINR(12450, { whole: true })).toBe('₹125');
    expect(formatINR(-12450, { whole: true })).toBe('-₹125');
    expect(formatINR(5)).toBe('₹0.05');
    expect(formatINR(MAX_AMOUNT_PAISE)).toBe('₹10,00,00,000.00');
  });
});

/**
 * B18: formatINR no longer calls toLocaleString at runtime. The old start-up
 * ICU probe is now this test: Node ships full ICU, so the manual grouping must
 * produce exactly what 'en-IN' does, for any amount the app can hold.
 */
describe('formatINR matches ICU en-IN grouping', () => {
  const icu = (paise: number, whole: boolean) => {
    const digits = whole ? 0 : 2;
    const body = Math.abs(paise / 100)
      .toLocaleString('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits })
      .replace(/[  ]/g, '');
    return `${paise < 0 ? '-' : ''}₹${body}`;
  };

  it('ICU in this Node really groups in lakhs (else the test proves nothing)', () => {
    expect((124500).toLocaleString('en-IN')).toBe('1,24,500');
  });

  it('for 10,000 random amounts, both signs, up to ₹10 crore', () => {
    // A fixed-seed LCG, so a failure reproduces.
    let seed = 20260919;
    const next = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const edges = [0, 1, 5, 99, 100, 49_950, 99_999, 1_00_000, 99_99_999, 1_00_00_000, MAX_AMOUNT_PAISE];
    const values = [...edges, ...edges.map((v) => -v)];
    for (let i = 0; i < 10_000; i++) {
      // Log-uniform, so small and crore-scale amounts are both well covered.
      const v = Math.floor(Math.exp(next() * Math.log(MAX_AMOUNT_PAISE)));
      values.push(next() < 0.2 ? -v : v);
    }
    for (const v of values) {
      expect(formatINR(v)).toBe(icu(v, false));
      expect(formatINR(v, { whole: true })).toBe(icu(v, true));
    }
  });
});

/**
 * B5: three form schemas declared `MAX_PAISE = 100_00_00_000 * 100` — ₹100
 * crore — while every comment said ₹10 crore and Groups enforced ₹10 crore.
 * The typo guard was ten times looser than documented, and inconsistent.
 */
describe('MAX_AMOUNT_PAISE', () => {
  it('is ₹10 crore, exactly as the comments claim', () => {
    // ₹10,00,00,000 × 100 paise = 10,000,000,000 paise.
    expect(MAX_AMOUNT_PAISE).toBe(10_000_000_000);
    expect(fromPaise(MAX_AMOUNT_PAISE)).toBe(10_00_00_000);
    // The old value was ten times this — ₹100 crore — in three form schemas.
    expect(MAX_AMOUNT_PAISE).not.toBe(100_00_00_000 * 100);
  });

  it('keeps the Groups split arithmetic inside safe-integer range', () => {
    // split.ts multiplies the total by a weight of up to 10,000 basis points.
    expect(MAX_AMOUNT_PAISE * 10_000).toBeLessThan(Number.MAX_SAFE_INTEGER);
  });
});

describe('formatINRCompact', () => {
  it('uses Indian scale words', () => {
    expect(formatINRCompact(1_50_00_000 * 100)).toBe('₹1.5Cr');
    expect(formatINRCompact(2_50_000 * 100)).toBe('₹2.5L');
    expect(formatINRCompact(5_500 * 100)).toBe('₹5.5K');
    expect(formatINRCompact(999 * 100)).toBe('₹999');
  });

  /**
   * B6: the unit was chosen from the raw value and only then rounded to one
   * decimal, so a value just under a boundary rendered with a two-digit
   * mantissa of the SMALLER unit — "₹100.0K", which no one writes.
   */
  it('rounds before choosing the unit, so "100.0<unit>" can never appear', () => {
    expect(formatINRCompact(99_960 * 100)).toBe('₹1.0L');
    expect(formatINRCompact(99_950 * 100)).toBe('₹1.0L');
    expect(formatINRCompact(99_96_000 * 100)).toBe('₹1.0Cr');
  });

  it('keeps the smaller unit until rounding genuinely reaches the next one', () => {
    expect(formatINRCompact(99_949 * 100)).toBe('₹99.9K');
    expect(formatINRCompact(99_94_999 * 100)).toBe('₹99.9L');
  });

  it('formats each unit at its exact boundary', () => {
    expect(formatINRCompact(1_000 * 100)).toBe('₹1.0K');
    expect(formatINRCompact(1_00_000 * 100)).toBe('₹1.0L');
    expect(formatINRCompact(1_00_00_000 * 100)).toBe('₹1.0Cr');
    expect(formatINRCompact(10_00_00_000 * 100)).toBe('₹10.0Cr');
  });

  it('mirrors negatives', () => {
    expect(formatINRCompact(-99_960 * 100)).toBe('-₹1.0L');
    expect(formatINRCompact(-5_500 * 100)).toBe('-₹5.5K');
  });

  it('never renders a mantissa of 100 or more, at any value', () => {
    for (let rupees = 1; rupees < 2_00_00_000; rupees += 9_973) {
      expect(formatINRCompact(rupees * 100)).not.toMatch(/\b1\d\d\.\d(K|L|Cr)/);
    }
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
