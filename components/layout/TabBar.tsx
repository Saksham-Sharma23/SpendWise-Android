import { useRouter, type Tabs } from 'expo-router';
import { ChartColumn, House, LayoutGrid, Plus, Receipt, type LucideIcon } from 'lucide-react-native';
import { useCallback, useEffect, useState, type ComponentProps } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Pattern, RadialGradient, Rect, Stop } from 'react-native-svg';
import { scheduleOnRN } from 'react-native-worklets';

import { fonts, springs, useColors, useThemeName, withAlpha } from '../../lib/theme';
import { PressableScale } from '../ui/PressableScale';
import { BLUR_AVAILABLE, GlassBlur } from './glass';

// expo-router vendors react-navigation and does not re-export the tab bar
// prop type, so derive it from the Tabs component itself.
type BottomTabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

const TABS: Record<string, { icon: LucideIcon; label: string; slot: number }> = {
  index: { icon: House, label: 'Home', slot: 0 },
  transactions: { icon: Receipt, label: 'Activity', slot: 1 },
  insights: { icon: ChartColumn, label: 'Insights', slot: 3 },
  more: { icon: LayoutGrid, label: 'More', slot: 4 },
};

const SLOTS = 5; // four tabs + the centre add button in slot 2
const TAB_SLOTS = [0, 1, 3, 4];
const BAR_HEIGHT = 70;
const PAD = 6;
const PILL_HEIGHT = BAR_HEIGHT - PAD * 2;

/** The droplet's two springs: a quick leading edge and a lazy trailing one. */
const LEAD = { damping: 22, stiffness: 420, mass: 0.8 };
const TRAIL = { damping: 20, stiffness: 150, mass: 1 };

/**
 * A glass tab bar: glassmorphism with a touch of liquid glass.
 *
 * A light backdrop blur and thin tint keep it frosted; a refractive rim, a
 * top sheen and a small specular hotspot give it depth. Kept subtle on
 * purpose — heavy blur reads as muddy, strong gloss as plastic.
 *
 * The selection is one "droplet" rather than a pill per tab. Its two edges
 * run on different springs, so as it travels it stretches out and thins,
 * then snaps back into shape when it lands. Drag along the bar and the
 * droplet follows your finger, swelling like a lens, and selects the tab you
 * release on.
 */
