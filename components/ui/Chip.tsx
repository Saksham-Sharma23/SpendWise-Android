import type { LucideIcon } from 'lucide-react-native';
import { X } from 'lucide-react-native';
import { View } from 'react-native';

import { useColors, withAlpha } from '@/lib/theme';
import { PressableScale } from './PressableScale';
import { Text } from './Text';

/**
 * A selectable pill (R4-2): quick dates, split methods, filter choices.
 *
 *   <Chip label="Today" selected={on} onPress={pick} />
 *   <Chip label="Food" selected onRemove={clear} />   // a removable active filter
 *
 * `size`: `md` 13pt (forms) · `sm` 12pt (compact rows). `rest` is the unselected
 * fill: `card` on a page, `transparent` inside a field that already has one.
 */
export function Chip({
  label,
  selected = false,
  onPress,
  onRemove,
  size = 'md',
  rest = 'card',
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  onRemove?: () => void;
  size?: 'md' | 'sm';
  rest?: 'card' | 'transparent';
}) {
  const colors = useColors();
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={onRemove ? `Remove ${label}` : undefined}
      onPress={onRemove ?? onPress}
      className="flex-row items-center gap-1.5 rounded-full border px-3.5 py-1.5"
      style={{
        borderColor: selected ? colors.primaryBorder : colors.border,
        backgroundColor: selected ? colors.primarySoft : rest === 'card' ? colors.card : 'transparent',
      }}
    >
      <Text weight="medium" size={size === 'md' ? 13 : 12} tone={selected ? 'primary' : 'muted'}>
        {label}
      </Text>
      {onRemove ? <X size={13} color={colors.primary} /> : null}
    </PressableScale>
  );
}

/**
 * A small tinted status pill, not pressable: "↗ 19%" beside a figure.
 *
 *   <Badge tone="good" icon={ArrowUpRight} label="77.3%" />
 */
export function Badge({
  tone,
  icon: Icon,
  label,
}: {
  tone: 'good' | 'bad' | 'neutral';
  icon?: LucideIcon;
  label: string;
}) {
  const colors = useColors();
  const color = tone === 'good' ? colors.income : tone === 'bad' ? colors.expense : colors.muted;
  return (
    <View
      className="flex-row items-center gap-0.5 rounded-full px-2 py-0.5"
      style={{ backgroundColor: withAlpha(color, 0.14) }}
    >
      {Icon ? <Icon size={12} color={color} strokeWidth={2.5} /> : null}
      <Text weight="semibold" size={11} style={{ color }}>
        {label}
      </Text>
    </View>
  );
}
