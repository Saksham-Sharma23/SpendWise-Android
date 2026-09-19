import { useEffect, useRef, useState, type ReactNode } from 'react';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { useMotion } from '@/lib/motion';

interface Props {
  /** Changing this swaps the content. Anything comparable with `===`. */
  swapKey: string | number;
  /**
   * Which way the new content travels in: 1 from the right, -1 from the left,
   * 0 for a plain cross-fade. Give a stepper the direction its arrow points,
   * and a toggle the direction the pill just travelled — content that moves
   * against its control feels wrong even when nobody can say why.
   */
  direction?: -1 | 0 | 1;
  /** How far it travels, in px. Small: this is a hint, not a page transition. */
  distance?: number;
  children: ReactNode;
}

/**
 * Swaps one piece of content for another: the old fades out, the new fades in.
 *
 * It renders exactly one child at a time, deliberately. Reanimated's
 * `entering`/`exiting` pair would be shorter, but it keeps both children
 * mounted through the transition, and in normal flow that makes the card grow
 * to hold both and snap back — very visible inside a Card with a chart in it.
 * Holding the outgoing children in state instead costs one extra render and
 * keeps the layout still.
 *
 * While the key is unchanged, children pass straight through, so live query
 * results still update without animating.
 */
export function Swap({ swapKey, direction = 0, distance = 14, children }: Props) {
  const m = useMotion();
  const half = m.swap / 2;

  // The freshest children, for the moment the swap commits — by then a query
  // may have answered and the children captured at the start would be stale.
  const latest = useRef(children);
  latest.current = children;

  const [shown, setShown] = useState<{ key: string | number; node: ReactNode }>({
    key: swapKey,
    node: children,
  });
  // Every commit bumps this, so the fade-in is driven by "a swap landed" and
  // not by the key changing — the key can land back on the one already shown
  // when someone taps twice quickly, and the content would stay invisible.
  const [generation, setGeneration] = useState(0);
  const opacity = useSharedValue(1);
  const shift = useSharedValue(0);
  const mounted = useRef(false);
  const wanted = useRef(swapKey);
  wanted.current = swapKey;

  // Phase 1 — the outgoing content leaves against the direction of travel.
  useEffect(() => {
    if (shown.key === swapKey) return;
    const commit = () => {
      setShown({ key: wanted.current, node: latest.current });
      setGeneration((g) => g + 1);
    };
    if (m.reduced) {
      commit();
      return;
    }
    opacity.value = withTiming(0, { duration: half, easing: Easing.in(Easing.quad) });
    shift.value = withTiming(-direction * distance, { duration: half, easing: Easing.in(Easing.quad) }, (finished) => {
      'worklet';
      if (finished) scheduleOnRN(commit);
    });
    // `shown.key` is read, not depended on: re-running mid-flight would
    // restart the exit from wherever it had got to.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [swapKey, direction, distance, half, m.reduced]);

  // Phase 2 — the incoming content arrives from the other side.
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return; // First render belongs to whatever entrance the parent gives it.
    }
    if (m.reduced) {
      opacity.value = 1;
      shift.value = 0;
      return;
    }
    opacity.value = 0;
    shift.value = direction * distance;
    opacity.value = withTiming(1, { duration: half, easing: Easing.out(Easing.quad) });
    shift.value = withTiming(0, { duration: half, easing: Easing.out(Easing.quad) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generation]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateX: shift.value }],
  }));

  return <Animated.View style={style}>{shown.key === swapKey ? children : shown.node}</Animated.View>;
}