export function TabBar({ state, navigation }: BottomTabBarProps) {
  const colors = useColors();
  const { bottom } = useSafeAreaInsets();
  const [width, setWidth] = useState(0);

  const activeName = state.routes[state.index]?.name ?? 'index';
  const activeSlot = TABS[activeName]?.slot ?? 0;

  const inner = Math.max(0, width - PAD * 2);
  const slotWidth = inner / SLOTS;
  const pillWidth = slotWidth - 4;
  const centerOf = useCallback((slot: number) => PAD + slotWidth * (slot + 0.5), [slotWidth]);

  const lead = useSharedValue(0);
  const trail = useSharedValue(0);
  const dragging = useSharedValue(0);
  const ready = useSharedValue(0);

  // Glide to the active tab whenever it changes (tap, drag or deep link).
  useEffect(() => {
    if (width === 0) return;
    const x = centerOf(activeSlot);
    if (ready.value === 0) {
      lead.value = x;
      trail.value = x;
      ready.value = withTiming(1, { duration: 250 });
    } else {
      lead.value = withSpring(x, LEAD);
      trail.value = withSpring(x, TRAIL);
    }
  }, [activeSlot, width, centerOf, lead, trail, ready]);

  const goToSlot = useCallback(
    (slot: number) => {
      const route = state.routes.find((r) => TABS[r.name]?.slot === slot);
      if (!route) return;
      const focused = route.name === activeName;
      const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
      if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
    },
    [state.routes, activeName, navigation],
  );

  const pan = Gesture.Pan()
    .activeOffsetX([-12, 12])
    .onBegin(() => {
      dragging.value = withSpring(1, springs.press);
    })
    .onUpdate((e) => {
      const min = PAD + slotWidth * 0.5;
      const max = PAD + slotWidth * (SLOTS - 0.5);
      const x = Math.min(max, Math.max(min, e.x));
      lead.value = x;
      trail.value = withSpring(x, TRAIL);
    })
    .onEnd((e) => {
      const raw = Math.floor((e.x - PAD) / slotWidth);
      // Nearest real tab — the centre slot is the add button, not a tab.
      let best = TAB_SLOTS[0]!;
      for (const s of TAB_SLOTS) if (Math.abs(s - raw) < Math.abs(best - raw)) best = s;
      const x = PAD + slotWidth * (best + 0.5);
      lead.value = withSpring(x, LEAD);
      trail.value = withSpring(x, TRAIL);
      scheduleOnRN(goToSlot, best);
    })
    .onFinalize(() => {
      dragging.value = withSpring(0, springs.settle);
    });

  const stretch = useDerivedValue(() => Math.abs(lead.value - trail.value));

  const droplet = useAnimatedStyle(() => {
    const left = Math.min(lead.value, trail.value) - pillWidth / 2;
    const s = slotWidth > 0 ? stretch.value / slotWidth : 0;
    return {
      opacity: ready.value,
      width: pillWidth + stretch.value,
      transform: [
        { translateX: left },
        // Thins as it stretches, swells while dragged — surface tension.
        { scaleY: 1 - Math.min(0.22, s * 0.28) + dragging.value * 0.1 },
        { scaleX: 1 + dragging.value * 0.06 },
      ],
    };
  });

  const barScale = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + dragging.value * 0.015 }],
  }));

  return (
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingBottom: bottom + 10 }}
    >
      <GestureDetector gesture={pan}>
        <Animated.View
          onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
          className="mx-4"
          style={[{ height: BAR_HEIGHT, borderRadius: BAR_HEIGHT / 2 }, barScale]}
        >
          <GlassSurface radius={BAR_HEIGHT / 2} width={width} height={BAR_HEIGHT} />

          {width > 0 ? (
            <Animated.View
              pointerEvents="none"
              style={[
                {
                  position: 'absolute',
                  top: PAD,
                  left: 0,
                  height: PILL_HEIGHT,
                  borderRadius: PILL_HEIGHT / 2,
                  overflow: 'hidden',
                  // Accent glass: a light tint, a gloss on top, a lit rim.
                  backgroundColor: withAlpha(colors.primary, 0.14),
                  borderWidth: 1,
                  borderColor: withAlpha(colors.primary, 0.36),
                },
                droplet,
              ]}
            >
              {/* Percent sizes, so the gloss follows the droplet as it stretches. */}
              <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
                <Defs>
                  <LinearGradient id="dropGloss" x1="0" y1="0" x2="0" y2="1">
                    <Stop offset="0" stopColor="#fff" stopOpacity={0.2} />
                    <Stop offset="0.45" stopColor="#fff" stopOpacity={0.03} />
                    <Stop offset="0.75" stopColor="#fff" stopOpacity={0} />
                    <Stop offset="1" stopColor={colors.primary} stopOpacity={0.18} />
                  </LinearGradient>
                </Defs>
                <Rect width="100%" height="100%" fill="url(#dropGloss)" />
              </Svg>
            </Animated.View>
          ) : null}

          <View className="flex-1 flex-row items-center" style={{ paddingHorizontal: PAD }}>
            {[0, 1, 2, 3, 4].map((slot) => {
              if (slot === 2) return <AddButton key="add" />;
              const route = state.routes.find((r) => TABS[r.name]?.slot === slot);
              const meta = route ? TABS[route.name] : undefined;
              if (!route || !meta) return <View key={slot} className="flex-1" />;
              return (
                <Tab
                  key={route.key}
                  icon={meta.icon}
                  label={meta.label}
                  focused={route.name === activeName}
                  onPress={() => goToSlot(slot)}
                />
              );
            })}
          </View>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

/**
 * A static grain tile: deterministic pseudo-random light and dark specks.
 * Frosted glass is etched, not smooth — the grain is what stops the panel
 * reading as flat grey plastic, and it breaks up whatever shows through.
 */
