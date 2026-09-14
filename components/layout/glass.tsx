import { requireOptionalNativeModule } from 'expo';
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, type ReactNode, type RefObject } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { create } from 'zustand';

import { useThemeName } from '../../lib/theme';

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
  return (
    <Target ref={ref} style={style}>
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
 */
export function GlassBlur({ intensity = 45 }: { intensity?: number }) {
  const target = useBlurTargetStore((s) => s.target);
  const theme = useThemeName();
  if (!blur || !target) return null;
  const BlurView = blur.BlurView;
  return (
    <BlurView
      blurTarget={target}
      blurMethod="dimezisBlurViewSdk31Plus"
      intensity={intensity}
      tint={theme === 'light' ? 'light' : 'dark'}
      style={StyleSheet.absoluteFill}
    />
  );
}
