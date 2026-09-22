# Liquid glass on Android: a real refracting lens for React Native (Expo)

A glass surface (a tab bar, a pill, a button) that **bends the content behind it**, like Apple's
Liquid Glass: what is under the glass swells through the middle and spreads out around the rim, with a
faint colour fringe. It is real refraction, done per pixel on the GPU, not light painted on top.

Built for SpendWise (Expo SDK 57, React Native 0.86, New Architecture) and written so it can be copied
into another Expo project as-is.

|                  |                                                                                                              |
| ---------------- | ------------------------------------------------------------------------------------------------------------ |
| **Platform**     | Android 13+ (API 33) for the lens. Older Android and iOS get `null` components, so you fall back cleanly     |
| **Needs**        | An Expo **development build** (not Expo Go) and **one native rebuild** after adding the module               |
| **Dependencies** | None beyond `expo` itself. No Skia, no third-party native libraries                                          |
| **Cost**         | One draw call per frame to re-record, plus a GPU blur and shader over the glass area only. Profile your case |

---

## 1. How it works

Drawn light (SVG highlights, gradients) can make glass _look_ lit, but it cannot move the pixels behind
it, and moving pixels is what makes glass read as liquid. That needs a shader that reads the backdrop.
Android can do that on the GPU:

```
your screen's content
        │
        ▼
 LensTargetView ──── records everything it draws into a RenderNode ("the recording")
        │            and draws that recording on screen as normal
        │
        └──────────► LensView (inside your bar, OUTSIDE the target)
                       re-draws the recording, shifted so the part under the bar lines up,
                       through a RenderEffect chain:   blur  ──►  AGSL lens shader
                                                                      │
                                                                      ▼
                                                        bent capsule of the screen, on screen
```

Four ideas carry it:

1. **Record the backdrop as a display list, not a bitmap.** `LensTargetView.dispatchDraw` records its
   children into a `RenderNode`. The recording holds _references_ to the children's own display lists,
   so when a child redraws (a list scrolls), the recording shows the new content without being
   re-recorded. This is the same technique expo-blur's Android target uses (Dimezis BlurView 3).
2. **Draw it a second time, through an effect.** `LensView` draws that node into its own `RenderNode`
   and sets a `RenderEffect` on it: `createChainEffect(shader, blur)`, which runs the blur first.
   Nothing touches the CPU.
3. **Re-record before every frame, without invalidating.** An `OnPreDrawListener` re-records the
   lens node (one `drawRenderNode` call) and updates its position. Re-recording a node that another
   display list already references is picked up in the same frame. Calling `invalidate()` from
   pre-draw would schedule another frame forever.
4. **The shader models a thick, clear capsule.** It works from a signed distance field of the
   rounded rectangle:
   - **Swell:** it magnifies around the capsule's _spine_, its centre line. A long bar magnifies
     across its short axis like a glass rod, and content under it still lines up with the content
     beside it.
   - **Bend:** within `bevel` of the rim, each pixel samples along the surface normal by an amount
     that follows a quarter-circle profile, steepest at the edge.
     - **Negative `bend`** samples inward. What is under the glass is stretched out to the rim and
       sweeps around the end caps. This is the liquid look.
     - **Positive `bend`** squeezes what lies _past_ the glass into the rim. It only ever reads as a
       thin band.
   - **Dispersion:** red and blue sample slightly less and slightly more than green, which gives a
     faint colour fringe.
   - **Safety:** samples are clamped to where the recording has content, and the outline is
     anti-aliased over one pixel.

---

## 2. Files

Copy this folder into the root of the other project. Expo autolinks everything in `modules/` that has
an `expo-module.config.json`; no `package.json` is needed.

