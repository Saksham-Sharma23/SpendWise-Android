import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

import { useColors, withAlpha } from '@/lib/theme';
import { PressableScale } from './PressableScale';

/**
 * The round header button: close, delete, back, the date nudges (R4-2).
 *
 *   <IconButton label="Close" onPress={close}><X size={19} color={colors.foreground} /></IconButton>
 *   <IconButton label="Delete budget" tint={colors.expense} onPress={remove}>…</IconButton>
 *   <IconButton label="Previous day" look="plain" onPress={prev}>…</IconButton>
 *
 * `look`:
 * - `outline` (default): card fill and a hairline border; with `tint`, a soft
 *   wash of that colour instead (a destructive action reads red before it's tapped).
 * - `plain`: the elevated fill, no border (buttons sitting inside a field).
 * - `filled`: solid `tint` (default primary), for the one main action in a header.
 *
 * `size`: `md` 40pt (forms), `lg` 44pt (Groups headers).
 * `label` is the accessibility label, which an icon-only button must have.
 */
export function IconButton({
  label,
  onPress,
  children,
  tint,
  look = 'outline',
  size = 'md',
  disabled,
  style,
}: {
  label: string;
  onPress: () => void;
  children: ReactNode;
  tint?: string;
  look?: 'outline' | 'plain' | 'filled';
  size?: 'md' | 'lg';
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const colors = useColors();
  const fill: ViewStyle =
    look === 'filled'
      ? { backgroundColor: tint ?? colors.primary }
      : look === 'plain'
        ? { backgroundColor: colors.elevated }
        : {
            backgroundColor: tint ? withAlpha(tint, 0.12) : colors.card,
            borderWidth: 1,
            borderColor: tint ? withAlpha(tint, 0.3) : colors.border,
          };
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled}
      scaleTo={0.88}
      className={`${size === 'lg' ? 'h-11 w-11' : 'h-10 w-10'} items-center justify-center rounded-full`}
      style={[fill, style]}
    >
      {children}
    </PressableScale>
  );
}

/** The width of an IconButton, for the spacer that balances a header with no right-hand button. */
export const ICON_BUTTON_SIZE = { md: 40, lg: 44 } as const;
