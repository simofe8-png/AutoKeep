"""AutoKeep icon set from the supplied artwork (1254x1254 RGBA, rounded square + outer glow).

Google Play store icon: 512x512, 32-bit PNG, full square (Play applies its own mask and shadow),
no transparency, <= 1 MB. Android adaptive icon: 108dp layers (1024 px), key content inside the
66dp safe circle. The transparent corners / glow are replaced by a seamless extension of the
artwork's own edge colours (no new artwork is invented).
"""
import os
import sys

import cv2
import numpy as np
from PIL import Image

SRC = sys.argv[1]
OUT = sys.argv[2]
os.makedirs(OUT, exist_ok=True)

src = np.asarray(Image.open(SRC).convert('RGBA')).astype(np.float32) / 255.0
h, w = src.shape[:2]
alpha = src[..., 3]
solid = (alpha > 0.95).astype(np.float32)  # the rounded square itself (no halo)
rgb = src[..., :3]


def extend(rgb, mask, radii=(8, 16, 32, 64, 128, 256)):
    """Fill mask==0 with a smooth extension of the colours where mask==1 (push-pull)."""
    out = rgb * mask[..., None]
    cov = mask.copy()
    filled = out.copy()
    have = cov.copy()
    for r in radii:
        k = int(r * 3) | 1
        num = cv2.GaussianBlur(out, (k, k), r)
        den = cv2.GaussianBlur(cov, (k, k), r)
        col = num / np.maximum(den, 1e-6)[..., None]
        need = (have < 0.999) & (den > 1e-4)
        filled[need] = col[need]
        have = np.maximum(have, (den > 1e-4).astype(np.float32))
    return rgb * mask[..., None] + filled * (1 - mask[..., None])


def place(scale, size, center_src):
    """Artwork scaled by `scale` onto a size x size canvas, centred on `center_src`."""
    sw, sh = int(round(w * scale)), int(round(h * scale))
    r = cv2.resize(rgb, (sw, sh), interpolation=cv2.INTER_AREA)
    m = cv2.resize(solid, (sw, sh), interpolation=cv2.INTER_AREA)
    canvas = np.zeros((size, size, 3), np.float32)
    cmask = np.zeros((size, size), np.float32)
    ox = int(round(size / 2 - center_src[0] * scale))
    oy = int(round(size / 2 - center_src[1] * scale))
    x0, y0 = max(ox, 0), max(oy, 0)
    x1, y1 = min(ox + sw, size), min(oy + sh, size)
    canvas[y0:y1, x0:x1] = r[y0 - oy:y1 - oy, x0 - ox:x1 - ox]
    cmask[y0:y1, x0:x1] = m[y0 - oy:y1 - oy, x0 - ox:x1 - ox]
    # Slightly erode the edge so the anti-aliased rim does not leave a dark seam.
    cmask = cv2.erode((cmask > 0.98).astype(np.float32), np.ones((5, 5), np.uint8))
    cmask = cv2.GaussianBlur(cmask, (7, 7), 2)
    return extend(canvas, cmask)


def save(arr, path, rgba=None):
    a = (np.clip(arr, 0, 1) * 255 + 0.5).astype(np.uint8)
    if rgba is not None:
        a = np.dstack([a, (np.clip(rgba, 0, 1) * 255 + 0.5).astype(np.uint8)])
        Image.fromarray(a, 'RGBA').save(path, optimize=True)
    else:
        Image.fromarray(a, 'RGB').save(path, optimize=True)


# Centre of the rounded square in the source.
ys, xs = np.nonzero(solid > 0.5)
cx, cy = (xs.min() + xs.max()) / 2, (ys.min() + ys.max()) / 2

# 1) Full-bleed square: the rounded square fills the canvas edge to edge (Play Store + legacy icon).
full_scale = 1024 / (xs.max() - xs.min() + 1)
full = place(full_scale, 1024, (cx, cy))
save(full, os.path.join(OUT, 'icon-1024.png'))
store = cv2.resize(full, (512, 512), interpolation=cv2.INTER_AREA)
save(store, os.path.join(OUT, 'play-store-icon-512.png'))

