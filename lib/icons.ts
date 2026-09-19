/**
 * The icon vocabulary, as plain data.
 *
 * `components/ui/CategoryIcon` maps each of these names to a lucide component;
 * this file holds only the names, so code that must AGREE with that set — the
 * Tracker's deterministic icons, the category seed, tests running in Node —
 * can import it without pulling React Native in.
 *
 * A name here with no component renders as a tag, silently. `lib/__tests__/
 * icons.test.ts` asserts this list and `components/ui/iconMap.ts` hold exactly
 * the same names, so that can no longer happen unnoticed.
 */
export const ICON_NAMES = [
  // The seeded set — matches the web app's category icons.
  'utensils',
  'shopping-basket',
  'car',
  'shopping-bag',
  'clapperboard',
  'receipt',
  'heart-pulse',
  'graduation-cap',
  'house',
  'plane',
  'repeat',
  'sparkles',
  'gift',
  'trending-up',
  'wallet',
  'circle-plus',
  'circle-ellipsis',
  // Extra choices for categories the user creates.
  'coffee',
  'pizza',
  'beer',
  'cake',
  'fuel',
  'bus',
  'train-front',
  'bike',
  'smartphone',
  'laptop',
  'tv',
  'wifi',
  'zap',
  'droplets',
  'shirt',
  'scissors',
  'dumbbell',
  'pill',
  'baby',
  'paw-print',
  'fish',
  'flower-2',
  'music',
  'film',
  'gamepad-2',
  'ticket',
  'hotel',
  'book-open',
  'briefcase',
  'building-2',
  'landmark',
  'piggy-bank',
  'coins',
  'hand-coins',
  'credit-card',
  'wrench',
  'tag',
] as const;

export type IconName = (typeof ICON_NAMES)[number];

export function isIconName(name: string): name is IconName {
  return (ICON_NAMES as readonly string[]).includes(name);
}
