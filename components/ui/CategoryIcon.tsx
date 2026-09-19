import { Text, View } from 'react-native';

import { ICON_COMPONENTS, FALLBACK_ICON } from './iconMap';
import { ICON_NAMES } from '@/lib/icons';
import { colors, withAlpha } from '@/lib/theme';

/**
 * Category glyphs. Categories store a lucide icon NAME (seeded to match the
 * web app); this maps it to a component. An unknown name falls back to a
 * tag rather than rendering nothing.
 */
/**
 * Every icon a category may use, in picker order. The vocabulary lives in
 * lib/icons.ts (plain data, importable from tests and from features that must
 * agree with it); this keeps only the name -> component mapping.
 */
export const CATEGORY_ICON_NAMES: readonly string[] = ICON_NAMES;

/**
 * Kept for callers that had it; the mapping itself now lives in ./iconMap so
 * `lib/__tests__/icons.test.ts` can read it without rendering anything.
 */
export const MAPPED_ICON_NAMES = Object.keys(ICON_COMPONENTS);

/** Colours offered when creating or recolouring a category. */
export const CATEGORY_COLORS = [
  '#E8833A',
  '#D4A32C',
  '#D4F55E',
  '#4B9B6E',
  '#3DDC97',
  '#2F8F8F',
  '#5EC8F5',
  '#3A7CA5',
  '#4E86C7',
  '#8B5FBF',
  '#9B6BC4',
  '#C2548A',
  '#D97BA0',
  '#D4544E',
  '#C75E5E',
  '#7A6A5A',
  '#8A8A8A',
  '#B0B3BC',
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
  const Icon = (icon && ICON_COMPONENTS[icon]) || FALLBACK_ICON;

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
      {/* `tint` is the category's own bright colour, so the tick stays dark in both themes. */}
      {selected ? (
        <Text style={{ color: colors.onBrightFill, fontSize: size * 0.4, fontWeight: '700' }}>✓</Text>
      ) : (
        <Icon size={size * 0.45} color={tint} strokeWidth={2} />
      )}
    </View>
  );
}
