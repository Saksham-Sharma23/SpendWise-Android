/**
 * Money handling. This is the ONLY file allowed to turn a number into a
 * displayable rupee string, and the only place `parseFloat` may appear.
 *
 * Everything in the app stores and computes integer paise. A value becomes a
 * formatted string exactly once, at the render boundary. See CLAUDE.md #2.
 */

// ---------------------------------------------------------------------------
// Conversion
// ---------------------------------------------------------------------------

/**
 * Rupees -> integer paise. Accepts a number or a user-typed string.
 *
 * Rounds rather than truncates: 12.345 -> 1235 paise, not 1234. Truncation
 * would systematically under-count, and a systematic error is worse than a
 * random one because it accumulates in the same direction.
 */
export function toPaise(rupees: number | string): number {
  const n = typeof rupees === 'string' ? parseFloat(rupees) : rupees;
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

/** Integer paise -> a rupee number. Only for display or chart values. */
export function fromPaise(paise: number): number {
  return paise / 100;
}

/** Integer paise -> a plain '1234.50' string, for exports and form fields. */
export function paiseToDecimalString(paise: number): string {
  const sign = paise < 0 ? '-' : '';
  const abs = Math.abs(paise);
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  return `${sign}${whole}.${String(frac).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Indian digit grouping
// ---------------------------------------------------------------------------

/**
 * Hermes on Android delegates Intl to the platform's ICU, so 'en-IN' lakh
 * grouping normally works. But where ICU is unavailable it falls back to
 * en-US grouping SILENTLY — ₹124,500.00 instead of ₹1,24,500.00 — which is
 * exactly the kind of bug that ships unnoticed.
 *
 * So we assert it once, at module load, against a known input, and fall back
 * to manual grouping when the assertion fails.
 */
const ICU_PROBE = 124500;
const ICU_EXPECTED = '1,24,500';

export const HAS_INDIAN_ICU: boolean = (() => {
  try {
    const formatted = ICU_PROBE.toLocaleString('en-IN', {
      maximumFractionDigits: 0,
    });
    // Normalise any non-breaking or narrow spaces some ICU builds emit.
    return formatted.replace(/[  ]/g, '') === ICU_EXPECTED;
  } catch {
    return false;
  }
})();

/**
 * Manual lakh/crore grouping: last three digits, then pairs.
 * 12345678.9 -> '1,23,45,678.90'
 */
export function groupIndianManually(value: number, fractionDigits = 2): string {
  const negative = value < 0;
  const fixed = Math.abs(value).toFixed(fractionDigits);
  const parts = fixed.split('.');
  const whole = parts[0] ?? '0';
  const frac = parts[1];

  let grouped: string;
  if (whole.length <= 3) {
    grouped = whole;
  } else {
    const lastThree = whole.slice(-3);
    const rest = whole.slice(0, -3);
    // Group the remaining digits in pairs, right to left.
    const pairs = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
    grouped = `${pairs},${lastThree}`;
  }

  const body = frac ? `${grouped}.${frac}` : grouped;
  return negative ? `-${body}` : body;
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/**
 * A whole-number COUNT with Indian grouping: 50000 -> '50,000', 123456 -> '1,23,456'.
 * For "50,000 entries", not money — money always goes through formatINR.
 */
export function formatCount(n: number): string {
  return groupIndianManually(Math.trunc(Number.isFinite(n) ? n : 0), 0);
}

export interface FormatOptions {
  /** Drop the decimal part. Useful in dense chart axes. */
  whole?: boolean;
  /** Omit the ₹ symbol (for inputs and CSV cells). */
  bare?: boolean;
  /** Render as '+₹500' / '-₹500'. */
  signed?: boolean;
}

/**
 * The one function that produces a rupee string. Takes PAISE.
 *
 *   formatINR(12450000)                 -> '₹1,24,500.00'
 *   formatINR(12450000, { whole: true }) -> '₹1,24,500'
 */
export function formatINR(paise: number, opts: FormatOptions = {}): string {
  const { whole = false, bare = false, signed = false } = opts;

  if (!Number.isFinite(paise)) paise = 0;

  const rupees = fromPaise(Math.abs(Math.trunc(paise)));
  const fractionDigits = whole ? 0 : 2;

  let body: string;
  if (HAS_INDIAN_ICU) {
    body = rupees.toLocaleString('en-IN', {
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    });
  } else {
    body = groupIndianManually(rupees, fractionDigits);
  }

  const symbol = bare ? '' : '₹';
  const isNegative = paise < 0;

  if (signed) {
    const sign = isNegative ? '-' : '+';
    return `${sign}${symbol}${body}`;
  }
  return isNegative ? `-${symbol}${body}` : `${symbol}${body}`;
}

/**
 * Compact form for tight spaces: ₹1.2L, ₹3.4Cr. Uses Indian scale words
 * rather than K/M, because a lakh is how the number is actually read here.
 */
export function formatINRCompact(paise: number): string {
  const rupees = Math.abs(fromPaise(paise));
  const sign = paise < 0 ? '-' : '';

  if (rupees >= 1_00_00_000) return `${sign}₹${(rupees / 1_00_00_000).toFixed(1)}Cr`;
  if (rupees >= 1_00_000) return `${sign}₹${(rupees / 1_00_000).toFixed(1)}L`;
  if (rupees >= 1_000) return `${sign}₹${(rupees / 1_000).toFixed(1)}K`;
  return formatINR(paise, { whole: true });
}

// ---------------------------------------------------------------------------
// Parsing messy input (used by the Phase 6 importer)
// ---------------------------------------------------------------------------

/**
 * Parse an amount out of a spreadsheet cell straight to integer paise,
 * without ever going through a float that could drift.
 *
 * Handles: '₹ 1,24,500.00' · '(2,300)' · '2300 DR' · '1 234,50' · '-450'
 * Returns null when nothing numeric is present.
 *
 * `(x)` and a trailing DR both mean a debit — negative.
 */
export function parseAmountToPaise(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? Math.round(raw * 100) : null;
  }

  let s = String(raw).trim();
  if (!s) return null;

  let negative = false;

  // Accounting parentheses.
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }

  // Trailing debit/credit markers. Deliberately not using \b: it does not
  // match between a digit and a letter, so '2300dr' would slip through.
  if (/(^|[^A-Z])DR($|[^A-Z])/i.test(s)) negative = true;
  if (/(^|[^A-Z])CR($|[^A-Z])/i.test(s)) negative = false;
  s = s.replace(/(DR|CR)(?![A-Z])/gi, '');

  // Currency symbols, words, and spaces.
  s = s.replace(/[₹$€£]/g, '').replace(/\b(INR|RS\.?)\b/gi, '').replace(/\s/g, '');

  if (s.startsWith('-')) {
    negative = true;
    s = s.slice(1);
  } else if (s.startsWith('+')) {
    s = s.slice(1);
  }

  // Decide which separator is decimal. If both appear, the LAST one wins.
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  let decimalSep: ',' | '.' | null = null;

  if (lastComma >= 0 && lastDot >= 0) {
    decimalSep = lastComma > lastDot ? ',' : '.';
  } else {
    // Only one kind of separator present. Deciding whether it is a decimal
    // point or a thousands group is genuinely ambiguous at exactly 3 digits:
    //   '1.234'  -> almost certainly 1234 (thousands)
    //   '12.345' -> almost certainly 12.345 (a decimal with 3 places)
    // The tiebreaker: a thousands separator appears at regular intervals and
    // never leaves fewer than 1 or more than 3 digits before it. If the whole
    // string is a single separator with exactly 3 trailing digits AND the
    // leading group is 1-3 digits, read it as thousands; otherwise decimal.
    const idx = lastDot >= 0 ? lastDot : lastComma;
    const sep: ',' | '.' = lastDot >= 0 ? '.' : ',';

    if (idx >= 0) {
      const after = s.length - idx - 1;
      const occurrences = s.split(sep).length - 1;

      if (after > 0 && after <= 2) {
        // 1 or 2 trailing digits is unambiguously a decimal fraction.
        decimalSep = sep;
      } else if (after === 3) {
        // Exactly 3 trailing digits is the ambiguous case, and the right
        // answer depends on WHICH separator it is:
        //
        //   ','  In Indian and Anglo sheets — which is what this app will see
        //        — a comma is thousands grouping essentially always. '2,300'
        //        is ₹2,300, not ₹2.30. Comma-as-decimal only appears in
        //        European exports, and those are caught above by the
        //        both-separators-present branch ('1.234,50').
        //
        //   '.'  Genuinely ambiguous. '1.234' looks like grouping, '12.345'
        //        looks like a 3-place decimal, and the digits do not settle
        //        it. We default to DECIMAL because the failure modes are not
        //        equally bad: reading '12.345' as ₹12,345 inflates a
        //        transaction 1000x and is easy to miss, while the reverse
        //        understates it and stands out in the import review step.
        //
        // Repeated separators are decisive either way — '1.234.567' can only
        // be grouping.
        if (occurrences > 1) decimalSep = null;
        else decimalSep = sep === ',' ? null : sep;
      } else {
        // 4+ trailing digits is never a thousands group.
        decimalSep = after > 0 ? sep : null;
      }
    }
  }

  let wholePart: string;
  let fracPart = '';

  if (decimalSep) {
    const idx = decimalSep === ',' ? lastComma : lastDot;
    wholePart = s.slice(0, idx);
    fracPart = s.slice(idx + 1);
  } else {
    wholePart = s;
  }

  wholePart = wholePart.replace(/[.,]/g, '');
  fracPart = fracPart.replace(/[^\d]/g, '');

  if (!/^\d*$/.test(wholePart) || wholePart === '') {
    if (wholePart === '' && fracPart !== '') {
      wholePart = '0';
    } else {
      return null;
    }
  }

  // Pad/truncate the fraction to exactly two digits, rounding the third.
  let paiseFrac: number;
  if (fracPart.length === 0) paiseFrac = 0;
  else if (fracPart.length === 1) paiseFrac = Number(fracPart) * 10;
  else if (fracPart.length === 2) paiseFrac = Number(fracPart);
  else paiseFrac = Math.round(Number(fracPart.slice(0, 3)) / 10);

  const total = Number(wholePart) * 100 + paiseFrac;
  if (!Number.isFinite(total)) return null;

  return negative ? -total : total;
}
