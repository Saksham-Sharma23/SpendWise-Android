import { Check, Droplet, Moon, Smartphone, Snowflake, Sun } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { BLUR_RENDERS, LENS_AVAILABLE, LENS_NEEDS_NEWER_ANDROID } from '@/components/layout/glass';
import { Card } from '@/components/ui/Card';
import { PressableScale } from '@/components/ui/PressableScale';
import { useGlassStore } from '@/lib/glassStore';
import { PALETTES, useColors, withAlpha, type GlassStyle, type ThemeName } from '@/lib/theme';
import { useThemeStore, type ThemePreference } from '@/lib/themeStore';
import { appear } from '@/lib/motion';
import { Text } from '@/components/ui/Text';

/**
 * The appearance choosers: the theme (System, Light or Dark) and the glass
 * the tab bar is made of (Frosted or Liquid).
 *
 * Each option carries a miniature of what it selects. The theme faces are
 * drawn from the real palette (`PALETTES`) rather than hardcoded swatches —
 * so they cannot drift from what tapping them produces. "System" shows both
 * halves, which says what it does without a sentence of explanation. The
 * glass previews do the same job: stripes of "content" run behind a tiny
 * bar, and the difference is simply how much of them shows through.
 */

const OPTIONS: { value: ThemePreference; label: string; hint: string }[] = [
  { value: 'system', label: 'System', hint: 'Match the phone' },
  { value: 'light', label: 'Light', hint: 'Always light' },
  { value: 'dark', label: 'Dark', hint: 'Always dark' },
];

const GLASS_OPTIONS: { value: GlassStyle; label: string; hint: string }[] = [
  { value: 'frosted', label: 'Frosted', hint: 'A soft blur that stays calm over busy screens' },
  { value: 'liquid', label: 'Liquid', hint: 'Clear glass that bends light at its edges' },
];

export function Appearance() {
  const preference = useThemeStore((s) => s.preference);
  const resolved = useThemeStore((s) => s.resolved);
  const setPreference = useThemeStore((s) => s.setPreference);

  return (
    <View className="gap-6">
      <View className="gap-3">
        <Text variant="label" tone="muted">
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

        <Text variant="caption" tone="subtle">
          {preference === 'system'
            ? `Following your phone, which is ${resolved} right now.`
            : `Always ${preference}, whatever the phone is set to.`}
        </Text>
      </View>

      <GlassEffect />
    </View>
  );
}

/**
 * Frosted or Liquid. Two named choices rather than an on/off switch: the bar
 * is glass either way, so "off" would not say what you get.
 *
 * Liquid glass needs a real blur behind it — clear glass over raw content is
 * unreadable — and below Android 12 there is none, so there the choice is
 * shown but disabled, with the reason. What was chosen is still remembered:
 * a restore onto a newer phone brings Liquid back.
 */
