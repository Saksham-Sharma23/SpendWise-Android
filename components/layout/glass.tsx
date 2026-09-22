import { requireOptionalNativeModule } from 'expo';
import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useRef, type ReactNode, type RefObject } from 'react';
import {
  findNodeHandle,
  Platform,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { makeMutable, useAnimatedScrollHandler, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { create } from 'zustand';

import { useGlassStore } from '@/lib/glassStore';
import { usePerfFlags } from '@/lib/perfFlags';
import { useColors, useThemeName, type GlassStyle } from '@/lib/theme';
import {
  LENS_AVAILABLE,
  LENS_NEEDS_NEWER_ANDROID,
  LensTargetView,
  LensView,
  type LensOptics,
} from '@/modules/liquid-glass';

export { LENS_AVAILABLE, LENS_NEEDS_NEWER_ANDROID, type LensOptics };

/**
 * Real backdrop blur for the glass tab bar — when the native module exists.
 *
 * `expo-blur` is native code. An APK built before it was added has no
 * ExpoBlur module, and merely importing the package would throw, so it is
 * required lazily and only after checking the module is present. Until the
 * next native build the bar renders as tinted glass with no blur; after it,
 * the blur switches on with no code change.
 *
 * Android blurs a *target* rather than "whatever is behind": content must sit
 * inside a BlurTargetView, and the BlurView must live outside it. Each tab
 * screen wraps itself in one (see <BlurTarget>) and registers on focus, so
 * the bar always blurs the screen you are looking at.
 */

export const BLUR_AVAILABLE = requireOptionalNativeModule('ExpoBlur') != null;

/**
 * Whether the blur actually RENDERS on this phone — a stricter question than
 * whether the module exists.
 *
 * `GlassBlur` asks for `dimezisBlurViewSdk31Plus`, which expo-blur quietly
 * turns into no blur at all below Android 12 (API 31): only its thin overlay
 * sheet is painted. The app's minSdk is 24, so on Android 7–11 the bar had a
 * near-clear tint chosen for a blur that was never there, and its labels sat
 * on raw content. Every "is there a blur behind this glass?" decision asks
 * this, not `BLUR_AVAILABLE`.
 */
export const BLUR_RENDERS =
  BLUR_AVAILABLE && Platform.OS === 'android' && typeof Platform.Version === 'number' && Platform.Version >= 31;

/**
 * The glass style actually DRAWN: the one chosen in Settings, except that
 * liquid glass needs a real blur behind it. Clear glass over raw content is
 * unreadable, so without one the bar stays frosted whatever was chosen, and
 * Settings says why.
 */
export function useGlassStyle(): GlassStyle {
  const chosen = useGlassStore((s) => s.style);
  return BLUR_RENDERS && chosen === 'liquid' ? 'liquid' : 'frosted';
}

// ---------------------------------------------------------------------------
// The scroll under the glass
// ---------------------------------------------------------------------------

/**
 * How far the tab screen under the bar has scrolled, in px. Liquid glass
 * drifts its glare with it, so the light seems to move through the glass as
 * the content passes beneath.
 *
 * One app-wide shared value, written by whichever tab screen is scrolling and
 * read by the bar on the UI thread. Each screen remembers its own offset and
 * hands it back on focus (easing over the tab cross-fade), so switching tabs
 * never makes the light jump.
 */
export const glassScrollY = makeMutable(0);

/** Matches the tab cross-fade (app/(tabs)/_layout.tsx). */
const SCROLL_HANDOFF_MS = 180;

/**
 * For a tab screen's `Animated.ScrollView`: feeds `glassScrollY` from the UI
 * thread, so scrolling costs the JS thread nothing. Returns undefined unless
 * the bar is liquid glass — frosted glass does not use it.
 *
 * `enabled` is false for any screen that does not own the scrolling under the
 * bar: a stack screen (no bar over it), or a tab whose list scrolls itself
 * (the ledger, which uses `useGlassScrollListener`). Otherwise its focus
 * handoff would write its own offset — always 0 — over the real one.
 */
export function useGlassScrollHandler(enabled: boolean) {
  const liquid = useGlassStyle() === 'liquid';
  const last = useSharedValue(0);

  useFocusEffect(
    useCallback(() => {
      if (enabled) glassScrollY.value = withTiming(last.value, { duration: SCROLL_HANDOFF_MS });
    }, [enabled, last]),
  );

  const handler = useAnimatedScrollHandler({
    onScroll: (e) => {
      last.value = e.contentOffset.y;
      glassScrollY.value = e.contentOffset.y;
    },
  });
  return liquid && enabled ? handler : undefined;
}

/**
 * The same, for a list that reports scrolling to JS anyway (the ledger's
 * FlashList, which reads every scroll event to virtualise its rows). One
 * shared-value write per event, on top of work FlashList already does.
 */
export function useGlassScrollListener(): ((e: NativeSyntheticEvent<NativeScrollEvent>) => void) | undefined {
  const liquid = useGlassStyle() === 'liquid';
  const last = useRef(0);

  useFocusEffect(
    useCallback(() => {
      glassScrollY.value = withTiming(last.current, { duration: SCROLL_HANDOFF_MS });
    }, []),
  );

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    last.current = e.nativeEvent.contentOffset.y;
    glassScrollY.value = last.current;
  }, []);
  return liquid ? onScroll : undefined;
}

