/**
 * Deterministic fallback colour for a category that has none stored.
 * Seeded categories carry their own colour; this covers the rest, so the same
 * name always gets the same hue on every screen without storing anything.
 *
 * Lives in lib/ because the ledger, the forms, the dashboard and (Phase 6)
 * sheets all need it, and features may not import one another (#9).
 */
const PALETTE = ['#E8833A', '#3A7CA5', '#8B5FBF', '#D4A32C', '#D4544E', '#4B9B6E', '#4E86C7', '#C2548A'];

/**
 * The palette colour for a name, or null for "no name" (uncategorised).
 *
 * Returning null rather than a theme colour is deliberate (B10). This used to
 * answer `colors.muted`, a value from whichever palette was active when it
 * ran — and callers bake the result into row objects once per FETCH, so
 * uncategorised rows kept the previous theme's grey until the next query. The
 * caller resolves null against the live theme at RENDER instead.
 *
 * The palette colours themselves are theme-independent by design: the same
 * name is the same hue in both themes, so baking those in is safe.
 */
export function colorForCategory(name: string | null): string | null {
  // `name === null` means uncategorised. An empty STRING is still a name, and
  // hashes like any other, so `colorForName('')` keeps its promise.
  if (name == null) return null;
  return colorForName(name);
}

/**
 * The colour to draw a category in: its own, else the deterministic fallback,
 * else null — meaning "use the theme's neutral", which only a renderer with
 * `useColors()` can know.
 */
export function categoryColor(color: string | null | undefined, name: string | null): string | null {
  return color ?? colorForCategory(name);
}

/**
 * The palette colour for a name that definitely has one.
 *
 * For callers that always pass a real name (a friend's avatar, a category
 * chip), so they get a `string` without each one writing its own `?? fallback`
 * for a case that cannot happen. Anything that can genuinely be uncategorised
 * uses `categoryColor` and resolves null against the live theme at render.
 */
export function colorForName(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length]!;
}
