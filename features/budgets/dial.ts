/**
 * The maths behind the budget dial — pure, so the awkward parts (the wrap at
 * twelve o'clock, rounding to a step, changing scale without moving the
 * number) are tested without a gesture or a screen.
 *
 * The dial is an alarm-clock face: one full turn covers `max`, in increments
 * of `step`. Because a budget has no natural maximum the way twelve hours
 * does, the user switches scale instead, and the same angle then means a
 * different amount.
 */

export interface DialScale {
  /** What one full turn covers, in paise. */
  maxPaise: number;
  /** The smallest movement, in paise. Also what one tick mark is worth. */
  stepPaise: number;
  label: string;
}

/**
 * Three scales, each a decade apart. Steps are chosen so a full turn is
 * always 100 notches — the resistance under the thumb feels identical at
 * every scale, only the number moves faster.
 */
export const DIAL_SCALES: DialScale[] = [
  { maxPaise: 10_000_00, stepPaise: 100_00, label: '10k' },
  { maxPaise: 1_00_000_00, stepPaise: 1_000_00, label: '1L' },
  { maxPaise: 10_00_000_00, stepPaise: 10_000_00, label: '10L' },
];

export const TICKS_PER_TURN = 100;

/** Radians, measured clockwise from twelve o'clock — where a dial starts. */
export type Angle = number;

const TAU = Math.PI * 2;

/** Normalise any angle into [0, 2π). */
export function normalizeAngle(a: Angle): Angle {
  const m = a % TAU;
  return m < 0 ? m + TAU : m;
}

/**
 * The angle of a touch relative to the dial's centre, from twelve o'clock.
 *
 * Screen y grows downward, so the usual atan2(y, x) would turn the dial
 * anticlockwise. Negating y and swapping the arguments puts zero at the top
 * and increases clockwise, which is the direction a clock hand moves.
 */
export function angleOf(dx: number, dy: number): Angle {
  return normalizeAngle(Math.atan2(dx, -dy));
}

/** Angle -> paise on this scale, rounded to the step. */
export function angleToPaise(angle: Angle, scale: DialScale): number {
  const fraction = normalizeAngle(angle) / TAU;
  return roundToStep(fraction * scale.maxPaise, scale.stepPaise);
}

/** Paise -> the angle the knob sits at. Values beyond one turn keep winding. */
export function paiseToAngle(paise: number, scale: DialScale): Angle {
  if (scale.maxPaise <= 0) return 0;
  return normalizeAngle((paise / scale.maxPaise) * TAU);
}

export function roundToStep(paise: number, stepPaise: number): number {
  if (stepPaise <= 0) return Math.max(0, Math.round(paise));
  return Math.max(0, Math.round(paise / stepPaise) * stepPaise);
}

/**
 * How many WHOLE turns a value is past the current scale.
 *
 * The dial shows a single ring, so a value larger than one turn would be
 * ambiguous — the ring looks the same at ₹2,000 and ₹12,000. The screen draws
 * this count as a small "+1 turn" marker rather than pretending the
 * difference is invisible.
 */
export function turnsOf(paise: number, scale: DialScale): number {
  if (scale.maxPaise <= 0) return 0;
  return Math.floor(paise / scale.maxPaise);
}

/**
 * The shortest signed rotation from `previous` to `next`.
 *
 * Comparing raw angles would read the step from 359° to 1° as a huge jump
 * backwards, so the dial would snap from full to empty. Taking the SHORTER
 * way round turns that into the small forward step it visibly is — and it is
 * what lets a value wind past one full turn, or back down through zero.
 */
export function shortestDelta(previous: Angle, next: Angle): Angle {
  let delta = normalizeAngle(next) - normalizeAngle(previous);
  if (delta > Math.PI) delta -= TAU;
  else if (delta < -Math.PI) delta += TAU;
  return delta;
}

/** Total rotation (may exceed one turn) -> the amount it represents. */
export function turnToPaise(turn: Angle, scale: DialScale): number {
  return roundToStep(Math.max(0, turn / TAU) * scale.maxPaise, scale.stepPaise);
}

/**
 * Advance a running ROTATION by one frame of drag, and read the amount off it.
 *
 * The amount is derived from the total rotation, never accumulated alongside
 * it. Adding each frame's movement to a running amount and snapping THAT to a
 * notch throws the rounding remainder away sixty times a second, so over a
 * long drag the number falls behind the thumb — at 80% of a turn it read
 * ₹2,600 instead of ₹8,000 — and the knob then springs back to the drifted
 * value on release. Keeping rotation as the single source of truth is what
 * makes the dial track the finger exactly.
 */
export function advance(fromTurn: Angle, previous: Angle, next: Angle, scale: DialScale): { turn: Angle; paise: number } {
  const turn = Math.max(0, fromTurn + shortestDelta(previous, next));
  return { turn, paise: turnToPaise(turn, scale) };
}

/**
 * The scale that suits an amount: the smallest whose full turn contains it.
 *
 * Used when opening the editor on an existing budget, so a ₹40,000 limit
 * arrives on a dial that can show it rather than one wound four times round.
 */
export function scaleFor(paise: number): DialScale {
  for (const scale of DIAL_SCALES) {
    if (paise <= scale.maxPaise) return scale;
  }
  return DIAL_SCALES[DIAL_SCALES.length - 1]!;
}

/**
 * Switching scale must not change the amount.
 *
 * The obvious implementation keeps the ANGLE and recomputes the value, which
 * silently multiplies a budget by ten when the user only wanted finer
 * control. This keeps the value and re-rounds it to the new step.
 */
export function rescale(paise: number, to: DialScale): number {
  return roundToStep(paise, to.stepPaise);
}

/**
 * Sensible starting points, offered as chips under the dial. Values are in
 * paise and always land exactly on the scale's step.
 */
export function presetsFor(scale: DialScale): number[] {
  const quarter = scale.maxPaise / 4;
  return [quarter / 5, quarter / 2, quarter, quarter * 2, quarter * 3].map((p) => roundToStep(p, scale.stepPaise));
}
