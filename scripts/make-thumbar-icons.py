#!/usr/bin/env python3
"""Generate the Windows taskbar thumbnail-toolbar icons for Resona.

Draws prev / play / pause / next glyphs in white on transparent, 4x
supersampled then downscaled for crisp edges, and prints base64 PNGs
ready to embed in desktop/main.js.
"""
import base64
import io
from PIL import Image, ImageDraw

S = 20          # final size
SS = S * 4      # supersample size
PAD = 3 * 4     # padding at supersampled scale
WHITE = (255, 255, 255, 255)


def canvas():
    img = Image.new("RGBA", (SS, SS), (0, 0, 0, 0))
    return img, ImageDraw.Draw(img)


def finish(img):
    return img.resize((S, S), Image.LANCZOS)


def prev_icon():
    img, d = canvas()
    # left bar
    d.rectangle([PAD, PAD, PAD + 3 * 4, SS - PAD], fill=WHITE)
    # left-pointing triangle
    ax, ay = SS - PAD, PAD            # top right
    bx, by = PAD + 6 * 4, SS // 2     # apex left-middle
    cx, cy = SS - PAD, SS - PAD       # bottom right
    d.polygon([(ax, ay), (bx, by), (cx, cy)], fill=WHITE)
    return finish(img)


def next_icon():
    img, d = canvas()
    d.rectangle([SS - PAD - 3 * 4, PAD, SS - PAD, SS - PAD], fill=WHITE)
    ax, ay = PAD, PAD                 # top left
    bx, by = SS - PAD - 6 * 4, SS // 2
    cx, cy = PAD, SS - PAD            # bottom left
    d.polygon([(ax, ay), (bx, by), (cx, cy)], fill=WHITE)
    return finish(img)


def play_icon():
    img, d = canvas()
    # inset vertically: a triangle needs less height than bars to look equal
    inset = 2 * 4
    d.polygon([(PAD, PAD + inset), (SS - PAD, SS // 2), (PAD, SS - PAD - inset)], fill=WHITE)
    return finish(img)


def pause_icon():
    img, d = canvas()
    w = 3 * 4
    gap = 2 * 4
    inset = 2 * 4
    x1 = (SS - (w * 2 + gap)) // 2
    d.rectangle([x1, PAD + inset, x1 + w, SS - PAD - inset], fill=WHITE)
    d.rectangle([x1 + w + gap, PAD + inset, x1 + w * 2 + gap, SS - PAD - inset], fill=WHITE)
    return finish(img)


def b64(img):
    buf = io.BytesIO()
    img.save(buf, "PNG", optimize=True)
    return base64.b64encode(buf.getvalue()).decode()


if __name__ == "__main__":
    import sys
    out = sys.argv[1] if len(sys.argv) > 1 else "/tmp/thumbar"
    import os
    os.makedirs(out, exist_ok=True)
    for name, img in [("prev", prev_icon()), ("play", play_icon()),
                      ("pause", pause_icon()), ("next", next_icon())]:
        img.save(f"{out}/{name}.png")
        print(f'  {name}: "data:image/png;base64,{b64(img)}"')
