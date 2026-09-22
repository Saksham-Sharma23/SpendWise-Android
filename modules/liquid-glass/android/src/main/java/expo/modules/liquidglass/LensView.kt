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
 * it would draw nothing and the bar would simply be clear.
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
