import { useRouter, type Tabs } from 'expo-router';
import { ChartColumn, House, LayoutGrid, Plus, Receipt, type LucideIcon } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps } from 'react';
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
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { scheduleOnRN } from 'react-native-worklets';

import { bevelRings, fresnelRings, glarePieces, type GlareParams, type RampParams } from '@/lib/glassOptics';
import { useMotion } from '@/lib/motion';
import { springs, useColors, useThemeName, withAlpha } from '@/lib/theme';
import { PressableScale } from '../ui/PressableScale';
import { BLUR_RENDERS, GlassBlur, glassScrollY, useGlassStyle } from './glass';
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
 * Liquid glass only: how much an icon grows when the droplet sits squarely on
 * it, like type seen through a lens, and how much more while the droplet is
 * being dragged (it swells, so it magnifies more).
 */
const LENS_MAGNIFY = 0.14;
const LENS_DRAG_MAGNIFY = 0.06;
/** How far from an icon's centre the lens still affects it, in slots. */
const LENS_REACH = 0.6;

/**
 * The tabs built quietly in the background after launch, in the order people
 * tend to reach them. Home is already built — it is where the app opens.
 */
const PRELOAD_ORDER = ['transactions', 'insights', 'more'];
/** Long enough for Home to finish its entrance before anything else is built. */
const PRELOAD_AFTER_MS = 1200;
/** One tab at a time, so no single frame carries two screens' worth of mounting. */
const PRELOAD_GAP_MS = 600;

/**
 * The glass tab bar, in one of two styles (Settings → Glass effect):
 *
 * - **Frosted** (the default, and the original look): a medium blur under a
 *   thin tint, so the bar stays calm over busy screens.
 * - **Liquid**: nearly clear — a 3 px blur and no fill; the glass gets its body
 *   from light instead: a crisp Fresnel rim, a bevel band and two glare lobes
 *   that drift as you scroll (the reference shader's optics, lib/glassOptics),
 *   and a dark caustic along the underside. The droplet becomes a clear lens
 *   that magnifies the icon beneath it.
 *
 * Both are built from the same layers; see GlassSurface. Liquid needs a real
 * blur behind it, so without one (below Android 12) the bar stays frosted.
 *
 * The selection is one "droplet" rather than a pill per tab. Its two edges
 * run on slightly different springs, so as it travels it lengthens a touch
 * and settles back into shape when it lands. Drag along the bar and the
 * droplet follows your finger, swelling like a lens, and selects the tab you
 * release on.
 */