/** How much of the page colour the fade reaches at the very bottom. */
const EDGE_FADE_OPACITY = 0.55;

/**
 * Liquid glass only: the page softens as it runs under the bar.
 *
 * Clear glass hides less of what is behind it, so over the busiest content —
 * a column of ledger amounts — the tab labels would compete with it. This
 * dissolves the content toward the page colour in the band the bar sits in,
 * the way iOS fades a scroll edge under its own glass.
 *
 * It must be drawn INSIDE the blur target (a tab screen's `Screen` puts it
 * last), so the glass blurs the same softened content the page around the
 * bar shows. Outside the target, the content seen through the glass would be
 * sharper than the content beside it.
 */
export function ScrollEdgeFade({ height }: { height: number }) {
  const liquid = useGlassStyle() === 'liquid';
  const colors = useColors();
  if (!liquid) return null;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height }}>
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id="edgeFade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.background} stopOpacity={0} />
            <Stop offset="1" stopColor={colors.background} stopOpacity={EDGE_FADE_OPACITY} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#edgeFade)" />
      </Svg>
    </View>
  );
}

type BlurModule = typeof import('expo-blur');
// expo-blur must only be loaded when the native module is actually present,
// which a static import cannot express. The non-blur path is the fallback.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const blur: BlurModule | null = BLUR_AVAILABLE ? (require('expo-blur') as BlurModule) : null;

interface BlurTargetState {
  target: RefObject<View | null> | null;
  /** The same screen's lens target (liquid glass, Android 13+); its ref stays empty elsewhere. */
  lensTarget: RefObject<View | null> | null;
  setTarget: (target: RefObject<View | null>, lensTarget: RefObject<View | null>) => void;
}

const useBlurTargetStore = create<BlurTargetState>((set) => ({
  target: null,
  lensTarget: null,
  setTarget: (target, lensTarget) => set({ target, lensTarget }),
}));

const styles = StyleSheet.create({ fill: { flex: 1 } });

