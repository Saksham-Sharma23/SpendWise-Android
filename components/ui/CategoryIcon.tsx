import {
  Baby,
  Beer,
  Bike,
  BookOpen,
  Briefcase,
  Building2,
  Bus,
  Cake,
  Car,
  CircleEllipsis,
  CirclePlus,
  Clapperboard,
  Coffee,
  Coins,
  CreditCard,
  Droplets,
  Dumbbell,
  Film,
  Fish,
  Flower2,
  Fuel,
  Gamepad2,
  Gift,
  GraduationCap,
  HandCoins,
  HeartPulse,
  Hotel,
  House,
  Landmark,
  Laptop,
  Music,
  PawPrint,
  PiggyBank,
  Pill,
  Pizza,
  Plane,
  Receipt,
  Repeat,
  Scissors,
  Shirt,
  ShoppingBag,
  ShoppingBasket,
  Smartphone,
  Sparkles,
  Tag,
  Ticket,
  TrainFront,
  TrendingUp,
  Tv,
  Utensils,
  Wallet,
  Wifi,
  Wrench,
  Zap,
  type LucideIcon,
} from 'lucide-react-native';
import { Text, View } from 'react-native';

import { ICON_NAMES } from '../../lib/icons';
import { withAlpha } from '../../lib/theme';

/**
 * Category glyphs. Categories store a lucide icon NAME (seeded to match the
 * web app); this maps it to a component. An unknown name falls back to a
 * tag rather than rendering nothing.
 */
const ICONS: Record<string, LucideIcon> = {
  // The seeded set — matches the web app's category icons.
  utensils: Utensils,
  'shopping-basket': ShoppingBasket,
  car: Car,
  'shopping-bag': ShoppingBag,
  clapperboard: Clapperboard,
  receipt: Receipt,
  'heart-pulse': HeartPulse,
  'graduation-cap': GraduationCap,
  house: House,
  plane: Plane,
  repeat: Repeat,
  sparkles: Sparkles,
  gift: Gift,
  'trending-up': TrendingUp,
  wallet: Wallet,
  'circle-plus': CirclePlus,
  'circle-ellipsis': CircleEllipsis,
  // Extra choices for categories the user creates.
  coffee: Coffee,
  pizza: Pizza,
  beer: Beer,
  cake: Cake,
  fuel: Fuel,
  bus: Bus,
  'train-front': TrainFront,
  bike: Bike,
  smartphone: Smartphone,
  laptop: Laptop,
  tv: Tv,
  wifi: Wifi,
  zap: Zap,
  droplets: Droplets,
  shirt: Shirt,
  scissors: Scissors,
  dumbbell: Dumbbell,
  pill: Pill,
  baby: Baby,
  'paw-print': PawPrint,
  fish: Fish,
  'flower-2': Flower2,
  music: Music,
  film: Film,
  'gamepad-2': Gamepad2,
  ticket: Ticket,
  hotel: Hotel,
  'book-open': BookOpen,
  briefcase: Briefcase,
  'building-2': Building2,
  landmark: Landmark,
  'piggy-bank': PiggyBank,
  coins: Coins,
  'hand-coins': HandCoins,
  'credit-card': CreditCard,
  wrench: Wrench,
  tag: Tag,
};

/**
 * Every icon a category may use, in picker order. The vocabulary lives in
 * lib/icons.ts (plain data, importable from tests and from features that must
 * agree with it); this keeps only the name -> component mapping.
 */
export const CATEGORY_ICON_NAMES: readonly string[] = ICON_NAMES;

/** Exported for the test that keeps ICON_NAMES and this mapping in step. */
export const MAPPED_ICON_NAMES = Object.keys(ICONS);

/** Colours offered when creating or recolouring a category. */
export const CATEGORY_COLORS = [
  '#E8833A', '#D4A32C', '#D4F55E', '#4B9B6E', '#3DDC97', '#2F8F8F',
  '#5EC8F5', '#3A7CA5', '#4E86C7', '#8B5FBF', '#9B6BC4', '#C2548A',
  '#D97BA0', '#D4544E', '#C75E5E', '#7A6A5A', '#8A8A8A', '#B0B3BC',
] as const;

const FALLBACK = '#8B8D95';

interface Props {
  icon: string | null;
  color: string | null;
  size?: number;
  /** Replace the glyph with a check, for multi-select. */
  selected?: boolean;
}

export function CategoryIcon({ icon, color, size = 44, selected = false }: Props) {
  const tint = color ?? FALLBACK;
  const Icon = (icon && ICONS[icon]) || Tag;

  return (
    <View
      className="items-center justify-center rounded-2xl"
      style={{
        width: size,
        height: size,
        backgroundColor: selected ? tint : withAlpha(tint, 0.16),
        borderWidth: 1,
        borderColor: withAlpha(tint, selected ? 1 : 0.22),
      }}
    >
      {selected ? (
        <Text style={{ color: '#0A0A0B', fontSize: size * 0.4, fontWeight: '700' }}>✓</Text>
      ) : (
        <Icon size={size * 0.45} color={tint} strokeWidth={2} />
      )}
    </View>
  );
}