const GRAIN_TILE = 48;
const GRAIN = (() => {
  let seed = 0x5eed;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  // Many faint specks, not a few strong ones: strong grain reads as sandpaper.
  return Array.from({ length: 220 }, () => ({
    x: Math.floor(rand() * GRAIN_TILE),
    y: Math.floor(rand() * GRAIN_TILE),
    light: rand() > 0.5,
    o: 0.018 + rand() * 0.032,
  }));
})();

/**
 * Glass that sits between frosted and liquid, built in layers from the back:
 *   1. a light backdrop blur, so content stays legible through the bar
 *   2. a thin smoked tint (denser when there is no blur to hide the content)
 *   3. a faint frost
 *   4. sheen: light entering at the top, fading out, pooling again at the base
 *      the way it does in a thick lens
 *   5. a small specular hotspot near the top-left
 *   6. very faint grain
 *   7. a refractive rim: bright at the top, dim at the sides, lit again at
 *      the bottom, with a softer inner ring that gives the glass thickness
 */
function GlassSurface({ radius, width, height }: { radius: number; width: number; height: number }) {
  const colors = useColors();
  const isLight = useThemeName() === 'light';

  // Glass takes its character from the light BEHIND it. On a dark ground the
  // lighting is white and the tint is smoke; on a light one the frost is
  // white and the lighting has to DARKEN instead, or the bar reads as a grey
  // smudge with no edges.
  const g = isLight
    ? {
        tint: BLUR_AVAILABLE ? 'rgba(255, 255, 255, 0.40)' : 'rgba(252, 251, 249, 0.90)',
        frost: 'rgba(255, 255, 255, 0.35)',
        sheen: '#ffffff',
        sheenTop: 0.55,
        hotspot: 0.5,
        rim: '#2A2823',
        rimTop: 0.1,
        rimMid: 0.05,
        rimBottom: 0.12,
        innerRim: 0.05,
        grainOpacity: 0.35,
      }
    : {
        tint: BLUR_AVAILABLE ? 'rgba(18, 19, 24, 0.22)' : 'rgba(26, 27, 33, 0.84)',
        frost: 'rgba(255, 255, 255, 0.035)',
        sheen: '#ffffff',
        sheenTop: 0.13,
        hotspot: 0.16,
        rim: '#ffffff',
        rimTop: 0.5,
        rimMid: 0.04,
        rimBottom: 0.24,
        innerRim: 0.12,
        grainOpacity: 0.6,
      };

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: 'hidden' }]}>
      <GlassBlur intensity={38} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: g.tint }]} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: g.frost }]} />
      {width > 0 ? (
        <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
          <Defs>
            <LinearGradient id="sheen" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={g.sheen} stopOpacity={g.sheenTop} />
              <Stop offset="0.42" stopColor={g.sheen} stopOpacity={g.sheenTop * 0.15} />
              <Stop offset="0.8" stopColor={g.sheen} stopOpacity={0} />
              <Stop offset="1" stopColor={g.sheen} stopOpacity={g.sheenTop * 0.45} />
            </LinearGradient>
            <RadialGradient id="hotspot" cx="24%" cy="0%" rx="22%" ry="60%">
              <Stop offset="0" stopColor={g.sheen} stopOpacity={g.hotspot} />
              <Stop offset="1" stopColor={g.sheen} stopOpacity={0} />
            </RadialGradient>
            <Pattern id="grain" width={GRAIN_TILE} height={GRAIN_TILE} patternUnits="userSpaceOnUse">
              {GRAIN.map((g, i) => (
                <Rect
                  key={i}
                  x={g.x}
                  y={g.y}
                  width={1}
                  height={1}
                  fill={g.light ? '#fff' : '#000'}
                  fillOpacity={g.o}
                />
              ))}
            </Pattern>
            <LinearGradient id="rim" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={g.rim} stopOpacity={g.rimTop} />
              <Stop offset="0.3" stopColor={g.rim} stopOpacity={g.rimMid * 2.5} />
              <Stop offset="0.7" stopColor={g.rim} stopOpacity={g.rimMid} />
              <Stop offset="1" stopColor={g.rim} stopOpacity={g.rimBottom} />
            </LinearGradient>
            <LinearGradient id="innerRim" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={g.rim} stopOpacity={g.innerRim} />
              <Stop offset="0.5" stopColor={g.rim} stopOpacity={0} />
              <Stop offset="1" stopColor={g.rim} stopOpacity={g.innerRim * 0.6} />
            </LinearGradient>
          </Defs>
          <Rect width={width} height={height} fill="url(#sheen)" />
          <Rect width={width} height={height} fill="url(#hotspot)" />
          <Rect width={width} height={height} fill="url(#grain)" opacity={g.grainOpacity} />
          <Rect
            x={2}
            y={2}
            width={width - 4}
            height={height - 4}
            rx={radius - 2}
            fill="none"
            stroke="url(#innerRim)"
            strokeWidth={2}
          />
          <Rect
            x={0.5}
            y={0.5}
            width={width - 1}
            height={height - 1}
            rx={radius - 0.5}
            fill="none"
            stroke="url(#rim)"
            strokeWidth={1}
          />
        </Svg>
      ) : null}
    </View>
  );
}

