import { requireOptionalNativeModule } from 'expo';
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, type ReactNode, type RefObject } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { create } from 'zustand';

import { useThemeName } from '@/lib/theme';

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

type BlurModule = typeof import('expo-blur');
// expo-blur must only be loaded when the native module is actually present,
// which a static import cannot express. The non-blur path is the fallback.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const blur: BlurModule | null = BLUR_AVAILABLE ? (require('expo-blur') as BlurModule) : null;

interface BlurTargetState {
  target: RefObject<View | null> | null;
  setTarget: (target: RefObject<View | null>) => void;
}

const useBlurTargetStore = create<BlurTargetState>((set) => ({
  target: null,
  setTarget: (target) => set({ target }),
}));

/** Wrap a tab screen's content so the glass bar can blur it. */
export function BlurTarget({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const ref = useRef<View | null>(null);
  const setTarget = useBlurTargetStore((s) => s.setTarget);

  useFocusEffect(
    useCallback(() => {
      if (BLUR_AVAILABLE) setTarget(ref);
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
  return (
    <Target ref={ref} style={style}>
      {backgroundColor != null ? (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor }]} />
      ) : null}
      {children}
    </Target>
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
  if (!blur || !target) return null;
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
