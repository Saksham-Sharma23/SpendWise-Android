import {
  FULL_PERCENT_BP,
  MAX_EXPENSE_PAISE,
  allocate,
  formatPercent,
  parsePercent,
  splitEqual,
  splitExact,
  splitPercent,
  splitShares,
} from '../domain/split';

function lcg(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const sum = (xs: number[]) => xs.reduce((a, v) => a + v, 0);

describe('allocate', () => {
  it('always sums to the total exactly, each share within one paisa of ideal', () => {
    const rand = lcg(7);
    for (let i = 0; i < 5_000; i++) {
      const total = Math.floor(rand() * 5_00_000_00);
      const n = 1 + Math.floor(rand() * 12);
      const weights = Array.from({ length: n }, () => Math.floor(rand() * 20));
      const out = allocate(total, weights);
      const W = sum(weights);
      if (W === 0) {
        expect(out.every((v) => v === 0)).toBe(true);
        continue;
      }
      expect(sum(out)).toBe(total);
      out.forEach((v, j) => {
        expect(Number.isInteger(v)).toBe(true);
        expect(Math.abs(v - (total * weights[j]!) / W)).toBeLessThan(1);
        if (weights[j] === 0) expect(v).toBe(0);
      });
    }
  });

  it('gives the leftover paise to the largest remainders, ties to whoever is first', () => {
    // ₹100.00 by 1:1:1 → 3334, 3333, 3333.
    expect(allocate(10_000, [1, 1, 1])).toEqual([3334, 3333, 3333]);
    // 10 paise by 1:2:2 → ideal 2, 4, 4 exactly.
    expect(allocate(10, [1, 2, 2])).toEqual([2, 4, 4]);
    // 7 paise by 1:1:1:1 → 1.75 each: three people get the extra paisa, the last does not.
    expect(allocate(7, [1, 1, 1, 1])).toEqual([2, 2, 2, 1]);
  });

  it('is deterministic', () => {
    expect(allocate(99_999, [3, 1, 4, 1, 5])).toEqual(allocate(99_999, [3, 1, 4, 1, 5]));
  });

  it('stays exact at the largest allowed expense with basis-point weights', () => {
    const out = allocate(MAX_EXPENSE_PAISE, [3333, 3333, 3334]);
    expect(sum(out)).toBe(MAX_EXPENSE_PAISE);
  });

  it('rejects fractional or out-of-range input instead of rounding it', () => {
    expect(() => allocate(10.5, [1, 1])).toThrow();
    expect(() => allocate(-1, [1])).toThrow();
    expect(() => allocate(MAX_EXPENSE_PAISE + 1, [1])).toThrow();
    expect(() => allocate(100, [1.5, 1])).toThrow();
  });
});

describe('splitEqual', () => {
  it('differs by at most one paisa, extras to the first people', () => {
    expect(splitEqual(100, 3)).toEqual([34, 33, 33]);
    expect(splitEqual(1_200_00, 4)).toEqual([30_000, 30_000, 30_000, 30_000]);
    expect(splitEqual(1, 3)).toEqual([1, 0, 0]);
  });

  it('needs at least one person', () => {
    expect(() => splitEqual(100, 0)).toThrow();
  });
});

describe('splitExact', () => {
  it('accepts amounts that add up', () => {
    expect(splitExact(1_000, [600, 400])).toEqual({ ok: true, shares: [600, 400] });
  });

  it('reports what is left to assign, or how much too much', () => {
    expect(splitExact(1_000, [600, 280])).toEqual({ ok: false, reason: 'mismatch', remaining: 120 });
    expect(splitExact(1_000, [600, 500])).toEqual({ ok: false, reason: 'mismatch', remaining: -100 });
  });

  it('flags a fractional amount as invalid', () => {
    expect(splitExact(1_000, [600.5, 399.5])).toEqual({ ok: false, reason: 'invalid' });
  });
});

describe('splitPercent', () => {
  it('splits by basis points exactly', () => {
    const r = splitPercent(10_000, [3333, 3333, 3334]);
    expect(r).toEqual({ ok: true, shares: [3333, 3333, 3334] });
  });

  it('requires exactly 100%', () => {
    expect(splitPercent(10_000, [5000, 4000])).toEqual({ ok: false, reason: 'mismatch', remaining: 1000 });
    expect(splitPercent(10_000, [6000, 6000])).toEqual({ ok: false, reason: 'mismatch', remaining: -2000 });
  });

  it('sums exactly for random percentages', () => {
    const rand = lcg(99);
    for (let i = 0; i < 2_000; i++) {
      const n = 1 + Math.floor(rand() * 8);
      const cuts = Array.from({ length: n - 1 }, () => Math.floor(rand() * FULL_PERCENT_BP)).sort((a, b) => a - b);
      const bp = [...cuts, FULL_PERCENT_BP].map((c, j) => c - (j === 0 ? 0 : cuts[j - 1]!));
      const total = Math.floor(rand() * 10_00_000_00);
      const r = splitPercent(total, bp);
      expect(r.ok).toBe(true);
      if (r.ok) expect(sum(r.shares)).toBe(total);
    }
  });
});

describe('splitShares', () => {
  it('splits 2:1:1', () => {
    expect(splitShares(1_000, [2, 1, 1])).toEqual({ ok: true, shares: [500, 250, 250] });
  });

  it('needs somebody to hold a share', () => {
    expect(splitShares(1_000, [0, 0])).toEqual({ ok: false, reason: 'invalid' });
  });
});

describe('parsePercent / formatPercent', () => {
  it('parses to basis points without floats', () => {
    expect(parsePercent('33.33')).toBe(3333);
    expect(parsePercent('50')).toBe(5000);
    expect(parsePercent('12.5%')).toBe(1250);
    expect(parsePercent(' 0.01 ')).toBe(1);
    expect(parsePercent('100')).toBe(10_000);
  });

  it('rejects what is not a 0–100 percentage with two decimals at most', () => {
    expect(parsePercent('100.01')).toBeNull();
    expect(parsePercent('33.333')).toBeNull();
    expect(parsePercent('-5')).toBeNull();
    expect(parsePercent('abc')).toBeNull();
    expect(parsePercent('')).toBeNull();
  });

  it('formats back without trailing zeros', () => {
    expect(formatPercent(3333)).toBe('33.33');
    expect(formatPercent(5000)).toBe('50');
    expect(formatPercent(1250)).toBe('12.5');
    expect(formatPercent(3303)).toBe('33.03');
    for (const bp of [0, 1, 99, 3333, 5050, 10_000]) expect(parsePercent(formatPercent(bp))).toBe(bp);
  });
});