export function TabBar({ state, navigation }: BottomTabBarProps) {
  const colors = useColors();
  const isLight = useThemeName() === 'light';
  const liquid = useGlassStyle() === 'liquid';
  const { bottom } = useSafeAreaInsets();
  const [width, setWidth] = useState(0);

  const activeName = state.routes[state.index]?.name ?? 'index';
  const activeSlot = TABS[activeName]?.slot ?? 0;

  usePreloadTabs(
    navigation,
    state.routes.map((r) => r.name),
    activeName,
  );

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

  // Liquid glass swells a little more under the finger: it is the softer material.
  const swellY = liquid ? 0.14 : 0.1;
  const swellX = liquid ? 0.08 : 0.06;

  /**
   * What each tab needs to be magnified by the droplet passing over it.
   * Shared values only, so the magnification runs on the UI thread and the
   * tabs never re-render while the droplet moves. Null draws no lens at all.
   */
  const lens = useMemo<Lens | null>(
    () => (liquid && slotWidth > 0 ? { lead, trail, dragging, reach: slotWidth * LENS_REACH } : null),
    [liquid, slotWidth, lead, trail, dragging],
  );

  const droplet = useAnimatedStyle(() => {
    const left = Math.min(lead.value, trail.value) - pillWidth / 2;
    // Normalised against the CAP, not the slot, so a fully stretched droplet
    // still reaches the full thinning — the cap must not also halve the squash.
    const s = slotWidth > 0 ? stretch.value / (slotWidth * MAX_STRETCH) : 0;
    const scaleY = 1 - Math.min(1, s) * MAX_THIN + dragging.value * swellY;
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
        { scaleX: 1 + dragging.value * swellX },
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
                  // Frosted: accent glass — a light tint, a gloss on top, a lit
                  // rim. Liquid: a clear lens with only a hint of accent (drawn
                  // in the Svg below), rimmed in light rather than colour.
                  backgroundColor: liquid ? 'rgba(255, 255, 255, 0.05)' : withAlpha(colors.primary, 0.14),
                  borderWidth: 1,
                  borderColor: liquid
                    ? isLight
                      ? withAlpha(colors.primary, 0.28)
                      : 'rgba(255, 255, 255, 0.22)'
                    : withAlpha(colors.primary, 0.36),
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
                    {(liquid ? LIQUID_GLOSS : FROSTED_GLOSS).map(([offset, tone, opacity]) => (
                      <Stop
                        key={offset}
                        offset={offset}
                        stopColor={tone === 'accent' ? colors.primary : '#fff'}
                        stopOpacity={opacity}
                      />
                    ))}
                  </LinearGradient>
                </Defs>
                {liquid ? (
                  <Rect width={maxDropletWidth} height={PILL_HEIGHT} fill={colors.primary} fillOpacity={0.06} />
                ) : null}
                <Rect width={maxDropletWidth} height={PILL_HEIGHT} fill="url(#dropGloss)" />
              </Svg>
            </Animated.View>
          ) : null}

          <View className="flex-1 flex-row items-center" style={{ paddingHorizontal: PAD }}>
            {[0, 1, 2, 3, 4].map((slot) => {
              if (slot === 2) return <AddButton key="add" liquid={liquid} />;
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
                  center={centerOf(slot)}
                  lens={lens}
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
 * The droplet's gloss, top to bottom: [offset, colour, opacity]. Arrays, not
 * JSX: react-native-svg reads a gradient's stops from its direct children,
 * and a conditional fragment of <Stop>s would hide them from it.
 */
type GlossStop = readonly [offset: number, tone: 'white' | 'accent', opacity: number];

const FROSTED_GLOSS: readonly GlossStop[] = [
  [0, 'white', 0.2],
  [0.45, 'white', 0.03],
  [0.75, 'white', 0],
  [1, 'accent', 0.18],
];

/**
 * A clear lens: a brighter top, and a thin bright band just above the bottom —
 * the reflection off the inside of the lower curve that makes a droplet read
 * as solid glass rather than a tinted pill.
 */
const LIQUID_GLOSS: readonly GlossStop[] = [
  [0, 'white', 0.32],
  [0.45, 'white', 0.03],
  [0.75, 'white', 0],
  [0.92, 'white', 0.16],
  [1, 'accent', 0.1],
];

/** The specular crescents: [offset along the diagonal, fraction of `specular`]. */
type SpecularStop = readonly [offset: number, factor: number];

/** Two soft crescents, like light catching the ends of a glass rod. */
const FROSTED_SPECULAR: readonly SpecularStop[] = [
  [0, 1],
  [0.14, 0.45],
  [0.32, 0.08],
  [0.68, 0.08],
  [0.86, 0.35],
  [1, 0.8],
];

/** Inset ring distances for the frosted edge glow, outermost first. */
const EDGE_BANDS = [1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5, 8.5];

/** Frosted glass's rim: the original hand-tuned edge glow and diagonal crescents. */
interface FrostRim {
  /** Light pooled in the thick edge, drawn in EDGE_BANDS. */
  edgeGlow: number;
  /** Strength of the two diagonal specular crescents (FROSTED_SPECULAR). */
  specular: number;
}

/**
 * Liquid glass's rim: the reference shader's optics (lib/glassOptics),
 * evaluated around the capsule instead of per pixel.
 */
interface LiquidOptics {
  /** Grazing-angle reflection: an even, crisp line of light at the very edge. */
  fresnel: RampParams;
  /** The two opposing highlight lobes, and how they fall off inward. */
  glare: GlareParams;
  glareRamp: Omit<RampParams, 'factor'>;
  /** The white an overlay can add for the glare, per theme. */
  glareStrength: number;
  /** The curved band inside the rim: how far in it reaches (px) and how bright it starts. */
  bevelThickness: number;
  bevelStrength: number;
}

interface GlassRecipe {
  /** Effective backdrop blur radius. */
  blurRadius: number;
  /** 0–1 opacity scale of expo-blur's native tint sheet (see GlassBlur). */
  blurOverlay: number;
  /** A flat veil over the blur. */
  tint: string;
  /** Opacity of the top sheen, and how far down it reaches (0–1 of the height). */
  sheenTop: number;
  sheenReach: number;
  /** The dark line inside the underside, where a lens bends light away. 0 = none. */
  caustic: number;
  /** Colour fringing at the rim (dispersion). 0 = none. */
  fringe: number;
  hairline: string;
  hairlineOpacity: number;
  shadow: number;
  /** Exactly one of these is set: the style's rim. */
  frost: FrostRim | null;
  optics: LiquidOptics | null;
}

/**
 * The reference's `apple` preset — the one it tunes to read as Apple's glass.
 * Its factor, hardness and convergence values are already divided by 100, as
 * the reference does before they reach its shader.
 */
const APPLE_FRESNEL: RampParams = { factor: 0.24, range: 30, hardness: 0.2 };
const APPLE_GLARE: GlareParams = { factor: 0.85, convergence: 0.55, opposite: 0.8, angleDeg: -45 };
const APPLE_GLARE_RAMP = { range: 26, hardness: 0.2 } as const;
/** The preset's 22 px bevel is on a 120 px-tall shape; scaled to the 70 px bar. */
const BEVEL_THICKNESS = 13;

/**
 * The four recipes, style × theme. Every value is a tuning knob.
 *
 * Module constants, so each has one identity for the app's lifetime: the rim
 * geometry built from them is memoised on it, and would otherwise be rebuilt
 * on every render.
 *
 * FROSTED is the original look, value for value: it draws exactly the layers
 * it always drew.
 */
const RECIPES: Record<'frosted' | 'liquid', Record<'light' | 'dark', GlassRecipe>> = {
  frosted: {
    light: {
      // Between liquid and frosted. Radius 6 left content too sharp — text
      // behind the bar competed with the tab labels. 14 turns it into soft
      // shapes and colour that still show through; 28 (the old value, under
      // a thick white sheet) erased it into a white panel.
      blurRadius: 14,
      // Native white sheet at ~9% (0.12 × 0.78).
      blurOverlay: 0.12,
      // The whole centre veil is ~17% white. Without a blur actually
      // rendering behind it (BLUR_RENDERS), the bar has to stay dense, or
      // labels are unreadable over the ledger.
      tint: BLUR_RENDERS ? 'rgba(255, 255, 255, 0.08)' : 'rgba(250, 252, 249, 0.86)',
      sheenTop: 0.1,
      sheenReach: 0.5,
      caustic: 0,
      fringe: 0,
      // White speculars vanish against a white page, so a faint dark hairline
      // and a soft shadow do the job of separating the bar from the page.
      hairline: '#1B2A1F',
      hairlineOpacity: 0.1,
      shadow: 0.075,
      // Light gathering in the thick edge of the lens — the band that makes
      // clear glass read as a solid object rather than a hole — and the bright
      // crescents on the top-left and bottom-right of the capsule.
      frost: { edgeGlow: 0.34, specular: 0.95 },
      optics: null,
    },
    dark: {
      blurRadius: 14,
      // Native smoke sheet at ~10% (0.14 × 0.69).
      blurOverlay: 0.14,
      // A white lift, not smoke — smoke on a dark page reads as a darker band.
      tint: BLUR_RENDERS ? 'rgba(255, 255, 255, 0.045)' : 'rgba(26, 27, 33, 0.82)',
      sheenTop: 0.07,
      sheenReach: 0.5,
      caustic: 0,
      fringe: 0,
      hairline: '#000000',
      hairlineOpacity: 0.35,
      shadow: 0.3,
      frost: { edgeGlow: 0.14, specular: 0.6 },
      optics: null,
    },
  },
  liquid: {
    light: {
      // Nearly clear, like the reference's `subtle` preset: 3 px only softens
      // what is behind enough that it does not fight the labels. The native
      // sheet is at its minimum (~0.8%), and there is no veil at all — the
      // glass is defined entirely by its light.
      blurRadius: 3,
      blurOverlay: 0.01,
      tint: 'rgba(255, 255, 255, 0)',
      sheenTop: 0.06,
      sheenReach: 0.35,
      caustic: 0.08,
      // Dispersion only reads against dark.
      fringe: 0,
      hairline: '#1B2A1F',
      hairlineOpacity: 0.08,
      // Clearer glass casts a softer shadow.
      shadow: 0.06,
      frost: null,
      optics: {
        fresnel: APPLE_FRESNEL,
        glare: APPLE_GLARE,
        glareRamp: APPLE_GLARE_RAMP,
        glareStrength: 0.95,
        bevelThickness: BEVEL_THICKNESS,
        bevelStrength: 0.07,
      },
    },
    dark: {
      blurRadius: 3,
      blurOverlay: 0.01,
      tint: 'rgba(255, 255, 255, 0)',
      sheenTop: 0.05,
      sheenReach: 0.35,
      // Stronger than light: a dark line needs more to show on a dark page.
      caustic: 0.18,
      // The reference's dispersion, as a sub-pixel cool/warm split at the rim.
      fringe: 0.08,
      hairline: '#000000',
      hairlineOpacity: 0.3,
      shadow: 0.22,
      frost: null,
      optics: {
        fresnel: APPLE_FRESNEL,
        glare: APPLE_GLARE,
        glareRamp: APPLE_GLARE_RAMP,
        glareStrength: 0.8,
        bevelThickness: BEVEL_THICKNESS,
        bevelStrength: 0.05,
      },
    },
  },
};

/** The recipe for the style actually drawn, in the current theme. */
function useGlassRecipe(): GlassRecipe {
  const theme = useThemeName();
  return RECIPES[useGlassStyle()][theme];
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

/** Where the caustic line sits, inside the underside of the rim, in px. */
const CAUSTIC_INSET = 3;
/** Dispersion at the rim: cool light bends one way, warm the other. */
const FRINGE_COOL = '#7FE7FF';
const FRINGE_WARM = '#FFB38A';

/** How far the glare swings either way as the content scrolls, in degrees. */
const DRIFT_DEG = 12;
/** Scroll distance for one full swing of the light and back, in px. */
const DRIFT_PERIOD_PX = 1400;

/**
 * The glass, built in layers from the back.
 *
 * Both styles:
 *   - a backdrop blur under the native tint sheet, then a flat veil — the
 *     content behind shows through as soft shapes when frosted, nearly sharp
 *     when liquid
 *   - a faint top sheen, where light catches the upper curve
 *   - a hairline for definition on light pages
 *
 * Frosted (the original, drawn exactly as it always was): an edge glow in
 * eight even rings, and two diagonal specular crescents.
 *
 * Liquid (the reference shader's optics, lib/glassOptics):
 *   - the bevel — the curved band inside the rim, brightest at the edge
 *   - the Fresnel rim — a crisp, even line of grazing-angle light
 *   - a caustic — a faint dark line inside the underside, where a lens bends
 *     light away from the eye
 *   - a colour fringe (dark theme) — the reference's dispersion
 *   - the glare — two opposing lobes, top-left and bottom-right, evaluated
 *     around the rim; it drifts as the content scrolls (GlareLayers)
 *
 * The SVG is static: redrawn only when the width, theme or style changes. The
 * one thing that moves — the glare's cross-fade — is view opacity set on the
 * UI thread, which never redraws a path.
 */
function GlassSurface({ radius, width, height }: { radius: number; width: number; height: number }) {
  const g = useGlassRecipe();
  const { frost, optics } = g;
  // Depend only on the recipe, a module constant, so this runs once per style and theme.
  const rings = useMemo(
    () =>
      optics
        ? {
            bevel: bevelRings(optics.bevelThickness, optics.bevelStrength),
            fresnel: fresnelRings(optics.fresnel),
          }
        : null,
    [optics],
  );

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: 'hidden' }]}>
      <GlassBlur radius={g.blurRadius} overlay={g.blurOverlay} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: g.tint }]} />
      {width > 0 ? (
        <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
          <Defs>
            <LinearGradient id="sheen" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#fff" stopOpacity={g.sheenTop} />
              <Stop offset={g.sheenReach} stopColor="#fff" stopOpacity={0} />
            </LinearGradient>
            {frost ? (
              /*
                Diagonal in bounding-box units, so on a wide capsule the bright
                stops cover the left cap plus the first stretch of the top edge,
                and mirror on the bottom-right: two crescents, like light
                catching the ends of a glass rod.
              */
              <LinearGradient id="specular" x1="0" y1="0" x2="1" y2="1">
                {FROSTED_SPECULAR.map(([offset, factor]) => (
                  <Stop key={offset} offset={offset} stopColor="#fff" stopOpacity={frost.specular * factor} />
                ))}
              </LinearGradient>
            ) : null}
            {/* Only the underside: nothing until 60% down, then darkening to the bottom. */}
            {g.caustic > 0 ? (
              <LinearGradient id="caustic" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor="#000" stopOpacity={0} />
                <Stop offset="0.6" stopColor="#000" stopOpacity={0} />
                <Stop offset="1" stopColor="#000" stopOpacity={g.caustic} />
              </LinearGradient>
            ) : null}
          </Defs>
          <Rect width={width} height={height} fill="url(#sheen)" />
          {frost
            ? EDGE_BANDS.map((k, i) => {
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
                    strokeOpacity={frost.edgeGlow * fall * fall}
                    strokeWidth={1}
                  />
                );
              })
            : null}
          {rings
            ? [...rings.bevel, ...rings.fresnel].map(({ inset, opacity }) => (
                <Rect
                  key={inset}
                  x={inset}
                  y={inset}
                  width={width - inset * 2}
                  height={height - inset * 2}
                  rx={radius - inset}
                  fill="none"
                  stroke="#fff"
                  strokeOpacity={opacity}
                  strokeWidth={1}
                />
              ))
            : null}
          {g.caustic > 0 ? (
            <Rect
              x={CAUSTIC_INSET}
              y={CAUSTIC_INSET}
              width={width - CAUSTIC_INSET * 2}
              height={height - CAUSTIC_INSET * 2}
              rx={radius - CAUSTIC_INSET}
              fill="none"
              stroke="url(#caustic)"
              strokeWidth={1}
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
          {frost ? (
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
          ) : null}
          {g.fringe > 0 ? (
            <>
              {/* Offset half a pixel apart: each shows only where the other doesn't. */}
              <Rect
                x={1}
                y={1}
                width={width - 3}
                height={height - 3}
                rx={radius - 1.5}
                fill="none"
                stroke={FRINGE_COOL}
                strokeOpacity={g.fringe}
                strokeWidth={1}
              />
              <Rect
                x={2}
                y={2}
                width={width - 3}
                height={height - 3}
                rx={radius - 1.5}
                fill="none"
                stroke={FRINGE_WARM}
                strokeOpacity={g.fringe}
                strokeWidth={1}
              />
            </>
          ) : null}
        </Svg>
      ) : null}
      {optics && width > 0 ? <GlareLayers width={width} height={height} optics={optics} /> : null}
    </View>
  );
}

