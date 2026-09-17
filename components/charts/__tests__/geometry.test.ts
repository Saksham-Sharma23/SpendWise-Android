import { donutArcs, hitArc, labelStep, niceCeiling, pointX, resample, scrubIndex, smoothPath } from '../geometry';

describe('resample', () => {
  it('leaves a series of the wanted length alone', () => {
    expect(resample([5, 9, 2], 3)).toEqual([5, 9, 2]);
  });

  it('keeps the first and last values exactly', () => {
    // Every range morph starts and ends on real months, so the ends must not
    // drift — a trend whose latest month is wrong is worse than no animation.
    for (const n of [2, 3, 6, 12, 24]) {
      for (const samples of [2, 3, 7, 24, 32]) {
        const values = Array.from({ length: n }, (_, i) => i * 100 + 7);
        const out = resample(values, samples);
        expect(out).toHaveLength(samples);
        expect(out[0]).toBe(values[0]);
        expect(out[samples - 1]).toBe(values[n - 1]);
      }
    }
  });

  it('interpolates linearly between neighbours', () => {
    // 3 values over 5 samples: the new points land halfway between the old.
    expect(resample([0, 10, 0], 5)).toEqual([0, 5, 10, 5, 0]);
  });

  it('stretches a 3-month series onto a 24-month grid monotonically', () => {
    const out = resample([0, 50, 100], 24);
    expect(out).toHaveLength(24);
    for (let i = 1; i < out.length; i++) expect(out[i]!).toBeGreaterThanOrEqual(out[i - 1]!);
  });

  it('survives the empty and single-value cases a fresh ledger produces', () => {
    expect(resample([], 4)).toEqual([0, 0, 0, 0]);
    expect(resample([42], 3)).toEqual([42, 42, 42]);
    expect(resample([1, 2, 3], 0)).toEqual([]);
  });
});

describe('scrubIndex / pointX', () => {
  it('snaps a finger to the nearest point, edge to edge', () => {
    // 5 points across 400px sit at 0, 100, 200, 300, 400.
    expect(scrubIndex(0, 400, 5)).toBe(0);
    expect(scrubIndex(49, 400, 5)).toBe(0);
    expect(scrubIndex(51, 400, 5)).toBe(1);
    expect(scrubIndex(400, 400, 5)).toBe(4);
  });

  it('holds the end point when dragged past either edge', () => {
    expect(scrubIndex(-80, 400, 5)).toBe(0);
    expect(scrubIndex(900, 400, 5)).toBe(4);
  });

  it('round-trips: the index at a point x is that point', () => {
    for (const count of [3, 6, 12, 24]) {
      for (let i = 0; i < count; i++) {
        expect(scrubIndex(pointX(i, 331, count), 331, count)).toBe(i);
      }
    }
  });

  it('handles a single point and zero width', () => {
    expect(scrubIndex(123, 400, 1)).toBe(0);
    expect(scrubIndex(10, 0, 6)).toBe(0);
    expect(pointX(0, 400, 1)).toBe(200);
  });
});

describe('labelStep', () => {
  it('prints at most six labels', () => {
    expect(labelStep(3)).toBe(1);
    expect(labelStep(6)).toBe(1);
    expect(labelStep(12)).toBe(2);
    expect(labelStep(24)).toBe(4);
    for (const n of [7, 12, 18, 24, 36]) expect(Math.ceil(n / labelStep(n))).toBeLessThanOrEqual(6);
  });
});

describe('niceCeiling', () => {
  it('rounds up to 1 / 2 / 2.5 / 5 × 10ⁿ', () => {
    expect(niceCeiling(47_312)).toBe(50_000);
    expect(niceCeiling(100)).toBe(100);
    expect(niceCeiling(101)).toBe(200);
    expect(niceCeiling(2_100)).toBe(2_500);
    expect(niceCeiling(9_100_000)).toBe(10_000_000);
  });

  it('never returns zero, so nothing divides by it', () => {
    expect(niceCeiling(0)).toBe(1);
    expect(niceCeiling(-5)).toBe(1);
  });
});

describe('donutArcs', () => {
  it('lays slices in order with a gap between neighbours', () => {
    const arcs = donutArcs([50, 30, 20], 0.01);
    expect(arcs[0]!.start).toBeCloseTo(0.005);
    expect(arcs[0]!.length).toBeCloseTo(0.49);
    expect(arcs[1]!.start).toBeCloseTo(0.505);
    expect(arcs[2]!.start + arcs[2]!.length).toBeCloseTo(0.995);
  });

  it('draws one slice as a full ring with no gap', () => {
    expect(donutArcs([42], 0.01)).toEqual([{ start: 0, length: 1 }]);
  });

  it('keeps a tiny slice visible instead of letting the gap swallow it', () => {
    const arcs = donutArcs([999, 1], 0.01);
    expect(arcs[1]!.length).toBeGreaterThan(0);
  });

  it('draws nothing for an empty total', () => {
    expect(donutArcs([0, 0])).toEqual([
      { start: 0, length: 0 },
      { start: 0, length: 0 },
    ]);
  });
});

describe('hitArc', () => {
  // A 200px donut, 20px ring: the ring's centre line sits 90px from the middle.
  const arcs = donutArcs([50, 25, 25], 0);

  it('finds the arc under a touch, clockwise from 12 o’clock', () => {
    expect(hitArc(100 + 60, 100 - 60, 200, 20, arcs)).toBe(0); // 1–2 o'clock → first half
    expect(hitArc(100 - 60, 100 + 60, 200, 20, arcs)).toBe(1); // 7–8 o'clock → third quarter
    expect(hitArc(100 - 89, 100 - 5, 200, 20, arcs)).toBe(2); // just before 12, going round → last quarter
  });

  it('ignores the hole and the outside', () => {
    expect(hitArc(100, 100, 200, 20, arcs)).toBe(-1);
    expect(hitArc(100 + 40, 100, 200, 20, arcs)).toBe(-1);
    expect(hitArc(0, 0, 200, 20, arcs)).toBe(-1);
  });

  it('forgives a finger slightly off the ring', () => {
    expect(hitArc(100 + 105, 100, 200, 20, arcs)).toBe(0);
  });
});

describe('smoothPath', () => {
  it('starts at the first point and ends at the last', () => {
    const d = smoothPath([
      [0, 10],
      [50, 20],
      [100, 5],
    ]);
    expect(d.startsWith('M0,10')).toBe(true);
    expect(d.endsWith('100,5')).toBe(true);
  });

  it('handles empty and single-point input', () => {
    expect(smoothPath([])).toBe('');
    expect(smoothPath([[3, 4]])).toBe('M3,4');
  });
});
