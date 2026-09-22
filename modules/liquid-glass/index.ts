import { requireNativeView, requireOptionalNativeModule } from 'expo';
import type { ComponentType, Ref } from 'react';
import { Platform, type View, type ViewProps } from 'react-native';

/**
 * The JS side of the local LiquidGlass module: real refraction for the liquid
 * glass tab bar (android/…/LiquidGlassModule.kt).
 *
 * An APK built before this module existed has no native side, so there
 * everything here is null or false and the bar keeps its drawn liquid glass.
 * The next native build switches the lens on with no code change — the same
 * pattern as expo-blur in components/layout/glass.tsx.
 */
const BUILT = requireOptionalNativeModule('LiquidGlass') != null;

/** The lens is a RuntimeShader, which arrived in Android 13 (API 33). */
const OS_SUPPORTS = Platform.OS === 'android' && typeof Platform.Version === 'number' && Platform.Version >= 33;

/** Real refraction works on this phone, in this build. */
export const LENS_AVAILABLE = BUILT && OS_SUPPORTS;

/** The build has the lens but the phone is too old for it, which Settings explains. */
export const LENS_NEEDS_NEWER_ANDROID = BUILT && !OS_SUPPORTS;

/** How the lens bends what is behind it. Lengths in dp. */
export interface LensOptics {
  /** A light blur, before the bend, so text behind never competes with the labels. */
  blur: number;
  /** How far in from the rim the surface curves. */
  bevel: number;
  /**
   * How far the rim shifts what it shows. Negative pulls what is under the
   * glass out to its rim, spreading it around the edge (the liquid look);
   * positive squeezes what lies just past the glass into the rim.
   */
  bend: number;
  /** Magnification across the glass's short axis. 1 = none. */
  zoom: number;
  /** Blue bends this much more than the bend, red this much less. 0 = no colour fringe. */
  dispersion: number;
}

export interface LensViewProps extends ViewProps, LensOptics {
  /** The React tag of the LensTargetView to draw (findNodeHandle). */
  targetId: number | null;
  cornerRadius: number;
}

export const LensView: ComponentType<LensViewProps> | null = LENS_AVAILABLE
  ? requireNativeView<LensViewProps>('LiquidGlass', 'LensView')
  : null;

/** Wraps a screen so a LensView can draw it again, bent. */
export const LensTargetView: ComponentType<ViewProps & { ref?: Ref<View> }> | null = LENS_AVAILABLE
  ? requireNativeView<ViewProps & { ref?: Ref<View> }>('LiquidGlass', 'LensTargetView')
  : null;
