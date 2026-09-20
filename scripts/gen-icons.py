"""Generate the five app assets from the logo sheet's main tile.

The sheet is a presentation image, so the tile is lifted out and cleaned:
  - the rounded corners are baked against a near-white sheet, so those
    wedges become transparent (Android applies its own mask; a pre-rounded
    tile double-rounds and shows pale crescents)
  - the drop shadow along the bottom-right is excluded at the crop, because
    it is lighter than the ground and shows as a pale rim otherwise
  - the adaptive foreground is inset so a circular launcher mask cannot clip
    the leaf tip

Run it after changing logos/spendwise.png:  python scripts/gen-icons.py
Needs Pillow and numpy. The five outputs are the paths app.config.ts names.
"""
import os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "logos", "spendwise.png")
DEST = os.path.join(ROOT, "assets")
PREVIEW = None  # set a directory to also write side-by-side previews

# The tile's TRUE edges, found by scanning for the transition out of teal.
# The bottom is 579, not 597: below that is the sheet's drop shadow, which
# was being cropped in and then showed as a pale rim along the icon's edge.
TILE = (99, 74, 620, 580)
GROUND_TOP = (19, 91, 101)         # #135B65  sampled top-left
GROUND_BOT = (1, 36, 50)           # #012432  sampled bottom-right


def tile_rgb():
    return Image.open(SRC).convert("RGB").crop(TILE)


def corner_mask(size, radius_frac=0.225, inset_frac=0.010):
    """The tile's own rounded-rect silhouette, at `size`.

    Inset by a little, because the sheet's white is anti-aliased INTO the
    tile's border pixels: masking exactly on the silhouette keeps those
    blended pixels and they read as a pale halo once the corners go clear.
    """
    m = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(m)
    ins = max(1, int(size * inset_frac))
    r = int(size * radius_frac) - ins
    d.rounded_rectangle([ins, ins, size - 1 - ins, size - 1 - ins],
                        radius=max(1, r), fill=255)
    return m


def clean_tile(size):
    """The tile at `size`, with the sheet background removed from the corners."""
    t = tile_rgb().resize((size, size), Image.LANCZOS)
    out = t.convert("RGBA")
    out.putalpha(corner_mask(size))
    return out


def ground(size):
    """The tile's own diagonal gradient, rebuilt clean (no shadow, no rim)."""
    xs = np.linspace(0, 1, size)
    g = np.zeros((size, size, 3), dtype=np.uint8)
    for y in range(size):
        t = (xs + y / size) / 2
        for c in range(3):
            g[y, :, c] = GROUND_TOP[c] + (GROUND_BOT[c] - GROUND_TOP[c]) * t
    return Image.fromarray(g, "RGB")


def mark_only(size, feather=1):
    """The leaf/chart lifted off its ground, as an RGBA cutout."""
    t = tile_rgb().resize((size, size), Image.LANCZOS)
    a = np.asarray(t).astype(int)
    lum = a.sum(axis=2)
    # The tile's luminance histogram is cleanly bimodal with a trough at
    # 267-344: teal ground below, pale mark above. Cutting in that trough
    # takes the whole mark and none of the ground. A cutoff inside the
    # mark's own range instead clips its shading and drags ground pixels
    # along at partial alpha, which shows as a smudge behind the shape.
    alpha = np.clip((lum - 305) / 60.0, 0, 1)
    # kill anything outside the tile silhouette (sheet corners, shadow)
    sil = np.asarray(corner_mask(size)).astype(float) / 255.0
    alpha = alpha * sil
    am = Image.fromarray((alpha * 255).astype(np.uint8), "L")
    if feather:
        am = am.filter(ImageFilter.GaussianBlur(feather))
    # Keep the tile's OWN pixels, so the mark's pale-cyan gradient survives.
    # Substituting a flat fill here flattened it to near-white and lost the
    # shading that makes it read against the teal background layer.
    out = t.convert("RGBA")
    out.putalpha(am)
    return out


# ---------------------------------------------------------------- icon.png
# FULLY OPAQUE and full-bleed. Two reasons it must not have clear corners:
# Play Store listings reject an icon with transparency, and a legacy launcher
# draws this file as-is, so baked-in corners would double-round against the
# launcher's own mask. Modern launchers use the adaptive pair below instead.
icon_bg = ground(1024)
icon_tile = clean_tile(1024)
icon = icon_bg.convert("RGBA")
icon.alpha_composite(icon_tile)
icon.convert("RGB").save(os.path.join(DEST, "icon.png"))
print("icon.png                     1024  full-bleed, opaque (Play-safe)")

# ------------------------------------------- android-icon-background.png
bg = ground(512)
bg.save(os.path.join(DEST, "android-icon-background.png"))
print("android-icon-background.png   512  rebuilt gradient")

# ------------------------------------------- android-icon-foreground.png
# Adaptive icons: 108 units, only the centre 66 are guaranteed visible.
# The mark is scaled to sit inside that, then centred on the full canvas.
# 78/108: larger than the 66dp guaranteed zone, because that zone is what
# must never be CLIPPED, not what the art must fit inside. The mark is
# centred and roughly circular in extent, so its corners are the only part
# that leaves the guarantee, and a circular mask cuts corners anyway.
SAFE = 512 * (78.0 / 108.0)
fg = Image.new("RGBA", (512, 512), (0, 0, 0, 0))
m = mark_only(512)
mm = m.resize((int(SAFE), int(SAFE)), Image.LANCZOS)
off = (512 - int(SAFE)) // 2
fg.paste(mm, (off, off), mm)
fg.save(os.path.join(DEST, "android-icon-foreground.png"))
print(f"android-icon-foreground.png   512  mark inset to {int(SAFE)}px safe zone")

# ------------------------------------------- android-icon-monochrome.png
mono_src = mark_only(432)
SAFE_M = 432 * (78.0 / 108.0)
mono = Image.new("RGBA", (432, 432), (0, 0, 0, 0))
ms = mono_src.resize((int(SAFE_M), int(SAFE_M)), Image.LANCZOS)
# themed icons are tinted by the system: the shape matters, the colour does not
flat = Image.new("RGB", ms.size, (255, 255, 255)).convert("RGBA")
flat.putalpha(ms.getchannel("A"))
offm = (432 - int(SAFE_M)) // 2
mono.paste(flat, (offm, offm), flat)
mono.save(os.path.join(DEST, "android-icon-monochrome.png"))
print(f"android-icon-monochrome.png   432  silhouette, {int(SAFE_M)}px")

# ---------------------------------------------------------- splash-icon.png
# Transparent, so it sits on the splash background colour from app.config.ts.
splash = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
sm = clean_tile(660)
splash.paste(sm, ((1024 - 660) // 2, (1024 - 660) // 2), sm)
splash.save(os.path.join(DEST, "splash-icon.png"))
print("splash-icon.png              1024  tile centred, transparent margin")

# ------------------------------------------------------------- previews
if PREVIEW:
    os.makedirs(PREVIEW, exist_ok=True)
    for name in ("icon", "android-icon-foreground", "android-icon-background",
                 "android-icon-monochrome", "splash-icon"):
        Image.open(os.path.join(DEST, name + ".png")).save(
            os.path.join(PREVIEW, name + ".png"))
    print("previews written to", PREVIEW)