/**
 * The reference's two-lobe glare, and its drift as the content scrolls.
 *
 * The lobes are a function of the light's angle, and recomputing them every
 * frame would mean re-rendering hundreds of SVG paths while the user scrolls
 * — exactly the jank this work removes. Instead the glare is built at three
 * angles (−12°, 0, +12° around −45°) once, and the scroll cross-fades between
 * them: at rest only the middle one shows; scroll one way and the light
 * slides into the first, the other way into the third. Opacity on three
 * views is all that changes per frame, and it is set on the UI thread.
 *
 * The swing is a sine of the scroll offset, so it never runs out: the light
 * sways back and forth through the glass for as long as you scroll.
 */
function GlareLayers({ width, height, optics }: { width: number; height: number; optics: LiquidOptics }) {
  const { reduced } = useMotion();

  const layers = useMemo(
    () =>
      [-DRIFT_DEG, 0, DRIFT_DEG].map((shift) =>
        glarePieces(
          width,
          height,
          { ...optics.glare, angleDeg: optics.glare.angleDeg + shift },
          optics.glareRamp,
          optics.glareStrength,
        ),
      ),
    [width, height, optics],
  );

  // −1 … 1. Held at 0 (the reference angle) when the phone asks for less motion.
  const drift = useDerivedValue(() => (reduced ? 0 : Math.sin((glassScrollY.value / DRIFT_PERIOD_PX) * Math.PI * 2)));
  const before = useAnimatedStyle(() => ({ opacity: Math.max(0, -drift.value) }));
  const middle = useAnimatedStyle(() => ({ opacity: 1 - Math.abs(drift.value) }));
  const after = useAnimatedStyle(() => ({ opacity: Math.max(0, drift.value) }));
  const fades = [before, middle, after];

  return (
    <>
      {layers.map((pieces, i) => (
        <Animated.View key={i} pointerEvents="none" style={[StyleSheet.absoluteFill, fades[i]]}>
          <Svg width={width} height={height}>
            {pieces.map((p, j) => (
              <Path key={j} d={p.d} fill="none" stroke="#fff" strokeOpacity={p.opacity} strokeWidth={1} />
            ))}
          </Svg>
        </Animated.View>
      ))}
    </>
  );
}

