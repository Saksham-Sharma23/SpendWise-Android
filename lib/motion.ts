import { useReducedMotion } from 'react-native-reanimated';

import { motion } from './theme';

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
 * Springs have no duration to zero, so a component that springs checks
 * `reduced` and assigns the value directly instead.
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
