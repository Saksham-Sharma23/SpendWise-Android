/**
 * Turning one shared expense into exact shares — pure integer arithmetic.
 *
 * The rule every function here keeps: the shares add up to the total EXACTLY,
 * to the paisa. ₹100 split three ways is 33.34 + 33.33 + 33.33, never three
 * 33.33s that silently lose a paisa, and never a float that drifts. A rounding
 * error in a split is money that vanishes from somebody's balance.
 *
 * Everything is tested in `__tests__/split.test.ts`, including thousands of
 * random splits that must each sum exactly.
 */

// lib/money.ts is pure and imports nothing, so this file stays loadable in
// Node without pulling in React Native.
import { MAX_AMOUNT_PAISE } from '../../lib/money';

/**
 * The largest expense a group can record: the app-wide ₹10 crore typo guard
 * (`lib/money.ts`), which Groups has always used while the three form schemas
 * declared ₹100 crore by mistake (B5) — the same guard, ten times apart.
 *
 * The value also has to stay at or below ₹10 crore for the split maths here:
 * it keeps `total × weight` — weights reach 10,000 basis points — at most
 * 1e14, far below Number.MAX_SAFE_INTEGER (~9e15), so the integer arithmetic
 * below is exact. A test in `__tests__/split.test.ts` pins that.
 */
export const MAX_EXPENSE_PAISE = MAX_AMOUNT_PAISE;

/** A percentage as basis points: 100% = 10,000; 33.33% = 3,333. */
export const FULL_PERCENT_BP = 10_000;

/**
 * Split `total` paise in proportion to `weights`, exactly (largest-remainder
 * / Hamilton method, all in integers).
 *
 * Each person first gets floor(total × w / W). The paise left over — always
 * fewer than the number of people — go one each to the people whose exact
 * share had the largest fractional part. Ties go to whoever is listed first,
 * so the same inputs always produce the same split.
 *
 * Weights of zero get nothing. All-zero weights return all zeros.
 */
export function allocate(total: number, weights: readonly number[]): number[] {
  assertPaise(total);
  for (const w of weights) {
    if (!Number.isSafeInteger(w) || w < 0) throw new Error(`Weights must be non-negative integers, got ${w}`);
  }
  const W = weights.reduce((a, w) => a + w, 0);
  if (W === 0) return weights.map(() => 0);

  const floors = weights.map((w) => Math.floor((total * w) / W));
  let left = total - floors.reduce((a, v) => a + v, 0);

  if (left > 0) {
    // Remainder of each exact share, in units of 1/W paise. Integer, so exact.
    const order = weights
      .map((w, i) => ({ i, rem: (total * w) % W, w }))
      .filter((x) => x.w > 0)
      .sort((a, b) => b.rem - a.rem || a.i - b.i);
    for (const { i } of order) {
      if (left === 0) break;
      floors[i]! += 1;
      left -= 1;
    }
  }
  return floors;
}

/** Equal shares for `n` people: they differ by at most one paisa, extras to the first listed. */
export function splitEqual(total: number, n: number): number[] {
  if (!Number.isSafeInteger(n) || n <= 0) throw new Error('An equal split needs at least one person');
  return allocate(
    total,
    Array.from({ length: n }, () => 1),
  );
}

export type SplitCheck =
  | { ok: true; shares: number[] }
  | { ok: false; reason: 'mismatch'; remaining: number }
  | { ok: false; reason: 'invalid' };

/**
 * Exact amounts typed per person. Valid only when they add up to the total;
 * otherwise `remaining` says how much is left to assign (negative = too much),
 * which is what the form's "₹120 left" footer shows.
 */
export function splitExact(total: number, amounts: readonly number[]): SplitCheck {
  if (!isPaise(total) || amounts.some((a) => !isPaise(a))) return { ok: false, reason: 'invalid' };
  const sum = amounts.reduce((a, v) => a + v, 0);
  if (sum !== total) return { ok: false, reason: 'mismatch', remaining: total - sum };
  return { ok: true, shares: [...amounts] };
}

/**
 * Percentages per person, in basis points. They must total exactly 100%;
 * `remaining` is then in basis points.
 */
export function splitPercent(total: number, basisPoints: readonly number[]): SplitCheck {
  if (!isPaise(total) || basisPoints.some((b) => !Number.isSafeInteger(b) || b < 0)) {
    return { ok: false, reason: 'invalid' };
  }
  const sum = basisPoints.reduce((a, v) => a + v, 0);
  if (sum !== FULL_PERCENT_BP) return { ok: false, reason: 'mismatch', remaining: FULL_PERCENT_BP - sum };
  return { ok: true, shares: allocate(total, basisPoints) };
}

/** Shares like 2 : 1 : 1. At least one person must hold a share. */
export function splitShares(total: number, units: readonly number[]): SplitCheck {
  if (!isPaise(total) || units.some((u) => !Number.isSafeInteger(u) || u < 0)) {
    return { ok: false, reason: 'invalid' };
  }
  if (units.every((u) => u === 0)) return { ok: false, reason: 'invalid' };
  return { ok: true, shares: allocate(total, units) };
}

/**
 * Parse a typed percentage straight to basis points, by string — never
 * through a float. '33.33' → 3333 · '50' → 5000 · '12.5%' → 1250.
 * Returns null for anything that is not 0–100 with at most two decimals.
 */
export function parsePercent(raw: string): number | null {
  const s = raw.trim().replace(/%$/, '').trim();
  const m = /^(\d{1,3})(?:\.(\d{0,2}))?$/.exec(s);
  if (!m) return null;
  const whole = Number(m[1]);
  const frac = Number((m[2] ?? '').padEnd(2, '0'));
  const bp = whole * 100 + frac;
  return bp <= FULL_PERCENT_BP ? bp : null;
}

/** Basis points back to a display string: 3333 → '33.33', 5000 → '50'. */
export function formatPercent(bp: number): string {
  const whole = Math.trunc(bp / 100);
  const frac = Math.abs(bp % 100);
  return frac === 0 ? String(whole) : `${whole}.${String(frac).padStart(2, '0').replace(/0$/, '')}`;
}

function isPaise(v: number): boolean {
  return Number.isSafeInteger(v) && v >= 0 && v <= MAX_EXPENSE_PAISE;
}

function assertPaise(v: number): void {
  if (!isPaise(v)) throw new Error(`Amount must be whole paise between 0 and ${MAX_EXPENSE_PAISE}, got ${v}`);
}