# 2) Adaptive icon (108dp = 1024 px): the logo inside the 66dp safe circle.
#    Logo extent measured on the source: farthest points are the A's feet (~682 px from centre).
safe_scale = (0.3056 * 1024) / 700
def radial_background(size, inner, outer):
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32)
    d = np.sqrt((xx - size / 2) ** 2 + (yy - size / 2) ** 2) / (size / 2)
    t = np.clip(d, 0, 1)[..., None] ** 1.4
    return np.array(inner, np.float32) / 255 * (1 - t) + np.array(outer, np.float32) / 255 * t


def adaptive(scale, size):
    # The artwork where it exists; outside its rounded square a smooth gradient in the
    # artwork's own blues (no smeared rim lines).
    art = place(scale, size, (cx, cy))
    sw, sh = int(round(w * scale)), int(round(h * scale))
    m = cv2.resize(solid, (sw, sh), interpolation=cv2.INTER_AREA)
    mask = np.zeros((size, size), np.float32)
    ox = int(round(size / 2 - cx * scale))
    oy = int(round(size / 2 - cy * scale))
    mask[oy:oy + sh, ox:ox + sw] = m[: size - oy, : size - ox]
    mask = cv2.GaussianBlur(cv2.erode((mask > 0.98).astype(np.float32), np.ones((9, 9), np.uint8)), (0, 0), 6)
    bg = radial_background(size, (0, 62, 160), (0, 40, 110))
    return art * mask[..., None] + bg * (1 - mask[..., None])


adaptive_bg = adaptive(safe_scale, 1024)
save(adaptive_bg, os.path.join(OUT, 'android-icon-background.png'))
save(np.zeros((1024, 1024, 3), np.float32), os.path.join(OUT, 'android-icon-foreground.png'),
     rgba=np.zeros((1024, 1024), np.float32))

# 3) Monochrome (themed icons): the bright logo strokes (white/cyan A and check) as a silhouette.
g = rgb[..., 1]
bright = ((g > 0.62) & (solid > 0.5)).astype(np.float32)
bright = cv2.morphologyEx(bright, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
sw, sh = int(round(w * safe_scale)), int(round(h * safe_scale))
bm = cv2.resize(bright, (sw, sh), interpolation=cv2.INTER_AREA)
mono = np.zeros((1024, 1024), np.float32)
ox = int(round(512 - cx * safe_scale))
oy = int(round(512 - cy * safe_scale))
mono[oy:oy + sh, ox:ox + sw] = bm[: 1024 - oy, : 1024 - ox]
save(np.ones((1024, 1024, 3), np.float32), os.path.join(OUT, 'android-icon-monochrome.png'),
     rgba=mono)

# Previews: Play mask (rounded square ~ 20% radius) and a circular launcher mask.
def preview_mask(img, kind, size):
    im = cv2.resize(img, (size, size), interpolation=cv2.INTER_AREA)
    m = np.zeros((size, size), np.uint8)
    if kind == 'circle':
        # launcher shows the central 72dp of 108dp
        cv2.circle(m, (size // 2, size // 2), int(size * 36 / 108), 255, -1)
    else:
        r = int(size * 0.2)
        cv2.rectangle(m, (r, 0), (size - r, size), 255, -1)
        cv2.rectangle(m, (0, r), (size, size - r), 255, -1)
        for x, y in [(r, r), (size - r, r), (r, size - r), (size - r, size - r)]:
            cv2.circle(m, (x, y), r, 255, -1)
    return np.dstack([im, m.astype(np.float32) / 255])

p1 = preview_mask(store, 'rounded', 512)
save(p1[..., :3], os.path.join(OUT, 'preview-play.png'), rgba=p1[..., 3])
p2 = preview_mask(adaptive_bg, 'circle', 512)
mono_prev = np.dstack([mono] * 3) * 0.95 + (1 - np.dstack([mono] * 3)) * np.array([0.1, 0.12, 0.16])
save(cv2.resize(mono_prev, (512, 512)), os.path.join(OUT, 'preview-monochrome.png'))
save(p2[..., :3], os.path.join(OUT, 'preview-launcher-circle.png'), rgba=p2[..., 3])
print('done', full_scale, safe_scale)
