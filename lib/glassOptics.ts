/**
 * Liquid glass optics, ported from a WebGL2 reference shader and evaluated
 * around the tab bar's rim instead of per pixel.
 *
 * The reference computes, for every pixel inside the glass, how far it is
 * from the rim and which way the rim faces there (the gradient of a signed
 * distance field), and lights it from those two numbers. A capsule's rim is
 * known exactly — two straight edges and two semicircular caps — so the same
 * formulas can be evaluated once along it and drawn as thin strokes. That is
 * what this file does: the maths is the reference's, term for term; only the
 * sampling is ours.
 *
 * What does NOT port is refraction itself. The shader bends the background by
 * sampling pixels from behind the glass, and React Native gives JS no access
 * to those. The bar lets the background through nearly unblurred instead, and
 * takes its body from this light.
 *
 * Pure — no React, no React Native — so it can be tested in Node.
 *
 * Conventions, matching the shader: angles are RADIANS, measured from +x
 * toward +y with y pointing UP (GL's convention, not the screen's), in
 * [0, 2π). A rim point's angle is the direction of its outward normal.
 */

const TAU = Math.PI * 2;

/** Wrap an angle into [0, 2π), as the shader's `vec2ToAngle` does. */
function wrap(angle: number): number {
  const a = angle % TAU;
  return a < 0 ? a + TAU : a;
}

// ---------------------------------------------------------------------------
// The two ramps
// ---------------------------------------------------------------------------

export interface RampParams {
  /** Reference `factor` / 100. */
  factor: number;
  /** Reference `range`: larger reaches further in. */
  range: number;
  /** Reference `hardness` / 100. */
  hardness: number;
}

/**
 * How strongly light gathers at a given depth inside the rim.
 *
 * The reference's falloff for both its Fresnel and glare terms: a quintic ramp
 * on the signed distance, chosen over a physical Schlick term because it lets
 * the designer place the rim light. At `depth` 0 (the rim) it is saturated;
 * with the reference's defaults it is gone about 4 px in.
 *
 * @param depth    px inside the rim (0 at the edge)
 * @param range    reference `range`
 * @param hardness reference `hardness`, already divided by 100
 */
export function rimRamp(depth: number, range: number, hardness: number): number {
  const base = 1 - (depth / 1500) * (500 / Math.max(0.001, range)) ** 2 + hardness;
  // GLSL's pow() is undefined for a negative base; past the band the light is simply gone.
  if (base <= 0) return 0;
  return Math.min(1, base ** 5);
}

export interface GlareParams {
  /** Reference `glare.factor` / 100. */
  factor: number;
  /** Reference `glare.convergence` / 100. Higher = a tighter highlight. */
  convergence: number;
  /** Reference `glare.oppositeFactor` / 100: the far lobe's brightness. */
  opposite: number;
  /** Light direction, degrees (reference `glare.angle`; −45 = from the top-left). */
  angleDeg: number;
}

/**
 * The glare's strength at a rim point facing `phi`, before depth falloff.
 *
 * Doubling the angle is what makes TWO opposing lobes — light catching both
 * the near rim and the far one, the signature liquid-glass look. At −45° the
 * bright lobe is on the top-left, the far lobe (scaled by `opposite`) on the
 * bottom-right, and the glare is zero at the top-right and bottom-left.
 */
export function glareLobe(phi: number, p: GlareParams): number {
  const angle = (p.angleDeg * Math.PI) / 180;
  const ga = (wrap(phi) - Math.PI / 4 + angle) * 2;
  const farSide = (ga > Math.PI * 1.5 && ga < Math.PI * 3.5) || ga < -Math.PI * 0.5;
  const raw = (0.5 + Math.sin(ga) * 0.5) * (farSide ? 1.2 * p.opposite : 1.2) * p.factor;
  return Math.min(1, Math.max(0, raw) ** (0.1 + p.convergence * 2));
}

// ---------------------------------------------------------------------------
// The capsule's rim, as drawable pieces
// ---------------------------------------------------------------------------

/** A short stretch of the rim: an SVG path, and the way it faces. */
export interface RimPiece {
  d: string;
  /** Outward normal angle, radians, y-up, [0, 2π). */
  phi: number;
}

const f = (n: number) => Number(n.toFixed(2));

/**
 * The rim of a `width` × `height` capsule, `inset` px inside its edge, as
 * pieces short enough that each can carry one lighting value: each straight
 * edge whole (its normal never changes) and each cap in `capSegments` arcs.
 *
 * Screen coordinates (y down) for the paths; y-up angles for `phi`, so the
 * lighting reads exactly as the shader's.
 */