```
modules/liquid-glass/
├── expo-module.config.json
├── index.ts                                  JS bindings + availability flags
└── android/
    ├── build.gradle
    └── src/main/java/expo/modules/liquidglass/
        ├── LiquidGlassModule.kt              the two views and their props
        ├── LensTargetView.kt                 records the screen
        ├── LensView.kt                       draws it through the effect chain
        └── LensShader.kt                     the AGSL lens
```

Add this to `.gitignore`, because Gradle writes build output inside the module:

```gitignore
modules/*/android/build/
modules/*/android/.cxx/
```

### `expo-module.config.json`

```json
{
  "platforms": ["android"],
  "android": {
    "modules": ["expo.modules.liquidglass.LiquidGlassModule"]
  }
}
```

### `android/build.gradle`

```gradle
plugins {
  id 'com.android.library'
  id 'expo-module-gradle-plugin'
}

group = 'expo.modules.liquidglass'
version = '1.0.0'

android {
  namespace "expo.modules.liquidglass"
  defaultConfig {
    versionCode 1
    versionName "1.0.0"
  }
}
```

### `LiquidGlassModule.kt`

```kotlin
package expo.modules.liquidglass

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Real refraction for glass surfaces (Android 13+).
 *
 * Two views, used as a pair:
 *   - LensTargetView wraps a screen and records what it draws;
 *   - LensView, inside the glass, draws that recording back through a lens
 *     shader, so the content under the glass bends at its rim and swells
 *     in its middle.
 *
 * Lengths arrive in dp, as React Native sends them.
 */
class LiquidGlassModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("LiquidGlass")

    View(LensView::class) {
      Name("LensView")

      Prop("targetId") { view: LensView, targetId: Int? ->
        view.setTargetId(targetId)
      }

      Prop("cornerRadius") { view: LensView, value: Float ->
        view.cornerRadius = value
      }

      Prop("blur") { view: LensView, value: Float ->
        view.blur = value
      }

      Prop("bevel") { view: LensView, value: Float ->
        view.bevel = value
      }

      Prop("bend") { view: LensView, value: Float ->
        view.bend = value
      }

      Prop("zoom") { view: LensView, value: Float ->
        view.zoom = value
      }

      Prop("dispersion") { view: LensView, value: Float ->
        view.dispersion = value
      }

      OnViewDidUpdateProps { view: LensView ->
        view.propsChanged()
      }
    }

    View(LensTargetView::class) {
      Name("LensTargetView")
    }
  }
}
```

### `LensTargetView.kt`

```kotlin
package expo.modules.liquidglass

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Canvas
import android.graphics.RenderNode
import android.os.Build
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.views.ExpoView

/**
 * Wraps a screen so a LensView can draw it a second time.
 *
 * Everything the screen draws is recorded into [node], which is then drawn
 * here as usual. The recording holds references to the children's own display
 * lists rather than copies, so a child that redraws (a list scrolling) shows up
 * in both places without this view recording again.
 *
 * The same technique expo-blur's target uses (Dimezis BlurView 3), which is
 * what lets it blur the content on the GPU.
 */
@SuppressLint("ViewConstructor")
class LensTargetView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  /** Only on Android 13+, the only place a LensView can use it. */
  internal val node: RenderNode? = if (Build.VERSION.SDK_INT >= 33) RenderNode("LiquidGlassTarget") else null

  override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
    setMeasuredDimension(MeasureSpec.getSize(widthMeasureSpec), MeasureSpec.getSize(heightMeasureSpec))
  }

  override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
    // No-op: React Native lays the children out. A LinearLayout pass here
    // would stack them in a row over the frames Yoga gave them.
  }

  override fun dispatchDraw(canvas: Canvas) {
    val node = node
    // A software canvas (a screenshot of the view, say) cannot record.
    if (node == null || !canvas.isHardwareAccelerated) {
      super.dispatchDraw(canvas)
      return
    }
    node.setPosition(0, 0, width, height)
    val recording = node.beginRecording()
    try {
      super.dispatchDraw(recording)
    } finally {
      node.endRecording()
    }
    canvas.drawRenderNode(node)
  }
}
```