/**
 * The droplet as a lens (liquid glass only): its two edges, whether it is
 * being dragged, and how far from an icon it still magnifies.
 */
interface Lens {
  lead: SharedValue<number>;
  trail: SharedValue<number>;
  dragging: SharedValue<number>;
  /** px from an icon's centre at which the magnification reaches zero. */
  reach: number;
}

function Tab({
  icon: Icon,
  label,
  focused,
  onPress,
  center,
  lens,
}: {
  icon: LucideIcon;
  label: string;
  focused: boolean;
  onPress: () => void;
  /** This tab's centre along the bar, in the droplet's coordinates. */
  center: number;
  /** Null draws no lens: the frosted bar, or before the bar has a width. */
  lens: Lens | null;
}) {
  const colors = useColors();
  const isLight = useThemeName() === 'light';
  const liquid = lens != null;
  const bounce = useSharedValue(1);
  const on = useSharedValue(focused ? 1 : 0);
  // Over light frosted glass a 55%-opacity medium label washes into the blur
  // behind it, so in light mode inactive labels stay near full strength and
  // everything is a weight heavier. Dark glass keeps the dimmer contrast.
  // Liquid glass hides even less of what is behind it, so both go stronger.
  const restOpacity = liquid ? (isLight ? 0.9 : 0.7) : isLight ? 0.85 : 0.55;

  useEffect(() => {
    on.value = withTiming(focused ? 1 : 0, { duration: 240 });
    if (focused) {
      bounce.value = withSequence(withTiming(0.82, { duration: 90 }), withSpring(1, { damping: 9, stiffness: 260 }));
    }
  }, [focused, on, bounce]);

  const iconStyle = useAnimatedStyle(() => {
    // Seen through the lens: full magnification with the droplet centred on
    // this icon, fading to none a little over half a slot away. Read from the
    // droplet's own shared values, so it tracks the glide frame by frame on
    // the UI thread without a single re-render.
    let magnify = 1;
    if (lens) {
      const distance = Math.abs((lens.lead.value + lens.trail.value) / 2 - center);
      const m = Math.max(0, 1 - distance / lens.reach);
      magnify = 1 + m * (LENS_MAGNIFY + lens.dragging.value * LENS_DRAG_MAGNIFY);
    }
    return {
      transform: [{ scale: bounce.value * magnify }, { translateY: interpolate(on.value, [0, 1], [0, -1]) }],
    };
  });
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
        <Icon
          size={21}
          color={focused ? colors.primary : colors.foreground}
          // Liquid: a touch heavier, so a thin outline still holds up over
          // whatever shows through the clearer glass.
          strokeWidth={focused ? 2.3 : liquid ? 2.1 : 1.9}
        />
      </Animated.View>
      <Animated.View style={labelStyle}>
        <Text
          weight={isLight ? (focused ? 'bold' : 'semibold') : focused ? 'semibold' : 'medium'}
          size={10}
          tone={focused ? 'primary' : 'default'}
          numberOfLines={1}
          style={
            liquid
              ? {
                  marginTop: 3,
                  // A soft halo in the page colour: the label keeps its own
                  // patch of calm over busy content without a panel behind it.
                  textShadowColor: withAlpha(colors.background, 0.6),
                  textShadowRadius: 6,
                  textShadowOffset: { width: 0, height: 0 },
                }
              : { marginTop: 3 }
          }
        >
          {label}
        </Text>
      </Animated.View>
    </PressableScale>
  );
}

