import { colors } from './theme';

/**
 * Deterministic fallback colour for a category that has none stored.
 * Seeded categories carry their own colour; this covers the rest, so the same
 * name always gets the same hue on every screen without storing anything.
 *
 * Lives in lib/ because the ledger, the forms, the dashboard and (Phase 6)
 * sheets all need it, and features may not import one another (#9).
 */
const PALETTE = ['#E8833A', '#3A7CA5', '#8B5FBF', '#D4A32C', '#D4544E', '#4B9B6E', '#4E86C7', '#C2548A'];

export function colorForCategory(name: string | null): string {
  if (!name) return colors.muted;
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length]!;
}

/** The colour to draw a category in: its own, else the deterministic fallback. */
export function categoryColor(color: string | null | undefined, name: string | null): string {
  return color ?? colorForCategory(name);
}