### `LensView.kt`

```kotlin
package expo.modules.liquidglass

import android.annotation.SuppressLint
import android.annotation.TargetApi
import android.content.Context
import android.graphics.Canvas
import android.graphics.RenderEffect
import android.graphics.RenderNode
import android.graphics.RuntimeShader
import android.graphics.Shader
import android.os.Build
import android.util.Log
import android.view.ViewTreeObserver
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.views.ExpoView
import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.max
import kotlin.math.min

private const val TAG = "LiquidGlass"

/**
 * The glass itself: draws its LensTargetView's recording, from under this
 * view, through the lens shader (LensShader.kt).
 *
 * Nothing is copied to the CPU. The recording is a display list that
 * references the screen's own, so what the lens shows is re-rendered by the
 * GPU with the screen: a blur, then the shader. The recording is re-made
 * before every frame (a pre-draw listener, as expo-blur does); that costs one
 * draw call, not a redraw of the screen.
 *
 * Android 13+ only (RuntimeShader). JS never mounts it below that; if it were,
 * it would draw nothing and the glass would simply be clear.
 */
@SuppressLint("ViewConstructor")
class LensView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  // Props, in dp as React Native sends them (see LiquidGlassModule).
  internal var cornerRadius = 0f
  internal var blur = 0f
  internal var bevel = 0f
  internal var bend = 0f
  internal var zoom = 1f
  internal var dispersion = 0f

  private var targetId: Int? = null
  private var target: LensTargetView? = null

  private val density = resources.displayMetrics.density
  private val lens: Lens? = if (Build.VERSION.SDK_INT >= 33) Lens() else null
  private val location = IntArray(2)
  private val targetLocation = IntArray(2)

  private val onPreDraw = ViewTreeObserver.OnPreDrawListener {
    if (Build.VERSION.SDK_INT >= 33) lens?.record()
    true
  }

  fun setTargetId(id: Int?) {
    if (id == targetId) return
    targetId = id
    target = null
    invalidate()
  }

  fun propsChanged() {
    invalidate()
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    viewTreeObserver.addOnPreDrawListener(onPreDraw)
  }

  override fun onDetachedFromWindow() {
    viewTreeObserver.removeOnPreDrawListener(onPreDraw)
    if (Build.VERSION.SDK_INT >= 33) lens?.release()
    super.onDetachedFromWindow()
  }

  override fun dispatchDraw(canvas: Canvas) {
    if (Build.VERSION.SDK_INT >= 33) lens?.draw(canvas)
    super.dispatchDraw(canvas)
  }

  /** The target, found by its React tag the first time it is needed. */
  private fun resolveTarget(): LensTargetView? {
    val id = targetId ?: return null
    if (target == null) target = appContext.findView<LensTargetView>(id)
    return target
  }

  @TargetApi(33)
  private inner class Lens {
    private val node = RenderNode("LiquidGlassLens")

    // Null if the shader fails to compile: the glass then only blurs, and
    // the reason is in logcat under "LiquidGlass".
    private var shader: RuntimeShader? = try {
      RuntimeShader(LENS_SHADER)
    } catch (e: RuntimeException) {
      Log.e(TAG, "The lens shader did not compile; the glass will only blur.", e)
      null
    }

    /** The values the current effect was built from, so it is only rebuilt when one changes. */
    private var built: FloatArray? = null

    /** Re-record what is under the glass. Returns false when there is nothing to show. */
    fun record(): Boolean {
      val t = resolveTarget()
      val content = t?.node
      if (t == null || content == null || !t.isAttachedToWindow || !content.hasDisplayList() || width == 0 || height == 0) {
        if (node.hasDisplayList()) node.discardDisplayList()
        return false
      }

      // Room past the glass for the rim to sample into and for the blur to spread.
      val margin = ceil((abs(bend) * (1f + dispersion) + blur * 3f + 2f) * density).toInt()

      // The layer's top-left, in the target's coordinates.
      getLocationInWindow(location)
      t.getLocationInWindow(targetLocation)
      val left = (location[0] - targetLocation[0] - margin).toFloat()
      val top = (location[1] - targetLocation[1] - margin).toFloat()

      node.setPosition(-margin, -margin, width + margin, height + margin)
      val canvas = node.beginRecording()
      try {
        canvas.translate(-left, -top)
        canvas.drawRenderNode(content)
      } finally {
        node.endRecording()
      }

      // Where the recording has content, in the layer: the lens must not
      // sample past the screen's edge, where there is nothing.
      val layerWidth = (width + margin * 2).toFloat()
      val layerHeight = (height + margin * 2).toFloat()
      val bounds = floatArrayOf(
        max(0f, -left) + 0.5f,
        max(0f, -top) + 0.5f,
        min(layerWidth, t.width - left) - 0.5f,
        min(layerHeight, t.height - top) - 0.5f,
      )
      applyEffect(margin.toFloat(), bounds)
      return true
    }

    private fun applyEffect(margin: Float, bounds: FloatArray) {
      val values = floatArrayOf(
        width.toFloat(), height.toFloat(), margin,
        bounds[0], bounds[1], bounds[2], bounds[3],
        cornerRadius, blur, bevel, bend, zoom, dispersion,
      )
      if (values.contentEquals(built)) return
      built = values

      val px = density
      // A blur of 0 crashes RenderEffect ("nativePtr is null"), so none at all below half a pixel.
      val blurPx = blur * px
      val blurEffect = if (blurPx >= 0.5f) RenderEffect.createBlurEffect(blurPx, blurPx, Shader.TileMode.CLAMP) else null

      val shaderEffect = lensEffect(margin, bounds)
      val effect = if (shaderEffect == null) {
        blurEffect
      } else if (blurEffect == null) {
        shaderEffect
      } else {
        // Chain: the inner effect (the blur) runs first.
        RenderEffect.createChainEffect(shaderEffect, blurEffect)
      }
      node.setRenderEffect(effect)
    }

    /** The shader with this frame's values; null (the glass only blurs) if it cannot be used. */
    private fun lensEffect(margin: Float, bounds: FloatArray): RenderEffect? {
      val s = shader ?: return null
      val px = density
      return try {
        s.setFloatUniform("size", width.toFloat(), height.toFloat())
        s.setFloatUniform("origin", margin, margin)
        s.setFloatUniform("radius", cornerRadius * px)
        s.setFloatUniform("bevel", bevel * px)
        s.setFloatUniform("bend", bend * px)
        s.setFloatUniform("zoom", max(zoom, 0.1f))
        s.setFloatUniform("dispersion", dispersion)
        s.setFloatUniform("bounds", bounds[0], bounds[1], bounds[2], bounds[3])
        // A RenderEffect copies the uniforms when it is made, so a new one per change.
        RenderEffect.createRuntimeShaderEffect(s, "content")
      } catch (e: RuntimeException) {
        // A uniform the compiler dropped, say. Never worth crashing the app over.
        Log.e(TAG, "The lens shader could not be set up; the glass will only blur.", e)
        shader = null
        null
      }
    }

    fun draw(canvas: Canvas) {
      if (!canvas.isHardwareAccelerated) return
      if (!node.hasDisplayList() && !record()) return
      canvas.drawRenderNode(node)
    }

    fun release() {
      node.discardDisplayList()
      built = null
      target = null
    }
  }
}
```

