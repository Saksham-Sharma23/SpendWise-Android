/**
 * Stable dedupe hashing for transactions.
 *
 * Used in two places that must agree exactly:
 *   - Phase 2 writes a hash on every transaction as it is created
 *   - Phase 6's importer looks candidate rows up by that hash to find rows
 *     already in the ledger, with one indexed query instead of a scan
 *
 * This is NOT a security hash. It is a bucketing key for "these two rows look
 * like the same purchase", so a fast non-cryptographic hash is the right tool
 * and avoids pulling in expo-crypto for a synchronous path.
 */

/**
 * Normalise a free-text note so trivially different spellings of the same
 * purchase collide: case, surrounding whitespace, internal runs of spaces,
 * and punctuation are all discarded.
 *
 * Bank narrations especially need this — the same UPI payee arrives as
 * 'UPI/ZOMATO/123456' one month and 'UPI-Zomato-998877' the next. Stripping
 * the digits too would over-collide (two different ₹250 Zomato orders in a
 * day are both real), so digits are kept.
 */
export function normalizeNote(note: string | null | undefined): string {
  if (!note) return '';
  return note
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** FNV-1a, 32-bit, with a configurable offset basis. Deterministic. */
function fnv1a(input: string, seed = 0x811c9dc5): number {
  let h = seed >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    // h *= 16777619, kept in 32-bit range without overflowing the mantissa.
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}

/**
 * The dedupe key for one transaction.
 *
 * Deliberately built from date + amount + normalised note ONLY. Category is
 * excluded because the same purchase is often categorised differently by a
 * bank export and by hand, and including it would make genuine duplicates
 * look distinct — the exact failure the importer's review step exists to
 * avoid.
 *
 * Two hashes are combined so that near-collisions in one do not produce a
 * false duplicate on their own.
 */
export function makeDedupeHash(date: string, amountPaise: number, note: string | null | undefined): string {
  const base = `${date}|${amountPaise}|${normalizeNote(note)}`;
  // Two independent seeds give a 64-bit key from a 32-bit hash. Using the
  // same seed twice would only repeat the first value and halve the space.
  const a = fnv1a(base, 0x811c9dc5).toString(16).padStart(8, '0');
  const b = fnv1a(base, 0x01000193).toString(16).padStart(8, '0');
  return `${a}${b}`;
}