/** The add button's diameter. */
const FAB = 52;

function AddButton({ liquid }: { liquid: boolean }) {
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
          width: FAB,
          height: FAB,
          borderRadius: FAB / 2,
          overflow: 'hidden',
          backgroundColor: colors.primary,
          alignItems: 'center',
          justifyContent: 'center',
          // No coloured shadow — Android renders it as a halo that leaks
          // into the glass around it.
        }}
      >
        {liquid ? (
          // A glass bead: the solid accent stays (it is the one call to
          // action), with light on its upper half and a thin lit rim.
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            <Svg width={FAB} height={FAB}>
              <Defs>
                <LinearGradient id="bead" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor="#fff" stopOpacity={0.35} />
                  <Stop offset="0.5" stopColor="#fff" stopOpacity={0} />
                </LinearGradient>
              </Defs>
              <Circle cx={FAB / 2} cy={FAB / 2} r={FAB / 2} fill="url(#bead)" />
              <Circle
                cx={FAB / 2}
                cy={FAB / 2}
                r={FAB / 2 - 0.5}
                fill="none"
                stroke="#fff"
                strokeOpacity={0.3}
                strokeWidth={1}
              />
            </Svg>
          </View>
        ) : null}
        <Animated.View style={spin}>
          <Plus size={25} color={colors.onPrimary} strokeWidth={2.6} />
        </Animated.View>
      </PressableScale>
    </View>
  );
}

