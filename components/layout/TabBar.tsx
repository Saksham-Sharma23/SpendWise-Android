import { useRouter, type Tabs } from 'expo-router';
import { ChartColumn, House, LayoutGrid, Plus, Receipt, type LucideIcon } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState, type ComponentProps } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
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
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { scheduleOnRN } from 'react-native-worklets';

import { useGlassEnabled } from '@/lib/glassStore';
import { springs, useColors, useThemeName, withAlpha } from '@/lib/theme';
import { PressableScale } from '../ui/PressableScale';
import { BLUR_AVAILABLE, GlassBlur } from './glass';
import { Text } from '@/components/ui/Text';

// expo-router vendors react-navigation and does not re-export the tab bar
// prop type, so derive it from the Tabs component itself.
type BottomTabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

const TABS: Record<string, { icon: LucideIcon; label: string; slot: number }> = {
  index: { icon: House, label: 'Home', slot: 0 },
  transactions: { icon: Receipt, label: 'Transactions', slot: 1 },
  insights: { icon: ChartColumn, label: 'Insights', slot: 3 },
  more: { icon: LayoutGrid, label: 'More', slot: 4 },
};

const SLOTS = 5; // four tabs + the centre add button in slot 2
const TAB_SLOTS = [0, 1, 3, 4];
const BAR_HEIGHT = 70;
const PAD = 6;
const PILL_HEIGHT = BAR_HEIGHT - PAD * 2;

/**
 * How far the droplet may stretch, as a fraction of one slot. Module scope so
 * the worklets that read it capture a constant rather than a component value.
 */
const MAX_STRETCH = 0.2;

/**
 * How much the droplet thins at full stretch. Kept small: a droplet that
 * narrows sharply and then springs back to full height reads as jelly.
 */
const MAX_THIN = 0.06;

/**
 * The droplet's two edges: the trailing one lands just a beat after the
 * leading one, so it lengthens a little in flight and settles as one piece.
 * Both are critically damped (no overshoot) and close together, so the
 * slide reads as a glide rather than a stretch and snap.
 */
const LEAD = { dampingRatio: 1, duration: 320 } as const;
const TRAIL = { dampingRatio: 1, duration: 380 } as const;