export function capsuleRim(width: number, height: number, inset: number, capSegments: number): RimPiece[] {
  const r = height / 2;
  const rho = r - inset;
  if (rho <= 0 || width < height) return [];

  const pieces: RimPiece[] = [
    { d: `M${f(r)} ${f(inset)}L${f(width - r)} ${f(inset)}`, phi: Math.PI / 2 },
    { d: `M${f(width - r)} ${f(height - inset)}L${f(r)} ${f(height - inset)}`, phi: (Math.PI * 3) / 2 },
  ];

  // Screen angle θ: 0 = right, +90° = down. Right cap runs −90°→90°, left 90°→270°.
  const caps: [cx: number, from: number][] = [
    [width - r, -Math.PI / 2],
    [r, Math.PI / 2],
  ];
  for (const [cx, from] of caps) {
    const step = Math.PI / capSegments;
    for (let i = 0; i < capSegments; i++) {
      const t0 = from + step * i;
      const t1 = t0 + step;
      const tm = t0 + step / 2;
      const x0 = cx + rho * Math.cos(t0);
      const y0 = r + rho * Math.sin(t0);
      const x1 = cx + rho * Math.cos(t1);
      const y1 = r + rho * Math.sin(t1);
      pieces.push({
        // Clockwise on screen (sweep 1), a small arc (flag 0).
        d: `M${f(x0)} ${f(y0)}A${f(rho)} ${f(rho)} 0 0 1 ${f(x1)} ${f(y1)}`,
        // Screen y points down, so the y-up angle of the normal is −θ.
        phi: wrap(-tm),
      });
    }
  }
  return pieces;
}

// ---------------------------------------------------------------------------
// Plans: what to draw
// ---------------------------------------------------------------------------

/** Depths the rim light is sampled at: the centre of each 1 px ring. */
const RIM_DEPTHS = [0.5, 1.5, 2.5, 3.5];

/** Below this a stroke is invisible, so it is not drawn at all. */
const INVISIBLE = 0.01;

/**
 * The Fresnel rim: light from grazing-angle reflection, the same all the way
 * round. Rings at increasing depth with the reference's opacity — its white
 * mix weight, `ramp × factor × 0.7`.
 */
export function fresnelRings(p: RampParams): { inset: number; opacity: number }[] {
  return RIM_DEPTHS.map((depth) => ({
    inset: depth,
    opacity: rimRamp(depth, p.range, p.hardness) * p.factor * 0.7,
  })).filter((ring) => ring.opacity >= INVISIBLE);
}

/**
 * The glare, piece by piece: every rim piece at every depth, with opacity
 * `lobe(facing) × ramp(depth) × strength`. Pieces too faint to see are left
 * out, which is most of the deeper rings — the plan stays small.
 *
 * `strength` scales the white for the theme: the shader pushes lightness past
 * white over whatever is behind the glass; an overlay can only add white.
 */
export function glarePieces(
  width: number,
  height: number,
  glare: GlareParams,
  ramp: Omit<RampParams, 'factor'>,
  strength: number,
  capSegments = 16,
): { d: string; opacity: number }[] {
  const out: { d: string; opacity: number }[] = [];
  for (const depth of RIM_DEPTHS) {
    const fall = rimRamp(depth, ramp.range, ramp.hardness);
    if (fall * strength < INVISIBLE) continue;
    for (const piece of capsuleRim(width, height, depth, capSegments)) {
      const opacity = glareLobe(piece.phi, glare) * fall * strength;
      if (opacity >= INVISIBLE) out.push({ d: piece.d, opacity: Math.min(1, opacity) });
    }
  }
  return out;
}

/**
 * The bevel: the curved band just inside the rim, where real glass would bend
 * the background. It cannot bend anything here, so it is drawn as the soft
 * brightening a curved surface shows — strongest at the rim, gone
 * `thickness` px in. Quadratic falloff, like the reference's bevel profile,
 * which biases curvature hard toward the edge.
 */
export function bevelRings(thickness: number, strength: number): { inset: number; opacity: number }[] {
  const rings: { inset: number; opacity: number }[] = [];
  // Starts past the Fresnel rings, which own the first few px.
  for (let depth = RIM_DEPTHS.length + 0.5; depth < thickness; depth += 1) {
    const t = 1 - depth / thickness;
    const opacity = strength * t * t;
    if (opacity >= INVISIBLE / 2) rings.push({ inset: depth, opacity });
  }
  return rings;
}