### `LensShader.kt`

```kotlin
package expo.modules.liquidglass

/**
 * The lens, in AGSL (Android 13+). It runs once per pixel of the glass, on the
 * GPU, over the (lightly blurred) recording of the screen behind it.
 *
 * Coordinates are px in the lens layer: the glass plus a margin on every
 * side, so the rim can show what lies just past it.
 *
 *   - Swell. Across the short axis the glass is thickest along its spine, so
 *     it magnifies there, as a glass rod does. Along the length it does not,
 *     so content under a long bar still lines up with the content beside it.
 *
 *   - Bend. Within `bevel` of the rim the surface curves away, steepest at
 *     the very edge (a quarter-circle profile). There each pixel samples up
 *     to `bend` px along the outward normal. Negative samples inward,
 *     spreading what is under the glass out around its rim (the liquid look);
 *     positive squeezes what is just past the glass into the rim. Blue bends
 *     a little more than red (dispersion), a faint colour fringe.
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
```

### `index.ts`

```ts
import { requireNativeView, requireOptionalNativeModule } from 'expo';
import type { ComponentType, Ref } from 'react';
import { Platform, type View, type ViewProps } from 'react-native';

/**
 * JS bindings for the local LiquidGlass module.
 *
 * An APK built before this module existed has no native side, so there
 * everything here is null or false and the app falls back to whatever it
 * drew before. The next native build switches the lens on, no code change.
 */
const BUILT = requireOptionalNativeModule('LiquidGlass') != null;

/** The lens is a RuntimeShader, which arrived in Android 13 (API 33). */
const OS_SUPPORTS = Platform.OS === 'android' && typeof Platform.Version === 'number' && Platform.Version >= 33;

/** Real refraction works on this phone, in this build. */
export const LENS_AVAILABLE = BUILT && OS_SUPPORTS;

/** The build has the lens but the phone is too old for it (worth telling the user). */
export const LENS_NEEDS_NEWER_ANDROID = BUILT && !OS_SUPPORTS;

/** How the lens bends what is behind it. Lengths in dp. */
export interface LensOptics {
  /** A light blur, before the bend. 0 = sharp. */
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
```