/**
 * Build the other tabs in the background, shortly after launch.
 *
 * Tabs are lazy: each one mounted — queries, charts, entrance animations —
 * in the very frames you first switched to it, so a first visit to Insights
 * assembled itself during the cross-fade. Preloaded, it is already finished
 * when you arrive, and the switch is only the fade.
 *
 * One tab at a time, each in an idle moment after Home has settled, so the
 * work never lands on a frame you are using. A tab you have already opened is
 * skipped: it is built. After mounting, a preloaded tab costs nothing —
 * `useDbQuery` defers refreshes while a screen is unfocused.
 */
function usePreloadTabs(navigation: BottomTabBarProps['navigation'], routeNames: string[], activeName: string) {
  const visited = useRef(new Set<string>());
  useEffect(() => {
    visited.current.add(activeName);
  }, [activeName]);

  // Read through refs so the schedule below runs exactly ONCE per launch. If
  // it depended on `navigation`, an identity change on a tab switch would
  // restart the queue — and a user switching tabs every second would keep it
  // from ever finishing.
  const navigationRef = useRef(navigation);
  navigationRef.current = navigation;
  const routeNamesRef = useRef(routeNames);

  useEffect(() => {
    const queue = PRELOAD_ORDER.filter((name) => routeNamesRef.current.includes(name));
    let timer: ReturnType<typeof setTimeout> | undefined;
    let idle: number | undefined;

    const next = (delay: number) => {
      timer = setTimeout(() => {
        idle = requestIdleCallback(() => {
          idle = undefined;
          const name = queue.shift();
          if (name === undefined) return;
          if (!visited.current.has(name)) navigationRef.current.preload(name);
          if (queue.length > 0) next(PRELOAD_GAP_MS);
        });
      }, delay);
    };
    next(PRELOAD_AFTER_MS);

    return () => {
      clearTimeout(timer);
      if (idle !== undefined) cancelIdleCallback(idle);
    };
  }, []);
}