function Tab({
  icon: Icon,
  label,
  focused,
  onPress,
}: {
  icon: LucideIcon;
  label: string;
  focused: boolean;
  onPress: () => void;
}) {
  const colors = useColors();
  const bounce = useSharedValue(1);
  const on = useSharedValue(focused ? 1 : 0);

  useEffect(() => {
    on.value = withTiming(focused ? 1 : 0, { duration: 240 });
    if (focused) {
      bounce.value = withSequence(withTiming(0.82, { duration: 90 }), withSpring(1, { damping: 9, stiffness: 260 }));
    }
  }, [focused, on, bounce]);

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: bounce.value }, { translateY: interpolate(on.value, [0, 1], [0, -1]) }],
  }));
  const labelStyle = useAnimatedStyle(() => ({ opacity: interpolate(on.value, [0, 1], [0.55, 1]) }));

  return (
    <PressableScale
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: focused }}
      onPress={onPress}
      scaleTo={0.9}
      className="flex-1 items-center justify-center"
      style={{ height: PILL_HEIGHT }}
    >
      <Animated.View style={iconStyle}>
        <Icon size={21} color={focused ? colors.primary : colors.foreground} strokeWidth={focused ? 2.3 : 1.9} />
      </Animated.View>
      <Animated.View style={labelStyle}>
        <Text
          numberOfLines={1}
          style={{
            color: focused ? colors.primary : colors.foreground,
            fontFamily: focused ? fonts.semibold : fonts.medium,
            fontSize: 10,
            marginTop: 3,
          }}
        >
          {label}
        </Text>
      </Animated.View>
    </PressableScale>
  );
}

function AddButton() {
  const colors = useColors();
  const router = useRouter();
  const turn = useSharedValue(0);
  const spin = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.value * 90}deg` }] }));

  return (
    <View className="flex-1 items-center justify-center">
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel="Add transaction"
        accessibilityHint="Opens the add transaction form. Long press to import a spreadsheet."
        scaleTo={0.86}
        onPressIn={() => {
          turn.value = withSpring(1, springs.press);
        }}
        onPressOut={() => {
          turn.value = withSpring(0, springs.settle);
        }}
        onPress={() => router.push('/(modals)/transaction')}
        onLongPress={() => router.push('/import/pick')}
        style={{
          width: 52,
          height: 52,
          borderRadius: 26,
          overflow: 'hidden',
          backgroundColor: colors.primary,
          alignItems: 'center',
          justifyContent: 'center',
          // No coloured shadow — Android renders it as a halo that leaks
          // into the glass around it.
        }}
      >
        <Animated.View style={spin}>
          <Plus size={25} color={colors.onPrimary} strokeWidth={2.6} />
        </Animated.View>
      </PressableScale>
    </View>
  );
}
