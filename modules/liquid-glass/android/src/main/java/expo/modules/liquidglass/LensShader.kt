package expo.modules.liquidglass

/**
 * The lens, in AGSL (Android 13+). It runs once per pixel of the glass, on the
 * GPU, over the (lightly blurred) recording of the screen behind it.
 *
 * Coordinates are px in the lens layer: the glass plus a margin on every
 * side, so the rim can show what lies just past it.
 *
 * Two effects, both modelled on a thick, clear capsule:
 *
 *   - Swell. Across the short axis the glass is thickest along its spine, so
 *     it magnifies there, as a glass rod does. Along the length it does not,
 *     so content under the bar still lines up with the content beside it.
 *
 *   - Bend. Within `bevel` of the rim the surface curves away, steepest at
 *     the very edge (a quarter-circle profile). There each pixel samples up
 *     to `bend` px along the outward normal. Negative (the app's setting)
 *     samples inward, spreading what is under the glass out around its rim,
 *     which is what makes it read as liquid; positive squeezes what is just
 *     past the glass into the rim. Blue bends a little more than red
 *     (dispersion), a faint colour fringe.
 */
internal const val LENS_SHADER = """
uniform shader content;

uniform float2 size;
uniform float2 origin;
uniform float radius;
uniform float bevel;
uniform float bend;
uniform float zoom;
uniform float dispersion;
uniform float4 bounds;

// Signed distance to a rounded rectangle centred on 0; negative inside.
float roundRect(float2 p, float2 halfSize, float r) {
  float2 q = abs(p) - halfSize + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

// Held inside the recording, so the rim never samples past the screen's edge.
float4 pick(float2 at) {
  return float4(content.eval(clamp(at, bounds.xy, bounds.zw)));
}

half4 main(float2 coord) {
  float2 halfSize = size * 0.5;
  float2 center = origin + halfSize;
  float2 p = coord - center;
  float r = min(radius, min(halfSize.x, halfSize.y));
  float d = roundRect(p, halfSize, r);

  // One pixel of anti-aliasing at the outline, nothing outside it.
  float coverage = clamp(0.5 - d, 0.0, 1.0);
  if (coverage <= 0.0) {
    return half4(0.0);
  }

  // Swell: sample nearer the spine, the nearest point on the capsule's centre line.
  float2 spine = clamp(p, r - halfSize, halfSize - r);
  float2 at = center + spine + (p - spine) / zoom;

  float depth = -d;
  if (bevel > 0.0 && depth < bevel) {
    // 1 at the rim, 0 where the curve ends.
    float x = 1.0 - max(depth, 0.0) / bevel;
    float shift = bend * (1.0 - sqrt(max(1.0 - x * x, 0.0)));
    // The outward normal, from the distance field's gradient.
    float2 n = float2(
        roundRect(p + float2(1.0, 0.0), halfSize, r) - roundRect(p - float2(1.0, 0.0), halfSize, r),
        roundRect(p + float2(0.0, 1.0), halfSize, r) - roundRect(p - float2(0.0, 1.0), halfSize, r));
    float len = length(n);
    n = len > 0.0001 ? n / len : float2(0.0);
    float2 offset = n * shift;

    float4 color = pick(at + offset);
    if (dispersion > 0.0) {
      color.r = pick(at + offset * (1.0 - dispersion)).r;
      color.b = pick(at + offset * (1.0 + dispersion)).b;
    }
    return half4(color * coverage);
  }

  return half4(pick(at) * coverage);
}
"""
