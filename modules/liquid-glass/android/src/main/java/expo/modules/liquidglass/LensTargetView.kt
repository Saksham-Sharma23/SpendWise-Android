package expo.modules.liquidglass

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Canvas
import android.graphics.RenderNode
import android.os.Build
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.views.ExpoView

/**
 * Wraps a tab screen so a LensView can draw it a second time.
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
