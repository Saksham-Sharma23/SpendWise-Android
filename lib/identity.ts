import { colorForCategory } from './categoryColor';

/**
 * Deterministic look for anything named — a subscription, a group, a friend —
 * ported from the web app's `lib/group-utils.ts`.
 *
 * Nothing is persisted: the same name always produces the same icon and
 * colour, so Netflix looks the same on the phone and in the browser, and a
 * subscription with no category still gets something better than a grey blob.
 *
 * Lives in lib/ because the Tracker and Groups both use it, and features may
 * not import one another (CLAUDE.md #9). A subscription that HAS a category
 * uses the category's look instead (features/tracker/renewal.ts `enrich`).
 */

/**
 * Names people actually type, mapped to a fitting icon. Matching is on a
 * lowercased substring, so "Netflix (family plan)" still finds it.
 *
 * Icon names are from components/ui/CategoryIcon's set, so the same renderer
 * draws them.
 */
const KNOWN: [needle: string, icon: string][] = [
  ['netflix', 'clapperboard'],
  ['prime', 'clapperboard'],
  ['hotstar', 'clapperboard'],
  ['disney', 'clapperboard'],
  ['jiocinema', 'clapperboard'],
  ['sony', 'clapperboard'],
  ['zee', 'clapperboard'],
  ['youtube', 'film'],
  ['spotify', 'music'],
  ['music', 'music'],
  ['gaana', 'music'],
  ['wynk', 'music'],
  ['audible', 'book-open'],
  ['kindle', 'book-open'],
  ['course', 'graduation-cap'],
  ['udemy', 'graduation-cap'],
  ['coursera', 'graduation-cap'],
  ['school', 'graduation-cap'],
  ['tuition', 'graduation-cap'],
  ['gym', 'dumbbell'],
  ['fitness', 'dumbbell'],
  ['cult', 'dumbbell'],
  ['yoga', 'dumbbell'],
  ['rent', 'house'],
  ['maintenance', 'house'],
  ['society', 'house'],
  ['electricity', 'zap'],
  ['power', 'zap'],
  ['water', 'droplets'],
  ['gas', 'zap'],
  ['broadband', 'wifi'],
  ['internet', 'wifi'],
  ['wifi', 'wifi'],
  ['airtel', 'smartphone'],
  ['jio', 'smartphone'],
  ['vi ', 'smartphone'],
  ['mobile', 'smartphone'],
  ['phone', 'smartphone'],
  ['recharge', 'smartphone'],
  ['insurance', 'briefcase'],
  ['policy', 'briefcase'],
  ['lic', 'briefcase'],
  ['emi', 'landmark'],
  ['loan', 'landmark'],
  ['sip', 'trending-up'],
  ['mutual', 'trending-up'],
  ['invest', 'trending-up'],
  ['icloud', 'laptop'],
  ['drive', 'laptop'],
  ['dropbox', 'laptop'],
  ['storage', 'laptop'],
  ['cloud', 'laptop'],
  ['github', 'laptop'],
  ['chatgpt', 'sparkles'],
  ['claude', 'sparkles'],
  ['openai', 'sparkles'],
  ['ai', 'sparkles'],
  ['adobe', 'scissors'],
  ['canva', 'scissors'],
  ['figma', 'scissors'],
  ['notion', 'book-open'],
  ['news', 'book-open'],
  ['paper', 'book-open'],
  ['milk', 'coffee'],
  ['swiggy', 'utensils'],
  ['zomato', 'utensils'],
  ['blinkit', 'shopping-basket'],
  ['zepto', 'shopping-basket'],
  ['grocery', 'shopping-basket'],
  ['car', 'car'],
  ['bike', 'bike'],
  ['fastag', 'car'],
  ['parking', 'car'],
  ['pet', 'paw-print'],
  ['medical', 'heart-pulse'],
  ['health', 'heart-pulse'],
  ['doctor', 'heart-pulse'],
];

/** Icons used when nothing matches — varied enough that a list is not monotonous. */
const FALLBACK_ICONS = [
  'repeat',
  'credit-card',
  'receipt',
  'sparkles',
  'wallet',
  'tag',
  'ticket',
  'coins',
] as const;

/** Stable 32-bit hash of a name. Same function the category colour uses. */
function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/**
 * A needle this long may match the START of a word, so "Netflixfamily" and
 * "Spotifypremium" still resolve. Below it, only whole words count: the short
 * keys are the dangerous ones.
 */
const PREFIX_MATCH_MIN = 5;

/**
 * Match on WORDS, not substrings (B19).
 *
 * Plain `includes` made every short key a trap, because it matched inside
 * unrelated words: "Petrol" → pet → paw-print, "LinkedIn Premium" → emi →
 * landmark, "Maid" and "Daily" → ai → sparkles, "Card" → car, "Parent" → rent
 * → house. A deterministic icon is supposed to be a small delight; getting it
 * confidently wrong is worse than the neutral fallback.
 */
export function deterministicIcon(name: string): string {
  const lower = name.toLowerCase();
  const words = lower.split(/[^a-z0-9]+/).filter(Boolean);

  for (const [key, icon] of KNOWN) {
    // Multi-word keys (e.g. 'vi ') are compared against the whole string.
    const k = key.trim();
    const hit = words.some((w) => w === k || (k.length >= PREFIX_MATCH_MIN && w.startsWith(k)));
    if (hit) return icon;
  }
  return FALLBACK_ICONS[hash(lower) % FALLBACK_ICONS.length]!;
}

export function deterministicColor(name: string): string {
  // Same palette as categories, so a Tracker card and a ledger row for the
  // same word are the same colour.
  return colorForCategory(name);
}

/** "Netflix" -> "N", "Amazon Prime" -> "AP". For a text avatar when no icon fits. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0]!.slice(0, 1).toUpperCase();
  return (words[0]!.slice(0, 1) + words[1]!.slice(0, 1)).toUpperCase();
}