---

## 3. Using it

### The three rules

1. **The lens must be OUTSIDE the target.** A `LensView` inside its own `LensTargetView` would record
   itself. Put the target around the screen content and the glass (bar, pill) beside it, as a sibling
   or in a parent.
2. **Paint the page background as a child INSIDE the target**, not as the target's `backgroundColor`.
   The target records only its children (`dispatchDraw`), not its own background. Where there is no
   content, the lens would show the dark window behind the app.
3. **Give the lens the target's React tag** (`findNodeHandle`) _after_ the target has mounted, for
   example in an effect.

### One screen, one bar

```tsx
import { useEffect, useRef, useState } from 'react';
import { findNodeHandle, ScrollView, StyleSheet, View } from 'react-native';
import { LENS_AVAILABLE, LensTargetView, LensView } from './modules/liquid-glass';

const BAR_HEIGHT = 70;

export function HomeScreen() {
  const targetRef = useRef<View>(null);
  const [targetId, setTargetId] = useState<number | null>(null);

  // The tag exists once the target has mounted.
  useEffect(() => {
    setTargetId(targetRef.current ? findNodeHandle(targetRef.current) : null);
  }, []);

  const content = (
    <>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: '#0E0F13' }]} />
      <ScrollView>{/* … the page … */}</ScrollView>
    </>
  );

  return (
    <View style={styles.fill}>
      {LensTargetView ? (
        <LensTargetView ref={targetRef} style={styles.fill}>
          {content}
        </LensTargetView>
      ) : (
        <View style={styles.fill}>{content}</View>
      )}

      {/* The glass: a sibling of the target, never inside it. */}
      <View pointerEvents="box-none" style={styles.bar}>
        {LensView ? (
          <LensView
            pointerEvents="none"
            style={StyleSheet.absoluteFill}
            targetId={targetId}
            cornerRadius={BAR_HEIGHT / 2}
            blur={1}
            bevel={30}
            bend={-16}
            zoom={1.12}
            dispersion={0.05}
          />
        ) : (
          /* Fallback: expo-blur, a translucent fill, anything. */
          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(30,30,36,0.85)' }]} />
        )}
        {/* Icons and labels go here, on top of the lens. */}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  bar: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 24,
    height: BAR_HEIGHT,
    borderRadius: BAR_HEIGHT / 2,
    overflow: 'hidden', // the shader anti-aliases the outline too; this clips anything else
  },
});
```

