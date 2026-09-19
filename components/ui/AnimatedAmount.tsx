import { useEffect, useRef, useState } from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';

import { useMotion } from '@/lib/motion';
import { formatINR, type FormatOptions } from '@/lib/money';

interface Props {
  paise: number;
  style?: StyleProp<TextStyle>;
  className?: string;
  options?: FormatOptions;
  durationMs?: number;
  /**
   * False jumps straight to the value. Use it where the figure changes many
   * times a second — dragging the chart scrubber crosses a month every few
   * frames, and a count-up there reads as lag, not as motion.
   */
  animate?: boolean;
}

/**
 * A rupee figure that counts to its new value instead of jumping.
 *
 * The tween runs over integer paise and every frame still renders through
 * formatINR, so the number on screen is always a real, correctly grouped
 * amount — never a float artefact. It settles on the exact target.
 */
export function AnimatedAmount({ paise, style, className, options, durationMs = 700, animate = true }: Props) {
  const { reduced } = useMotion();
  const [shown, setShown] = useState(paise);
  const from = useRef(paise);
  const still = !animate || reduced;

  useEffect(() => {
    const start = from.current;
    const delta = paise - start;
    if (delta === 0) return;
    if (still) {
      from.current = paise;
      setShown(paise);
      return;
    }

    const t0 = Date.now();
    let frame = 0;
    const tick = () => {
      const t = Math.min(1, (Date.now() - t0) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      const next = t === 1 ? paise : Math.round(start + delta * eased);
      from.current = next;
      setShown(next);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [paise, durationMs, still]);

  // Crore-scale totals ("₹26,04,11,590") are wider than a narrow column, so
  // the text shrinks to fit on one line rather than wrapping mid-number.
  return (
    <Text
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={0.6}
      className={className}
      style={[{ fontVariant: ['tabular-nums'] }, style]}
    >
      {formatINR(shown, options)}
    </Text>
  );
}