/**
 * A liquid glass tab bar.
 *
 * Clear rather than frosted: a light blur keeps what is behind the bar
 * recognisable, and the glass gets its body from its edges instead of a fill
 * — a glow in the thick rim, specular crescents on the ends, a soft shadow
 * underneath. See GlassSurface for the layers.
 *
 * The selection is one "droplet" rather than a pill per tab. Its two edges
 * run on slightly different springs, so as it travels it lengthens a touch
 * and settles back into shape when it lands. Drag along the bar and the
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
  // The widest the droplet can be: its resting width plus the capped stretch.
  // The gloss gradient is drawn at this size (see below) so it never runs out.
  const maxDropletWidth = pillWidth + slotWidth * MAX_STRETCH;
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

  /**
   * Memoised so the detector is not handed a NEW gesture on every render
   * (TASKS2 4C). Rebuilding it re-attaches the handler, which during a fast
   * swipe can drop the gesture mid-flight and leave the droplet stranded
   * between slots. It only needs to change when the geometry does.
   */
  const pan = useMemo(() => {
    const min = PAD + slotWidth * 0.5;
    const max = PAD + slotWidth * (SLOTS - 0.5);
    const clamp = (x: number) => {
      'worklet';
      return Math.min(max, Math.max(min, x));
    };

    return Gesture.Pan()
      .activeOffsetX([-12, 12])
      .onBegin(() => {
        dragging.value = withSpring(1, springs.press);
      })
      .onUpdate((e) => {
        const x = clamp(e.x);
        lead.value = x;
        trail.value = withSpring(x, TRAIL);
      })
      .onEnd((e) => {
        // Clamped exactly as onUpdate clamps, so the tab chosen is the one the
        // droplet was visibly over. A fast flick releases past the bar edge,
        // and the unclamped value disagreed with what the user saw.
        const raw = Math.floor((clamp(e.x) - PAD) / slotWidth);
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
  }, [slotWidth, goToSlot, lead, trail, dragging]);

  /**
   * How far the trailing edge lags the leading one.
   *
   * CAPPED at a fifth of a slot. A fast flick can put `lead` several slots
   * ahead of the spring-damped `trail`, and the raw difference then stretched
   * the droplet into a long bar: past 2 × radius its middle is a straight edge,
   * so it stopped reading as a capsule and appeared as a box with square inner
   * corners. The cap was half a slot, which read as a rubbery stretch-and-snap
   * on every tab change; a fifth keeps it a subtle lengthening in flight.
   */
  const stretch = useDerivedValue(() => Math.min(Math.abs(lead.value - trail.value), slotWidth * MAX_STRETCH));

  const droplet = useAnimatedStyle(() => {
    const left = Math.min(lead.value, trail.value) - pillWidth / 2;
    // Normalised against the CAP, not the slot, so a fully stretched droplet
    // still reaches the full thinning — the cap must not also halve the squash.
    const s = slotWidth > 0 ? stretch.value / (slotWidth * MAX_STRETCH) : 0;
    const scaleY = 1 - Math.min(1, s) * MAX_THIN + dragging.value * 0.1;
    return {
      opacity: ready.value,
      width: pillWidth + stretch.value,
      // The radius must follow the SQUASHED height. Held at PILL_HEIGHT/2 it
      // exceeded half the scaled height, so the caps overlapped the vertical
      // edges and the clipped gloss <Svg> inside showed its own square
      // corners — the "box inside" during a fast swipe.
      borderRadius: (PILL_HEIGHT * scaleY) / 2,
      transform: [
        { translateX: left },
        // Thins as it stretches, swells while dragged — surface tension.
        { scaleY },
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
          <GlassShadow radius={BAR_HEIGHT / 2} width={width} height={BAR_HEIGHT} />
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
                  // borderRadius is animated in `droplet` — it has to track the
                  // squashed height, so it is deliberately not set here.
                  overflow: 'hidden',
                  // Accent glass: a light tint, a gloss on top, a lit rim.
                  backgroundColor: withAlpha(colors.primary, 0.14),
                  borderWidth: 1,
                  borderColor: withAlpha(colors.primary, 0.36),
                },
                droplet,
              ]}
            >
              {/*
                Sized in FIXED PIXELS to the widest the droplet can ever be,
                not in percentages.

                react-native-svg resolves a percentage size once at layout, so
                `width="100%"` froze the gloss at the droplet's resting width;
                as the droplet stretched, the gloss ended partway across and
                left a hard vertical seam — the box that appeared inside it
                during a fast swipe. Because the stretch is now capped, the
                maximum width is a known constant, so the gradient can simply
                be drawn at that size and the parent's overflow:hidden clips it
                to whatever the current width is. Always full-bleed, no seam.
              */}
              <Svg width={maxDropletWidth} height={PILL_HEIGHT} style={{ position: 'absolute', left: 0, top: 0 }}>
                <Defs>
                  <LinearGradient id="dropGloss" x1="0" y1="0" x2="0" y2="1">
                    <Stop offset="0" stopColor="#fff" stopOpacity={0.2} />
                    <Stop offset="0.45" stopColor="#fff" stopOpacity={0.03} />
                    <Stop offset="0.75" stopColor="#fff" stopOpacity={0} />
                    <Stop offset="1" stopColor={colors.primary} stopOpacity={0.18} />
                  </LinearGradient>
                </Defs>
                <Rect width={maxDropletWidth} height={PILL_HEIGHT} fill="url(#dropGloss)" />
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
 * The glass recipe per theme. Every value here is a tuning knob.
 *
 * Two variants, chosen in Settings (`lib/glassStore.ts`):
 *
 * - **glass** — the thinner centre. Apple's Liquid Glass reads as glass
 *   because content LENSES at the rim: displacement is near zero across the
 *   middle and rises steeply in the last few px, following a squircle
 *   profile. A shader sampling the native view is the only way to do that
 *   literally, so this approximates the cue that carries the effect — a
 *   bright compressed rim band, light that falls off from the top, and an
 *   inner shadow giving the edge thickness.
 *
 *   The centre is ~25% thinner than the solid variant, but NOT uniform: a
 *   vertical ramp keeps it densest across the label row. That is the part
 *   legibility actually depends on, and it is what lets the rest thin out.
 *   Apple's own answer to a busy backdrop is adaptive dimming rather than
 *   uniform transparency (WWDC25 "Meet Liquid Glass"), for the same reason.
 *
 * - **solid** — the previous recipe, kept intact. Over a dense ledger or a
 *   bright wallpaper the glass variant can cost contrast, and that judgement
 *   belongs to whoever is reading the screen.
 */
function useGlassRecipe() {
  const isLight = useThemeName() === 'light';
  const glassy = useGlassEnabled();
  const base = useSolidRecipe(isLight);
  if (!glassy) return { ...base, lens: 0, innerShadow: 0, topFall: 0, ramp: 0 };
  return isLight
    ? {
        ...base,
        // Thinner centre, carried by the rim instead.
        tint: BLUR_AVAILABLE ? 'rgba(255, 255, 255, 0.06)' : 'rgba(250, 252, 249, 0.72)',
        blurRadius: 18,
        // The compressed bright band that reads as a thick lens edge.
        lens: 0.5,
        // Depth just inside the rim; without it the band looks painted on.
        innerShadow: 0.1,
        // Light from above: the top edge is bright, the bottom nearly bare.
        topFall: 0.85,
        // Extra tint across the label row, where contrast is spent.
        ramp: 0.07,
        specular: 1,
        edgeGlow: 0.3,
      }
    : {
        ...base,
        tint: BLUR_AVAILABLE ? 'rgba(255, 255, 255, 0.032)' : 'rgba(26, 27, 33, 0.7)',
        blurRadius: 18,
        lens: 0.36,
        innerShadow: 0.3,
        topFall: 0.8,
        ramp: 0.06,
        specular: 0.72,
        edgeGlow: 0.13,
      };
}

/** The original recipe: a denser capsule, no lensing. */
function useSolidRecipe(isLight: boolean) {
  return isLight
    ? {
        // Between liquid and frosted. Radius 6 left content too sharp — text
        // behind the bar competed with the tab labels. 14 turns it into soft
        // shapes and colour that still show through; 28 (the old value, under
        // a thick white sheet) erased it into a white panel.
        blurRadius: 14,
        // Native white sheet at ~9% (0.12 × 0.78).
        blurOverlay: 0.12,
        // The whole centre veil is ~17% white. Without blur the bar has to
        // stay dense, or labels are unreadable over the ledger.
        tint: BLUR_AVAILABLE ? 'rgba(255, 255, 255, 0.08)' : 'rgba(250, 252, 249, 0.86)',
        sheenTop: 0.1,
        // Light gathering in the thick edge of the lens — the band that makes
        // clear glass read as a solid object rather than a hole.
        edgeGlow: 0.34,
        // The bright crescents on the top-left and bottom-right of the capsule.
        specular: 0.95,
        // White speculars vanish against a white page, so a faint dark hairline
        // and a soft shadow do the job of separating the bar from the page.
        hairline: '#1B2A1F',
        hairlineOpacity: 0.1,
        shadow: 0.075,
        // White on a light page, black on a dark one: the ramp DEEPENS the
        // existing tint rather than introducing a second colour.
        rampColor: '#ffffff',
        lens: 0,
        innerShadow: 0,
        topFall: 0,
        ramp: 0,
      }
    : {
        blurRadius: 14,
        // Native smoke sheet at ~10% (0.14 × 0.69).
        blurOverlay: 0.14,
        // A white lift, not smoke — smoke on a dark page reads as a darker band.
        tint: BLUR_AVAILABLE ? 'rgba(255, 255, 255, 0.045)' : 'rgba(26, 27, 33, 0.82)',
        sheenTop: 0.07,
        edgeGlow: 0.14,
        specular: 0.6,
        hairline: '#000000',
        hairlineOpacity: 0.35,
        shadow: 0.3,
        rampColor: '#000000',
        lens: 0,
        innerShadow: 0,
        topFall: 0,
        ramp: 0,
      };
}

/** How far the soft shadow reaches past the capsule, in px. */
const SHADOW_SPREAD = 14;
/** How far the shadow drifts downward per px of spread — light from above. */
const SHADOW_DROP = 0.4;

/**
 * A soft shadow that lives entirely OUTSIDE the capsule.
 *
 * Android elevation cannot be used here: on a translucent view it casts from
 * the outline and the shadow shows THROUGH the glass as a grey band. Instead
 * this draws concentric 1px rings, each fainter than the last, starting just
 * past the edge. Each ring grows faster than it drops, so none ever lands
 * inside the capsule — the clear centre stays clear.
 */
function GlassShadow({ radius, width, height }: { radius: number; width: number; height: number }) {
  const { shadow } = useGlassRecipe();
  if (width === 0 || shadow === 0) return null;
  const S = SHADOW_SPREAD;
  const rings = [];
  for (let i = 2; i <= S; i++) {
    const fall = 1 - (i - 2) / (S - 1);
    rings.push(
      <Rect
        key={i}
        x={S - i}
        y={S - i + i * SHADOW_DROP}
        width={width + i * 2}
        height={height + i * 2}
        rx={radius + i}
        fill="none"
        stroke="#000"
        strokeOpacity={shadow * fall * fall}
        strokeWidth={1}
      />,
    );
  }
  const svgWidth = width + S * 2 + 1;
  const svgHeight = height + S * (2 + SHADOW_DROP) + 1;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: -S, top: -S, width: svgWidth, height: svgHeight }}>
      <Svg width={svgWidth} height={svgHeight}>
        {rings}
      </Svg>
    </View>
  );
}

