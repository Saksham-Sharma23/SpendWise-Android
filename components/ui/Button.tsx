import { ActivityIndicator, View, type StyleProp, type ViewStyle } from 'react-native';

import { useColors } from '@/lib/theme';
import { PressableScale } from './PressableScale';
import { Text } from './Text';

/**
 * A text button (R4-2).
 *
 *   <Button label="Add expense" onPress={submit} busy={busy} glow />   // a form's sticky save
 *   <Button label="Clear all" variant="destructive" size="md" onPress={clear} />
 *   <Button label="Manage" variant="ghost" size="sm" onPress={open} />
 *
 * `variant`: `primary` (the one main action) · `secondary` (card fill, border)
 * · `destructive` · `ghost` (text only).
 * `size`: `lg` the full-width form button, 16 bold · `md` 14 semibold · `sm` 12 semibold, no padding.
 * `busy` dims it, ignores taps and (with `spinner`) shows a spinner; `glow` adds
 * the soft primary shadow the transaction form's save button has.
 */
export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'lg',
  busy = false,
  disabled = false,
  spinner = false,
  glow = false,
  className,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'destructive' | 'ghost';
  size?: 'lg' | 'md' | 'sm';
  busy?: boolean;
  disabled?: boolean;
  spinner?: boolean;
  glow?: boolean;
  className?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const colors = useColors();
  const fill =
    variant === 'primary'
      ? colors.primary
      : variant === 'destructive'
        ? colors.expense
        : variant === 'secondary'
          ? colors.card
          : 'transparent';
  const ink =
    variant === 'primary'
      ? colors.onPrimary
      : variant === 'destructive'
        ? colors.onAccent
        : variant === 'secondary'
          ? colors.foreground
          : colors.primary;
  const box =
    size === 'lg'
      ? 'items-center rounded-full py-4'
      : size === 'md'
        ? 'flex-row items-center justify-center gap-2 rounded-full px-4 py-3.5'
        : '';

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || busy, busy }}
      disabled={disabled || busy}
      onPress={onPress}
      className={className ? `${box} ${className}` : box}
      style={[
        variant === 'ghost' ? null : { backgroundColor: fill },
        variant === 'secondary' ? { borderWidth: 1, borderColor: colors.border } : null,
        glow ? { shadowColor: fill, shadowOpacity: 0.35, shadowRadius: 14, elevation: 6 } : null,
        style,
      ]}
    >
      {spinner && busy ? (
        <View>
          <ActivityIndicator size="small" color={ink} />
        </View>
      ) : null}
      <Text
        weight={size === 'lg' ? 'bold' : 'semibold'}
        size={size === 'lg' ? 16 : size === 'md' ? 14 : 12}
        style={{ color: ink }}
      >
        {label}
      </Text>
    </PressableScale>
  );
}
