import {
  advance,
  angleOf,
  shortestDelta,
  turnToPaise,
  angleToPaise,
  DIAL_SCALES,
  normalizeAngle,
  paiseToAngle,
  presetsFor,
  rescale,
  roundToStep,
  scaleFor,
  turnsOf,
} from '../domain/dial';

/**
 * The dial's awkward cases. Every one of these is something a user would
 * notice immediately and could not explain: a dial that empties when dragged
 * past the top, or a budget that multiplies itself by ten when the scale
 * changes.
 */

const TAU = Math.PI * 2;
const [SMALL, MEDIUM] = DIAL_SCALES as [(typeof DIAL_SCALES)[0], (typeof DIAL_SCALES)[1]];

describe('angleOf — a clock, not a graph', () => {
  it("puts zero at twelve o'clock", () => {
    expect(angleOf(0, -100)).toBeCloseTo(0);
  });

  it('increases CLOCKWISE despite screen y growing downward', () => {
    expect(angleOf(100, 0)).toBeCloseTo(Math.PI / 2); // 3 o'clock
    expect(angleOf(0, 100)).toBeCloseTo(Math.PI); // 6 o'clock
    expect(angleOf(-100, 0)).toBeCloseTo((3 * Math.PI) / 2); // 9 o'clock
  });

  it('never returns a negative angle', () => {
    for (const [dx, dy] of [
      [-1, -1],
      [-1, 1],
      [1, 1],
      [1, -1],
      [-1, 0],
    ]) {
      expect(angleOf(dx!, dy!)).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('angle <-> paise', () => {
  it('maps a quarter turn to a quarter of the scale', () => {
    expect(angleToPaise(TAU / 4, SMALL)).toBe(SMALL.maxPaise / 4);
    expect(angleToPaise(TAU / 2, SMALL)).toBe(SMALL.maxPaise / 2);
  });

  it('round-trips a value through its angle', () => {
    for (const paise of [0, 1_000_00, 2_500_00, 9_900_00]) {
      expect(angleToPaise(paiseToAngle(paise, SMALL), SMALL)).toBe(paise);
    }
  });

  it('snaps to the step, so the number never lands between notches', () => {
    const angle = 0.013; // a tiny, deliberately awkward angle
    const paise = angleToPaise(angle, SMALL);
    expect(paise % SMALL.stepPaise).toBe(0);
  });

  it('treats a full turn as zero, like a clock hand', () => {
    expect(angleToPaise(TAU, SMALL)).toBe(0);
    expect(normalizeAngle(TAU)).toBeCloseTo(0);
  });
});

describe('advance - dragging across twelve o clock', () => {
  it('reads a step forward over the top as a small INCREASE', () => {
    // 359 -> 1 degrees. Comparing raw angles would read this as -358, and
    // the dial would collapse from full to empty under the thumb.
    const from = TAU * 0.99;
    const { paise } = advance(from, TAU * 0.99, TAU * 0.01, SMALL);
    expect(paise).toBeGreaterThan(turnToPaise(from, SMALL));
  });

  it('winds past a full turn instead of wrapping to zero', () => {
    const { paise } = advance(TAU * 0.95, TAU * 0.95, TAU * 0.05, SMALL);
    expect(paise).toBeGreaterThan(SMALL.maxPaise);
  });

  it('reads a step backward over the top as a DECREASE', () => {
    const from = TAU * 0.01 + 0.3;
    const { paise } = advance(from, TAU * 0.01, TAU * 0.99, SMALL);
    expect(paise).toBeLessThan(turnToPaise(from, SMALL));
  });

  it('never goes below zero', () => {
    expect(advance(0, TAU * 0.01, TAU * 0.9, SMALL).paise).toBe(0);
    expect(advance(0, TAU * 0.5, TAU * 0.1, SMALL).turn).toBe(0);
  });

  it('always lands on the step', () => {
    let turn = 0;
    for (let i = 0; i < 40; i++) {
      const out = advance(turn, (i * 0.37) % TAU, ((i + 1) * 0.37) % TAU, SMALL);
      turn = out.turn;
      expect(out.paise % SMALL.stepPaise).toBe(0);
    }
  });

  it('does NOT drift behind the thumb over a long drag', () => {
    // The bug this guards, seen on the phone: accumulating the amount frame
    // by frame and snapping it each time discards the rounding remainder, so
    // 80% of a turn (Rs 8,000) read Rs 2,600. Deriving the amount from the
    // total rotation keeps the two in lockstep however many frames it took.
    const FRAMES = 400;
    const target = TAU * 0.8;
    let turn = 0;
    for (let i = 0; i < FRAMES; i++) {
      turn = advance(turn, (i * target) / FRAMES, ((i + 1) * target) / FRAMES, SMALL).turn;
    }
    expect(turn).toBeCloseTo(target, 6);
    expect(turnToPaise(turn, SMALL)).toBe(8_000_00);
  });

  it('puts the knob where the value is, so it cannot spring away on release', () => {
    // What the screen does in onFinalize: the settle angle must be within
    // half a notch of where the thumb left the knob.
    let turn = 0;
    for (let i = 0; i < 120; i++) {
      turn = advance(turn, (i * TAU * 0.6) / 120, ((i + 1) * TAU * 0.6) / 120, SMALL).turn;
    }
    const settle = (turnToPaise(turn, SMALL) / SMALL.maxPaise) * TAU;
    const halfNotch = (SMALL.stepPaise / SMALL.maxPaise) * TAU * 0.5;
    expect(Math.abs(settle - turn)).toBeLessThanOrEqual(halfNotch + 1e-9);
  });
});

describe('shortestDelta', () => {
  it('takes the short way over twelve o clock in both directions', () => {
    expect(shortestDelta(TAU * 0.99, TAU * 0.01)).toBeCloseTo(TAU * 0.02);
    expect(shortestDelta(TAU * 0.01, TAU * 0.99)).toBeCloseTo(-TAU * 0.02);
  });

  it('is never more than half a turn', () => {
    for (let i = 0; i < 24; i++) {
      for (let j = 0; j < 24; j++) {
        const d = shortestDelta((i / 24) * TAU, (j / 24) * TAU);
        expect(Math.abs(d)).toBeLessThanOrEqual(Math.PI + 1e-9);
      }
    }
  });
});

describe('scale changes', () => {
  it('KEEPS the amount when the scale changes', () => {
    // The bug this guards: keeping the angle instead would turn ₹5,000 into
    // ₹50,000 the moment the user asked for a coarser dial.
    expect(rescale(5_000_00, MEDIUM)).toBe(5_000_00);
  });

  it('re-rounds to the new step when the value falls between notches', () => {
    // ₹5,500 cannot exist on a dial stepping in ₹1,000.
    expect(rescale(5_500_00, MEDIUM)).toBe(6_000_00);
    expect(rescale(5_400_00, MEDIUM)).toBe(5_000_00);
  });

  it('picks the smallest scale that can show a value in one turn', () => {
    expect(scaleFor(2_000_00)).toBe(SMALL);
    expect(scaleFor(40_000_00)).toBe(MEDIUM);
    expect(scaleFor(99_00_000_00)).toBe(DIAL_SCALES[DIAL_SCALES.length - 1]);
  });

  it('counts whole turns, so a wound-past value is not ambiguous', () => {
    expect(turnsOf(SMALL.maxPaise * 0.5, SMALL)).toBe(0);
    expect(turnsOf(SMALL.maxPaise, SMALL)).toBe(1);
    expect(turnsOf(SMALL.maxPaise * 2.3, SMALL)).toBe(2);
  });
});

describe('roundToStep', () => {
  it('rounds to the nearest notch and never goes negative', () => {
    expect(roundToStep(149_00, 100_00)).toBe(100_00);
    expect(roundToStep(151_00, 100_00)).toBe(200_00);
    expect(roundToStep(-500, 100_00)).toBe(0);
  });

  it('survives a zero step rather than dividing by it', () => {
    expect(roundToStep(1234, 0)).toBe(1234);
  });
});

describe('presets', () => {
  it('offers values that land exactly on the step', () => {
    for (const scale of DIAL_SCALES) {
      for (const p of presetsFor(scale)) {
        expect(p % scale.stepPaise).toBe(0);
        expect(p).toBeGreaterThan(0);
      }
    }
  });

  it('rises, and stays inside one turn', () => {
    const presets = presetsFor(SMALL);
    for (let i = 1; i < presets.length; i++) expect(presets[i]!).toBeGreaterThan(presets[i - 1]!);
    expect(presets[presets.length - 1]!).toBeLessThanOrEqual(SMALL.maxPaise);
  });
});