/** Inset ring distances for the edge glow, outermost first. */
const EDGE_BANDS = [1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5, 8.5];

/**
 * The lens rim: tight to the edge, where a squircle refraction profile puts
 * nearly all of its displacement. Half-pixel steps because the band is only
 * ~3px wide and whole pixels would band visibly.
 */
const LENS_BANDS = [0.5, 1, 1.5, 2, 2.5, 3];

/** The inner face of that rim, a little further in. */
const INNER_BANDS = [3.5, 4.5, 5.5];

/**
 * Liquid glass, built in layers from the back:
 *   1. a medium backdrop blur under a thin native tint — the content behind
 *      the bar shows through as soft shapes and colour
 *   2. a light tint (dense only when there is no blur at all)
 *   3. a faint top sheen
 *   4. an edge glow: light pooling in the thick rim of a lens, strongest at
 *      the edge and gone ~9px in. Real refraction needs a shader over the
 *      native content; this band is what the eye reads as "thick glass"
 *   5. a hairline for definition on light pages
 *   6. specular crescents on the top-left and bottom-right ends
 */
function GlassSurface({ radius, width, height }: { radius: number; width: number; height: number }) {
  const g = useGlassRecipe();

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: 'hidden' }]}>
      <GlassBlur radius={g.blurRadius} overlay={g.blurOverlay} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: g.tint }]} />
      {width > 0 ? (
        <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
          <Defs>
            <LinearGradient id="sheen" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#fff" stopOpacity={g.sheenTop} />
              <Stop offset="0.5" stopColor="#fff" stopOpacity={0} />
            </LinearGradient>
            {/*
              The label row sits in the lower half of the capsule, so the tint
              is thickest there and thins toward the top. This is what pays for
              the thinner overall centre: contrast is spent where the text is,
              not spread evenly over glass nobody is reading through.
            */}
            <LinearGradient id="ramp" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={g.rampColor} stopOpacity={0} />
              <Stop offset="0.45" stopColor={g.rampColor} stopOpacity={g.ramp * 0.5} />
              <Stop offset="1" stopColor={g.rampColor} stopOpacity={g.ramp} />
            </LinearGradient>
            {/*
              Light from above. Apple's highlight layer defines the silhouette
              by where light lands, not by an even outline: the top edge is
              bright, the sides fall away, the bottom is nearly bare.
            */}
            <LinearGradient id="topLight" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#fff" stopOpacity={g.topFall} />
              <Stop offset="0.35" stopColor="#fff" stopOpacity={g.topFall * 0.25} />
              <Stop offset="1" stopColor="#fff" stopOpacity={0} />
            </LinearGradient>
            {/*
              Diagonal in bounding-box units, so on a wide capsule the bright
              stops cover the left cap plus the first stretch of the top edge,
              and mirror on the bottom-right: two crescents, like light
              catching the ends of a glass rod.
            */}
            <LinearGradient id="specular" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor="#fff" stopOpacity={g.specular} />
              <Stop offset="0.14" stopColor="#fff" stopOpacity={g.specular * 0.45} />
              <Stop offset="0.32" stopColor="#fff" stopOpacity={g.specular * 0.08} />
              <Stop offset="0.68" stopColor="#fff" stopOpacity={g.specular * 0.08} />
              <Stop offset="0.86" stopColor="#fff" stopOpacity={g.specular * 0.35} />
              <Stop offset="1" stopColor="#fff" stopOpacity={g.specular * 0.8} />
            </LinearGradient>
          </Defs>
          <Rect width={width} height={height} fill="url(#sheen)" />
          {g.ramp > 0 ? <Rect width={width} height={height} fill="url(#ramp)" /> : null}
          {EDGE_BANDS.map((k, i) => {
            const fall = 1 - i / EDGE_BANDS.length;
            return (
              <Rect
                key={k}
                x={k}
                y={k}
                width={width - k * 2}
                height={height - k * 2}
                rx={radius - k}
                fill="none"
                stroke="#fff"
                strokeOpacity={g.edgeGlow * fall * fall}
                strokeWidth={1}
              />
            );
          })}
          {/*
            The lens rim. Where the flat EDGE_BANDS above fade evenly inward,
            these are tight to the edge and rise QUARTICALLY — the squircle
            refraction profile, which is near flat across the middle and climbs
            steeply in the last few px. That concentration is what the eye reads
            as thickness; spread the same light evenly and it reads as a border.
          */}
          {g.lens > 0
            ? LENS_BANDS.map((k, i) => {
                const t = 1 - i / LENS_BANDS.length;
                return (
                  <Rect
                    key={`lens-${k}`}
                    x={k}
                    y={k}
                    width={width - k * 2}
                    height={height - k * 2}
                    rx={radius - k}
                    fill="none"
                    stroke="#fff"
                    strokeOpacity={g.lens * t * t * t * t}
                    strokeWidth={1}
                  />
                );
              })
            : null}
          {/*
            Depth just inside the rim. Without it the bright band sits ON the
            surface; with it the edge has a near and a far face, which is the
            difference between a lit outline and a piece of glass.
          */}
          {g.innerShadow > 0
            ? INNER_BANDS.map((k, i) => {
                const t = 1 - i / INNER_BANDS.length;
                return (
                  <Rect
                    key={`inner-${k}`}
                    x={k}
                    y={k}
                    width={width - k * 2}
                    height={height - k * 2}
                    rx={radius - k}
                    fill="none"
                    stroke="#000"
                    strokeOpacity={g.innerShadow * t * t}
                    strokeWidth={1}
                  />
                );
              })
            : null}
          {/* Light from above, over the rim rather than the whole face. */}
          {g.topFall > 0 ? (
            <Rect
              x={0.75}
              y={0.75}
              width={width - 1.5}
              height={height - 1.5}
              rx={radius - 0.75}
              fill="none"
              stroke="url(#topLight)"
              strokeWidth={1.5}
            />
          ) : null}
          <Rect
            x={0.5}
            y={0.5}
            width={width - 1}
            height={height - 1}
            rx={radius - 0.5}
            fill="none"
            stroke={g.hairline}
            strokeOpacity={g.hairlineOpacity}
            strokeWidth={1}
          />
          <Rect
            x={1.25}
            y={1.25}
            width={width - 2.5}
            height={height - 2.5}
            rx={radius - 1.25}
            fill="none"
            stroke="url(#specular)"
            strokeWidth={1.5}
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
  const isLight = useThemeName() === 'light';
  const bounce = useSharedValue(1);
  const on = useSharedValue(focused ? 1 : 0);
  // Over light frosted glass a 55%-opacity medium label washes into the blur
  // behind it, so in light mode inactive labels stay near full strength and
  // everything is a weight heavier. Dark glass keeps the dimmer contrast.
  const restOpacity = isLight ? 0.85 : 0.55;

  useEffect(() => {
    on.value = withTiming(focused ? 1 : 0, { duration: 240 });
    if (focused) {
      bounce.value = withSequence(withTiming(0.82, { duration: 90 }), withSpring(1, { damping: 9, stiffness: 260 }));
    }
  }, [focused, on, bounce]);

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: bounce.value }, { translateY: interpolate(on.value, [0, 1], [0, -1]) }],
  }));
  const labelStyle = useAnimatedStyle(
    () => ({ opacity: interpolate(on.value, [0, 1], [restOpacity, 1]) }),
    [restOpacity],
  );

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
          weight={isLight ? (focused ? 'bold' : 'semibold') : focused ? 'semibold' : 'medium'}
          size={10}
          tone={focused ? 'primary' : 'default'}
          numberOfLines={1}
          style={{ marginTop: 3 }}
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
        onLongPress={() => router.push('/sheets')}
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