### Several screens under one bar (tabs)

Each tab screen wraps its content in a `LensTargetView` and, **when it gains focus**, publishes its ref
to a small store. The bar reads the focused one and turns it into a tag. SpendWise does exactly this.
Its implementation is in `components/layout/glass.tsx`: `BlurTarget` and `GlassLens`.

```tsx
// store
const useLensTarget = create<{ ref: RefObject<View | null> | null; set: (r: RefObject<View | null>) => void }>(
  (set) => ({ ref: null, set: (ref) => set({ ref }) }),
);

// in each screen
const ref = useRef<View | null>(null);
const publish = useLensTarget((s) => s.set);
useFocusEffect(useCallback(() => publish(ref), [publish]));
// … <LensTargetView ref={ref} style={{ flex: 1 }}>…</LensTargetView>

// in the bar
const ref = useLensTarget((s) => s.ref);
const targetId = useMemo(() => (ref?.current ? findNodeHandle(ref.current) : null), [ref]);
```

### Glass on glass

A second `LensView` with the **same** `targetId` works anywhere else, for example inside the selected
tab's bubble, which then magnifies more than the bar under it. It samples the screen, not the other
lens, so it stacks cleanly. SpendWise's bubble uses `zoom: 1.25`, `bevel: 22` and `bend: -10`.

### Alongside expo-blur

You can nest a `LensTargetView` _inside_ expo-blur's `BlurTargetView` and use whichever effect the
user picked. Nest them **always**, whatever the setting: switching between the two then never remounts
the screen under it.

---

## 4. Build

The module is native code, so the app needs one rebuild before `LensView` exists. After that, changing
**props** (the numbers) only needs a reload. Changing the **Kotlin or the shader** needs another
rebuild.

```bash
npx expo prebuild --platform android      # regenerates android/, picks up modules/
npx expo run:android --device              # or: cd android && ./gradlew installDebug
```

**Is it running?** Log `LENS_AVAILABLE` from JS. If it is `false` on an Android 13+ phone, the
installed APK was built before the module was added.

---

## 5. Tuning

All values are in dp, passed as props, and change with a reload.

| Prop           | What it does                                                                   | Range                     |
| -------------- | ------------------------------------------------------------------------------ | ------------------------- |
| `blur`         | Softness of what is behind. `0` is sharp; below about 0.2 dp it counts as none | 0 – 3                     |
| `bevel`        | How far in from the rim the spreading starts                                   | up to half the height     |
| `bend`         | Strength of the spread. **Negative** spreads the inside out to the rim         | −4 to −22                 |
| `zoom`         | Magnification across the short axis. `1` is none                               | 1.0 – 1.3                 |
| `dispersion`   | Colour fringe at the rim                                                       | 0 – 0.15                  |
| `cornerRadius` | The capsule's corner radius. Match the view's `borderRadius`                   | half the height = capsule |

**Values that look right** on a 70 dp bar (half-height 35):

```ts
const BAR = { blur: 1, bevel: 30, bend: -16, zoom: 1.12, dispersion: 0.04 /* dark theme: 0.06 */ };
const BUBBLE = { blur: 0.75, bevel: 22, bend: -10, zoom: 1.25, dispersion: 0.04 }; // 58 dp tall
```

**The mirrored strip.** With a negative `bend`, the quarter-circle curve is so steep at the very edge
that the image folds back on itself there. The result is a thin mirrored band, which thick glass
really shows. Its width is:

```
k    = bevel / (|bend| × zoom)
fold = bevel × (1 − k / √(1 + k²))
```

