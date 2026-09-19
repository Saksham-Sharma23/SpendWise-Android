import { Check, Moon, Smartphone, Sun } from 'lucide-react-native';
import { Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { Card } from '@/components/ui/Card';
import { PressableScale } from '@/components/ui/PressableScale';
import { fonts, PALETTES, useColors, withAlpha, type ThemeName } from '@/lib/theme';
import { useThemeStore, type ThemePreference } from '@/lib/themeStore';
import { appear } from '@/lib/motion';

/**
 * The appearance chooser: System, Light or Dark.
 *
 * Each option carries a miniature of the theme it selects, drawn from the
 * real palette (`PALETTES`) rather than hardcoded swatches — so it cannot
 * drift from what tapping it actually produces. "System" shows both halves,
 * which says what it does without a sentence of explanation.
 */

const OPTIONS: { value: ThemePreference; label: string; hint: string }[] = [
  { value: 'system', label: 'System', hint: 'Match the phone' },
  { value: 'light', label: 'Light', hint: 'Always light' },
  { value: 'dark', label: 'Dark', hint: 'Always dark' },
];

export function Appearance() {
  const colors = useColors();
  const preference = useThemeStore((s) => s.preference);
  const resolved = useThemeStore((s) => s.resolved);
  const setPreference = useThemeStore((s) => s.setPreference);

  return (
    <View className="gap-3">
      <Text
        style={{
          color: colors.muted,
          fontFamily: fonts.semibold,
          fontSize: 12,
          letterSpacing: 0.8,
          textTransform: 'uppercase',
        }}
      >
        Appearance
      </Text>

      <Card className="p-3">
        <View className="flex-row gap-3">
          {OPTIONS.map((o) => (
            <ThemeChoice
              key={o.value}
              option={o}
              selected={preference === o.value}
              onPress={() => setPreference(o.value)}
            />
          ))}
        </View>
      </Card>

      <Text style={{ color: colors.subtle, fontFamily: fonts.regular, fontSize: 12 }}>
        {preference === 'system'
          ? `Following your phone, which is ${resolved} right now.`
          : `Always ${preference}, whatever the phone is set to.`}
      </Text>
    </View>
  );
}

function ThemeChoice({
  option,
  selected,
  onPress,
}: {
  option: { value: ThemePreference; label: string; hint: string };
  selected: boolean;
  onPress: () => void;
}) {
  const colors = useColors();
  const Icon = option.value === 'system' ? Smartphone : option.value === 'light' ? Sun : Moon;

  return (
    <PressableScale
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${option.label}. ${option.hint}`}
      onPress={onPress}
      scaleTo={0.95}
      className="flex-1 items-center rounded-2xl border p-2.5"
      style={{
        borderColor: selected ? colors.primaryBorder : colors.border,
        backgroundColor: selected ? colors.primarySoft : 'transparent',
      }}
    >
      <Preview value={option.value} />

      <View className="mt-2.5 flex-row items-center gap-1">
        {selected ? (
          <Animated.View entering={appear()}>
            <Check size={12} color={colors.primary} strokeWidth={3} />
          </Animated.View>
        ) : (
          <Icon size={12} color={colors.muted} />
        )}
        <Text
          style={{
            color: selected ? colors.primary : colors.foreground,
            fontFamily: selected ? fonts.semibold : fonts.medium,
            fontSize: 13,
          }}
        >
          {option.label}
        </Text>
      </View>
    </PressableScale>
  );
}

/**
 * A little screen: ground, a title bar, two rows and an accent pill — enough
 * shape to recognise the app. `system` is split down the middle.
 */
function Preview({ value }: { value: ThemePreference }) {
  if (value === 'system') {
    return (
      <View className="h-14 w-full flex-row overflow-hidden rounded-xl">
        <View className="flex-1 overflow-hidden">
          <Face theme="light" half />
        </View>
        <View className="flex-1 overflow-hidden">
          <Face theme="dark" half />
        </View>
      </View>
    );
  }
  return (
    <View className="h-14 w-full overflow-hidden rounded-xl">
      <Face theme={value === 'light' ? 'light' : 'dark'} />
    </View>
  );
}

function Face({ theme, half = false }: { theme: ThemeName; half?: boolean }) {
  const p = PALETTES[theme];
  return (
    <View className="flex-1 p-1.5" style={{ backgroundColor: p.background }}>
      {/* accent pill */}
      <View
        style={{
          height: 5,
          width: half ? '80%' : '46%',
          borderRadius: 3,
          backgroundColor: p.primary,
        }}
      />
      {/* a card with two text lines */}
      <View
        className="mt-1.5 flex-1 justify-center gap-1 rounded-md p-1.5"
        style={{ backgroundColor: p.card, borderWidth: 1, borderColor: p.border }}
      >
        <View style={{ height: 3, width: '70%', borderRadius: 2, backgroundColor: withAlpha(p.foreground, 0.75) }} />
        <View style={{ height: 3, width: '45%', borderRadius: 2, backgroundColor: withAlpha(p.muted, 0.6) }} />
      </View>
    </View>
  );
}