function GlassEffect() {
  const style = useGlassStore((s) => s.style);
  const setStyle = useGlassStore((s) => s.setStyle);
  // What the bar actually shows: Liquid only where it can.
  const shown: GlassStyle = BLUR_RENDERS ? style : 'frosted';

  return (
    <View className="gap-3">
      <Text variant="label" tone="muted">
        Glass effect
      </Text>

      <Card className="p-3">
        <View className="flex-row gap-3">
          {GLASS_OPTIONS.map((o) => (
            <GlassChoice
              key={o.value}
              option={o}
              selected={shown === o.value}
              disabled={o.value === 'liquid' && !BLUR_RENDERS}
              onPress={() => setStyle(o.value)}
            />
          ))}
        </View>
      </Card>

      <Text variant="caption" tone="subtle">
        {!BLUR_RENDERS
          ? 'Liquid glass needs Android 12 or later, to blur what is behind the bar.'
          : shown === 'liquid'
            ? LENS_AVAILABLE
              ? 'Clear glass, like a lens: what is behind the bar swells in the middle and bends at the edges.'
              : LENS_NEEDS_NEWER_ANDROID
                ? 'Clear glass that bends light at its edges. The lens effect needs Android 13 or later.'
                : 'Clear glass that bends light at its edges. What is behind the bar stays visible.'
            : 'A soft blur. The bar stays calm over busy screens.'}
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
        <Text weight={selected ? 'semibold' : 'medium'} size={13} tone={selected ? 'primary' : 'default'}>
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

function GlassChoice({
  option,
  selected,
  disabled,
  onPress,
}: {
  option: { value: GlassStyle; label: string; hint: string };
  selected: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const colors = useColors();
  const Icon = option.value === 'liquid' ? Droplet : Snowflake;

  return (
    <PressableScale
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled }}
      accessibilityLabel={`${option.label}. ${option.hint}`}
      onPress={onPress}
      disabled={disabled}
      scaleTo={0.95}
      className="flex-1 items-center rounded-2xl border p-2.5"
      style={{
        borderColor: selected ? colors.primaryBorder : colors.border,
        backgroundColor: selected ? colors.primarySoft : 'transparent',
      }}
    >
      <GlassPreview style={option.value} />

      <View className="mt-2.5 flex-row items-center gap-1">
        {selected ? (
          <Animated.View entering={appear()}>
            <Check size={12} color={colors.primary} strokeWidth={3} />
          </Animated.View>
        ) : (
          <Icon size={12} color={colors.muted} />
        )}
        <Text weight={selected ? 'semibold' : 'medium'} size={13} tone={selected ? 'primary' : 'default'}>
          {option.label}
        </Text>
      </View>
    </PressableScale>
  );
}

/** Rows of "content" behind the miniature bar: [width, accent?]. */
const PREVIEW_ROWS: readonly (readonly [width: `${number}%`, accent: boolean])[] = [
  ['72%', false],
  ['48%', true],
  ['84%', false],
  ['60%', true],
];

/**
 * A miniature tab bar floating over stripes of content, in the current theme.
 *
 * It does not blur — a real blur needs the native view this preview has no
 * target for — so it shows the one thing that tells the two styles apart:
 * frosted glass mostly hides what is behind it, liquid glass lets it through
 * and is outlined in light instead.
 */
function GlassPreview({ style }: { style: GlassStyle }) {
  const colors = useColors();
  const liquid = style === 'liquid';

  return (
    <View
      className="h-14 w-full justify-end overflow-hidden rounded-xl p-1.5"
      style={{ backgroundColor: colors.background }}
    >
      {/* the page behind the bar */}
      <View style={StyleSheet.absoluteFill} className="justify-center gap-1.5 px-2">
        {PREVIEW_ROWS.map(([width, accent], i) => (
          <View
            key={i}
            style={{
              height: 3,
              width,
              borderRadius: 2,
              backgroundColor: accent ? withAlpha(colors.primary, 0.7) : withAlpha(colors.foreground, 0.45),
            }}
          />
        ))}
      </View>

      {/* the bar, and its selection droplet */}
      <View
        style={{
          height: 18,
          borderRadius: 9,
          borderWidth: 1,
          justifyContent: 'center',
          paddingHorizontal: 3,
          backgroundColor: withAlpha(colors.card, liquid ? 0.18 : 0.8),
          borderColor: withAlpha(colors.foreground, liquid ? 0.1 : 0.14),
          // Liquid: a rim lit from above.
          borderTopColor: liquid ? 'rgba(255, 255, 255, 0.9)' : withAlpha(colors.foreground, 0.14),
        }}
      >
        <View
          style={{
            width: '34%',
            height: 12,
            borderRadius: 6,
            borderWidth: 1,
            backgroundColor: liquid ? 'rgba(255, 255, 255, 0.12)' : withAlpha(colors.primary, 0.22),
            borderColor: withAlpha(colors.primary, liquid ? 0.5 : 0.36),
          }}
        />
      </View>
    </View>
  );
}
