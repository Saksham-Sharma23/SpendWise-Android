import { Easing, FadeIn, FadeInDown, FadeOut, LinearTransition, useReducedMotion } from 'react-native-reanimated';

import { curves, motion } from './theme';

const bezier = ([x1, y1, x2, y2]: readonly [number, number, number, number]) => Easing.bezier(x1, y1, x2, y2);

/**
 * The app's easing curves (control points in lib/theme.ts `curves`). Use
 * `enter` for anything arriving, `exit` for anything leaving and `standard`
 * for a change in place — never a spring that overshoots.
 */
export const easings = {
  enter: bezier(curves.enter),
  exit: bezier(curves.exit),
  standard: bezier(curves.standard),
};

// ---------------------------------------------------------------------------
// Layout animations — what `entering`, `exiting` and `layout` take
// ---------------------------------------------------------------------------

/**
 * How far content rises as it fades in. Reanimated's default is 25px, which
 * reads as things flying in; 10px reads as settling into place.
 */
const RISE_PX = 10;

/** The longest anything waits in a stagger, so the end of a long group still arrives promptly. */
const MAX_DELAY_MS = 360;

const wait = (ms: number) => Math.min(Math.max(0, ms), MAX_DELAY_MS);

/**
 * The app's layout animations, so every screen moves with one curve, one
 * distance and one pace. They used Reanimated's default easing with fourteen
 * different durations between 150 and 450 ms.
 *
 * Each call returns a fresh builder. All of them follow the phone's "Remove
 * animations" setting (Reanimated's `ReduceMotion.System` default).
 */

/** Content rising gently into place: a card, a section, a row. `delayMs` staggers a group. */
export const rise = (delayMs = 0) =>
  FadeInDown.duration(motion.swap)
    .delay(wait(delayMs))
    .easing(easings.enter)
    .withInitialValues({ transform: [{ translateY: RISE_PX }] });

/** Appearing where it stands, without moving: a chip, a chart swapping mode, a hint. */
export const appear = (delayMs = 0) => FadeIn.duration(motion.base).delay(wait(delayMs)).easing(easings.enter);

/** Leaving: a quick fade, quickening as it goes. */
export const leave = () => FadeOut.duration(motion.quick).easing(easings.exit);

/** Siblings sliding to close or open a gap: no spring, no overshoot. */
export const reflow = () => LinearTransition.duration(motion.base).easing(easings.standard);

/**
 * Animation timing for components, with the accessibility setting applied.
 *
 * Android's "Remove animations" (Settings → Accessibility) is not a style
 * preference — for some people motion causes nausea or makes a screen
 * unreadable. Reanimated reports it through `useReducedMotion()`; this hook
 * turns it into durations of 0, so a component animates by writing the same
 * code either way and simply arrives instantly.
 *
 * The durations themselves live in lib/theme.ts with the other tokens, which
 * stays free of React Native imports so it can be unit-tested in Node.
 *
 * Springs are passed straight to `withSpring`, which follows the system
 * setting itself (`ReduceMotion.System`); a component that must be exact
 * checks `reduced` and assigns the value directly instead.
 */
export interface Motion {
  /** A state change in place: a row dimming, a bar growing. */
  quick: number;
  /** The default for anything appearing or disappearing. */
  base: number;
  /** One panel replacing another. */
  swap: number;
  /** The chart flowing from one range into another. */
  morph: number;
  /** True when the phone has asked for less motion. */
  reduced: boolean;
}

const STILL: Motion = { quick: 0, base: 0, swap: 0, morph: 0, reduced: true };
const MOVING: Motion = { ...motion, reduced: false };

export function useMotion(): Motion {
  return useReducedMotion() ? STILL : MOVING;
}