/** Wrap a tab screen's content so the glass bar can blur it, and bend it. */
export function BlurTarget({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const ref = useRef<View | null>(null);
  const lensRef = useRef<View | null>(null);
  const setTarget = useBlurTargetStore((s) => s.setTarget);

  useFocusEffect(
    useCallback(() => {
      if (BLUR_AVAILABLE) setTarget(ref, lensRef);
    }, [setTarget]),
  );

  if (!blur) return <View style={style}>{children}</View>;
  const Target = blur.BlurTargetView;
  // The page colour has to be painted INSIDE the target, as a child. A
  // `backgroundColor` style lands on expo-blur's outer wrapper view, but what
  // gets blurred is the transparent Dimezis target nested inside it. Wherever
  // the page had no content, the blur sampled nothing and fell back to the
  // window's dark background, so the glass turned grey/black over empty space.
  const { backgroundColor } = StyleSheet.flatten(style) ?? {};
  const page =
    backgroundColor != null ? (
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor }]} />
    ) : null;

  // Where the lens exists, the screen is recorded a second time for it, and
  // the page colour goes inside that recording too, for the same reason as
  // above. Nested whatever the style, so switching style in Settings never
  // remounts the screens underneath.
  const LensTarget = LensTargetView;
  return (
    <Target ref={ref} style={style}>
      {page}
      {LensTarget ? (
        <LensTarget ref={lensRef} style={styles.fill}>
          {page}
          {children}
        </LensTarget>
      ) : (
        children
      )}
    </Target>
  );
}

/**
 * Liquid glass where the lens exists (Android 13+, a build with the module):
 * the screen under the bar drawn through a lens, so it bends at the rim and
 * swells in the middle (modules/liquid-glass). It takes GlassBlur's place —
 * it blurs too, lightly, before it bends.
 */
export function GlassLens({ radius, optics }: { radius: number; optics: LensOptics }) {
  const lensTarget = useBlurTargetStore((s) => s.lensTarget);
  // Dev-only A/B for R5-4, as for the blur; always true in release.
  const on = usePerfFlags((s) => s.blur);
  // The native side finds the screen by its React tag. The ref is filled by
  // the time a screen registers it: that happens on focus, after mount.
  const targetId = useMemo(() => {
    const node = lensTarget?.current;
    return node ? findNodeHandle(node) : null;
  }, [lensTarget]);

  const Lens = LensView;
  if (!Lens || !on) return null;
  return (
    <Lens
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      targetId={targetId}
      cornerRadius={radius}
      blur={optics.blur}
      bevel={optics.bevel}
      bend={optics.bend}
      zoom={optics.zoom}
      dispersion={optics.dispersion}
    />
  );
}

/**
 * The frosted backdrop. Renders nothing when blur is unavailable.
 *
 * The tint follows the theme: a dark tint over a light page darkens
 * everything behind the bar into a grey band, which is the opposite of what
 * frosted glass should do.
 *
 * Takes blur strength and tint opacity SEPARATELY, because expo-blur on
 * Android derives both from its single `intensity` prop:
 *   - blur radius     = intensity / blurReductionFactor
 *   - overlay alpha   = intensity / 100 × 0.69 (dark) or × 0.78 (light)
 * Raising intensity for "more blur" also paints a thicker grey/white sheet
 * over the content. At 85 that sheet alone hid ~60% of what was behind the
 * bar, which is why it read as smoked plastic rather than glass. So intensity
 * is set from `overlay`, and the reduction factor is solved to hit `radius`.
 *
 * @param radius  effective blur radius
 * @param overlay 0–1 opacity scale of the native tint sheet (1 = intensity 100)
 */
export function GlassBlur({ radius = 12, overlay = 0.45 }: { radius?: number; overlay?: number }) {
  const target = useBlurTargetStore((s) => s.target);
  const theme = useThemeName();
  // Dev-only A/B for R5-4; always true in release (lib/perfFlags.ts).
  const on = usePerfFlags((s) => s.blur);
  if (!blur || !target || !on) return null;
  const BlurView = blur.BlurView;
  // Kept within 1–100: above 100 the native alpha byte overflows, and 0 hits
  // expo-blur's "nativePtr is null" crash.
  const intensity = Math.min(100, Math.max(1, Math.round(overlay * 100)));
  return (
    <BlurView
      blurTarget={target}
      blurMethod="dimezisBlurViewSdk31Plus"
      intensity={intensity}
      blurReductionFactor={intensity / Math.max(1, radius)}
      tint={theme === 'light' ? 'light' : 'dark'}
      style={StyleSheet.absoluteFill}
    />
  );
}
