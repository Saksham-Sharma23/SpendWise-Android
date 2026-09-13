import {
  Car,
  CircleEllipsis,
  CirclePlus,
  Clapperboard,
  Gift,
  GraduationCap,
  HeartPulse,
  House,
  Plane,
  Receipt,
  Repeat,
  ShoppingBag,
  ShoppingBasket,
  Sparkles,
  Tag,
  TrendingUp,
  Utensils,
  Wallet,
  type LucideIcon,
} from 'lucide-react-native';
import { Text, View } from 'react-native';

import { withAlpha } from '../../lib/theme';

/**
 * Category glyphs. Categories store a lucide icon NAME (seeded to match the
 * web app); this maps it to a component. An unknown name falls back to a
 * tag rather than rendering nothing.
 */
const ICONS: Record<string, LucideIcon> = {
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
};

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
