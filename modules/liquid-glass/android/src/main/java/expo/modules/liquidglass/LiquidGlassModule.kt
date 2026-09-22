package expo.modules.liquidglass

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Real refraction for the liquid glass tab bar (Android 13+).
 *
 * Two views, used as a pair:
 *   - LensTargetView wraps a tab screen and records what it draws;
 *   - LensView, inside the bar, draws that recording back through a lens
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