For the bar above that is about 4 dp. A stronger `bend` or a smaller `bevel` widens it; if it starts
to look like an echo rather than glass, ease `bend` back.

---

## 6. Things that went wrong on the way

Each of these cost a build or a bad-looking iteration:

- **The bend pointed the wrong way.** A positive `bend` (sample outward) squeezes what lies past the
  glass into the rim. However strong it is made, it stays a thin band at the edge. The reference look
  is the opposite: negative, the inside spread out around the rim.
- **Drawn rim light hid the refraction.** Stacked SVG rings (a wide inner glow, several Fresnel rings)
  sat exactly over the band where the bend happens, and on the end caps they read as a double
  outline. Drop the wide glow band once the lens is real.
- **Removing _all_ drawn light went too far.** Without a thin crisp rim line, the glass loses its edge
  against a dark page. Keep one Fresnel line and the two directional highlights (top-left and
  bottom-right).
- **Too much blur kills it.** At 2 dp the bent content turned to mush. About 1 dp is enough to soften
  text passing under labels.
- **Large dispersion becomes hard colour lines,** not a fringe: 0.12–0.25 at a big bend split edges
  into 1 px green and orange lines. Keep it about 0.04–0.06.
- **Label legibility.** The lens magnifies whatever text passes under the labels. A strong halo helps,
  for example `textShadowColor: background @ 0.9, textShadowRadius: 8`.
- **`onLayout` in the target must be a no-op.** `ExpoView` is a `LinearLayout`, and letting it lay out
  would restack React Native's children.
- **`RenderEffect` copies uniforms when it is created.** Changing a uniform afterwards does nothing, so
  make a new effect, but only when a value changed (the `built` cache), not every frame.
- **`createBlurEffect(0, …)` crashes** ("nativePtr is null"). Skip the blur below half a pixel.
- **Sample only where there is content.** Without the `bounds` clamp, the rim reads past the screen's
  edge and shows transparent or black.
- **`drawRenderNode` needs a hardware canvas.** A software draw (a view screenshot) must fall back to
  a normal draw.
- **`androidx.annotation` may not be on a local module's classpath.** Use
  `android.annotation.TargetApi`.
- **Kotlin:** don't name a local variable after a function that is called in its own initializer
  (`val lensEffect = lensEffect(…)`).
- **Guard with `requireOptionalNativeModule`.** An APK built before the module then just gets `null`
  components instead of crashing.

---

## 7. Troubleshooting

| Symptom                                  | Cause and fix                                                                                                       |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `LENS_AVAILABLE` is false on Android 13+ | The installed APK predates the module: prebuild and rebuild                                                         |
| The glass is clear and shows nothing     | `targetId` is null (the ref was read before mount), or the lens is inside its own target                            |
| The glass blurs but does not bend        | The shader failed. `adb logcat -s LiquidGlass` prints the reason                                                    |
| Dark or grey patches at the edges        | The page background is a style on the target rather than a child inside it (rule 2)                                 |
| Content under the glass is offset        | The glass has a transform that changes after layout; the lens follows `getLocationInWindow`, so check what moves it |
| Frames drop while scrolling              | Profile with the Perf Monitor; reduce `blur` first, then the glass's size                                           |

---

## 8. Where to take it next

- **Shader source from JS.** Pass the AGSL string and a uniforms map as props, so the shader itself
  can be edited with a reload instead of a rebuild.
- **Lighting in the shader.** Compute the rim highlight per pixel from the same normal (brightest where
  it faces the light), replacing the drawn SVG rim entirely.
- **Vibrancy.** A slight saturation and brightness boost inside the glass. Colours behind real glass
  look a little more vivid, and it separates a dark bar from a dark page.
- **iOS.** This module is Android-only. On iOS 26+, `expo-glass-effect` (`GlassView`) gives the system's
  own Liquid Glass.
