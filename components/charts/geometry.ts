/**
 * Chart geometry — pure functions with no React Native imports, so the maths
 * the charts draw with is unit-tested in Node (components/charts/__tests__).
 *
 * Functions marked 'worklet' also run on the UI thread inside gesture
 * handlers; the directive is a plain string, harmless everywhere else.
 */

/**
 * A smooth curve through the points (Catmull–Rom converted to cubic Béziers).
 * Tension is kept low so the curve never overshoots below zero or above the
 * month's real value by a visible amount.
 */
export function smoothPath(xy: [number, number][]): string {
  'worklet';
  if (xy.length === 0) return '';
  if (xy.length === 1) return `M${xy[0]![0]},${xy[0]![1]}`;
  const t = 0.18;
  let d = `M${xy[0]![0]},${xy[0]![1]}`;
  for (let i = 0; i < xy.length - 1; i++) {
    const p0 = xy[i - 1] ?? xy[i]!;
    const p1 = xy[i]!;
    const p2 = xy[i + 1]!;
    const p3 = xy[i + 2] ?? p2;
    const c1x = p1[0] + (p2[0] - p0[0]) * t;
    const c1y = p1[1] + (p2[1] - p0[1]) * t;
    const c2x = p2[0] - (p3[0] - p1[0]) * t;
    const c2y = p2[1] - (p3[1] - p1[1]) * t;
    d += ` C${c1x},${c1y} ${c2x},${c2y} ${p2[0]},${p2[1]}`;
  }
  return d;
}

/**
 * Spread a series of any length over a fixed number of evenly spaced samples,
 * interpolating linearly between neighbours.
 *
 * This is what lets one range morph into another: 3 months and 24 months are
 * different-length arrays and cannot be interpolated element by element, but
 * their resamplings can. The first and last values always survive exactly, so
 * the curve still starts and ends on real months.
 */
export function resample(values: number[], samples: number): number[] {
  if (samples <= 0) return [];
  const n = values.length;
  if (n === 0) return new Array(samples).fill(0) as number[];
  if (n === 1 || samples === 1) return new Array(samples).fill(values[0]!) as number[];

  const out: number[] = [];
  for (let j = 0; j < samples; j++) {
    const at = (j / (samples - 1)) * (n - 1);
    const i = Math.min(n - 2, Math.floor(at));
    const f = at - i;
    out.push(values[i]! + (values[i + 1]! - values[i]!) * f);
  }
  return out;
}

/**
 * The point index under a finger at `x`, for `count` points spread edge to
 * edge across `width` (first point at x=0, last at x=width). Clamped, so a
 * finger dragged past either end holds the end point.
 */
export function scrubIndex(x: number, width: number, count: number): number {
  'worklet';
  if (count <= 1 || width <= 0) return 0;
  const step = width / (count - 1);
  return Math.max(0, Math.min(count - 1, Math.round(x / step)));
}

/** The x of point `index` under the same edge-to-edge spacing as `scrubIndex`. */
export function pointX(index: number, width: number, count: number): number {
  'worklet';
  if (count <= 1) return width / 2;
  return (width / (count - 1)) * index;
}

/**
 * Every how-many points to print an axis label so at most `maxLabels` fit.
 * 24 months → every 4th; 12 → every 2nd; 6 or fewer → all of them.
 */
export function labelStep(count: number, maxLabels = 6): number {
  if (count <= maxLabels) return 1;
  return Math.ceil(count / maxLabels);
}

/**
 * A "nice" ceiling for a value axis: the smallest 1 / 2 / 2.5 / 5 × 10ⁿ at
 * or above `max`, so gridlines land on round figures (₹50K, not ₹47,312).
 * Works in whatever unit it is given (paise here) and returns an integer.
 */
export function niceCeiling(max: number): number {
  if (!(max > 0)) return 1;
  const exp = Math.floor(Math.log10(max));
  const base = 10 ** exp;
  for (const m of [1, 2, 2.5, 5, 10]) {
    const v = Math.round(m * base);
    if (v >= max) return v;
  }
  return Math.round(10 * base);
}

/**
 * Which arc of a donut a touch landed on, or -1 for the hole, the outside
 * or a gap. `x`/`y` are relative to the donut's top-left; the ring is centred
 * in a `size` box, `thickness` wide, and starts at 12 o'clock going clockwise
 * (as the donut draws it). `slop` widens the ring for fingers.
 */
export function hitArc(x: number, y: number, size: number, thickness: number, arcs: Arc[], slop = 10): number {
  const c = size / 2;
  const dx = x - c;
  const dy = y - c;
  const r = Math.hypot(dx, dy);
  const mid = (size - thickness) / 2;
  if (Math.abs(r - mid) > thickness / 2 + slop) return -1;

  // atan2 from 12 o'clock, clockwise, normalised to 0–1.
  let a = Math.atan2(dx, -dy) / (2 * Math.PI);
  if (a < 0) a += 1;
  return arcs.findIndex((arc) => arc.length > 0 && a >= arc.start && a <= arc.start + arc.length);
}

export interface Arc {
  /** Where the segment starts along the ring, 0–1 of the circumference. */
  start: number;
  /** How much of the ring it covers, 0–1. */
  length: number;
}

/**
 * Lay slices round a ring, in order, leaving `gap` (a fraction of the ring)
 * between neighbours so each reads as its own segment. A slice too small to
 * survive its gap keeps a sliver instead of vanishing or going negative.
 * A single slice is a full ring with no gap.
 */
export function donutArcs(values: number[], gap = 0.008): Arc[] {
  const total = values.reduce((a, v) => a + Math.max(0, v), 0);
  if (total <= 0) return values.map(() => ({ start: 0, length: 0 }));
  const live = values.filter((v) => v > 0).length;
  const g = live > 1 ? gap : 0;

  const arcs: Arc[] = [];
  let cursor = 0;
  for (const v of values) {
    const share = Math.max(0, v) / total;
    const length = share === 0 ? 0 : Math.max(share * 0.5, share - g);
    arcs.push({ start: cursor + (share - length) / 2, length });
    cursor += share;
  }
  return arcs;
}
