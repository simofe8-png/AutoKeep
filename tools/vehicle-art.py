"""Generates AutoKeep's bundled vehicle illustrations (assets/vehicles/*.png).

Self-made, neutral artwork in the style of the approved references (sky, mountains, road,
white vehicle). No photograph, brand, badge or manufacturer design is used; the art stands in
wherever the references show a vehicle photo, until the user adds their own photo.

Run: python tools/vehicle-art.py
"""
import os

from PIL import Image, ImageDraw, ImageFilter

OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'vehicles')
S = 4  # supersampling factor


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(len(a)))


def scene(w, h):
    img = Image.new('RGB', (w, h))
    d = ImageDraw.Draw(img)
    horizon = int(h * 0.62)
    for y in range(horizon):  # sky
        d.line([(0, y), (w, y)], fill=lerp((126, 176, 232), (226, 238, 250), y / horizon))
    # far mountains
    far = [(0, horizon - h * 0.10)]
    for i, (x, y) in enumerate([(0.12, 0.30), (0.25, 0.40), (0.38, 0.28), (0.52, 0.42),
                                (0.66, 0.30), (0.80, 0.38), (0.93, 0.27), (1.0, 0.34)]):
        far.append((w * x, horizon - h * y * 0.55))
    far += [(w, horizon), (0, horizon)]
    d.polygon(far, fill=(158, 184, 212))
    near = [(0, horizon - h * 0.05)]
    for x, y in [(0.08, 0.16), (0.2, 0.08), (0.34, 0.2), (0.5, 0.1), (0.62, 0.18),
                 (0.76, 0.07), (0.9, 0.17), (1.0, 0.1)]:
        near.append((w * x, horizon - h * y * 0.7))
    near += [(w, horizon), (0, horizon)]
    d.polygon(near, fill=(120, 150, 128))
    # verge and road
    d.rectangle([0, horizon, w, h], fill=(150, 160, 150))
    road_top = horizon + int(h * 0.05)
    for y in range(road_top, h):
        d.line([(0, y), (w, y)], fill=lerp((164, 170, 180), (120, 126, 136), (y - road_top) / (h - road_top)))
    return img, road_top


def wheel(d, cx, cy, r):
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(28, 30, 36))
    d.ellipse([cx - r * 0.62, cy - r * 0.62, cx + r * 0.62, cy + r * 0.62], fill=(196, 202, 212))
    d.ellipse([cx - r * 0.5, cy - r * 0.5, cx + r * 0.5, cy + r * 0.5], fill=(150, 158, 170))
    for k in range(5):
        import math
        a = math.radians(k * 72)
        d.line([(cx, cy), (cx + math.cos(a) * r * 0.55, cy + math.sin(a) * r * 0.55)],
               fill=(210, 216, 224), width=max(2, int(r * 0.14)))
    d.ellipse([cx - r * 0.14, cy - r * 0.14, cx + r * 0.14, cy + r * 0.14], fill=(90, 96, 108))


def car(layer, x0, ground, L):
    """White SUV side view, length L, wheels on `ground`."""
    d = ImageDraw.Draw(layer)
    H = L * 0.36
    r = L * 0.105
    body_bottom = ground - r * 0.55
    body_top = body_bottom - H * 0.52
    roof = body_bottom - H
    body = [
        (x0 + L * 0.02, body_bottom), (x0, body_top + H * 0.14), (x0 + L * 0.03, body_top),
        (x0 + L * 0.2, body_top - H * 0.04), (x0 + L * 0.3, roof + H * 0.06),
        (x0 + L * 0.36, roof), (x0 + L * 0.8, roof), (x0 + L * 0.9, body_top - H * 0.02),
        (x0 + L * 0.99, body_top + H * 0.06), (x0 + L, body_top + H * 0.3), (x0 + L * 0.99, body_bottom),
    ]
    d.polygon(body, fill=(246, 248, 251), outline=(170, 178, 190))
    # lower cladding
    d.polygon([(x0 + L * 0.02, body_bottom), (x0 + L * 0.01, body_bottom - H * 0.16),
               (x0 + L, body_bottom - H * 0.16), (x0 + L * 0.99, body_bottom)], fill=(60, 64, 72))
    # windows
    win = [(x0 + L * 0.31, body_top - H * 0.02), (x0 + L * 0.375, roof + H * 0.08),
           (x0 + L * 0.79, roof + H * 0.08), (x0 + L * 0.87, body_top - H * 0.02)]
    d.polygon(win, fill=(38, 48, 64))
    d.line([(x0 + L * 0.585, roof + H * 0.08), (x0 + L * 0.585, body_top - H * 0.02)],
           fill=(246, 248, 251), width=max(3, int(L * 0.012)))
    d.polygon([(x0 + L * 0.4, roof + H * 0.1), (x0 + L * 0.48, roof + H * 0.1),
               (x0 + L * 0.42, body_top - H * 0.04), (x0 + L * 0.34, body_top - H * 0.04)],
              fill=(70, 86, 108))
    # shading line, handles, lights
    d.line([(x0 + L * 0.03, body_top + H * 0.12), (x0 + L * 0.98, body_top + H * 0.14)],
           fill=(208, 214, 224), width=max(2, int(L * 0.006)))
    for hx in (0.5, 0.68):
        d.rounded_rectangle([x0 + L * hx, body_top + H * 0.2, x0 + L * (hx + 0.05), body_top + H * 0.25],
                            radius=3, fill=(196, 202, 212))
    d.polygon([(x0 + L * 0.93, body_top + H * 0.08), (x0 + L * 0.995, body_top + H * 0.14),
               (x0 + L * 0.99, body_top + H * 0.24), (x0 + L * 0.94, body_top + H * 0.2)], fill=(250, 214, 140))
    d.polygon([(x0 + L * 0.005, body_top + H * 0.16), (x0 + L * 0.05, body_top + H * 0.12),
               (x0 + L * 0.05, body_top + H * 0.24), (x0 + L * 0.01, body_top + H * 0.26)], fill=(210, 60, 50))
    # wheel arches
    for cx in (x0 + L * 0.2, x0 + L * 0.8):
        d.pieslice([cx - r * 1.2, body_bottom - r * 1.25, cx + r * 1.2, body_bottom + r * 1.15], 180, 360,
                   fill=(52, 56, 64))
        wheel(d, cx, ground - r, r)


def motorcycle(layer, x0, ground, L):
    import math
    d = ImageDraw.Draw(layer)
    r = L * 0.18
    rear, front = (x0 + L * 0.18, ground - r), (x0 + L * 0.82, ground - r)
    wheel(d, *rear, r)
    wheel(d, *front, r)
    frame = (60, 64, 72)
    w = max(4, int(L * 0.03))
    d.line([rear, (x0 + L * 0.45, ground - r * 1.9)], fill=frame, width=w)
    d.line([(x0 + L * 0.4, ground - r * 1.1), front], fill=frame, width=w)
    d.line([front, (x0 + L * 0.72, ground - r * 2.7)], fill=(150, 156, 168), width=w)
    # tank + seat + fairing (white)
    d.polygon([(x0 + L * 0.32, ground - r * 2.0), (x0 + L * 0.48, ground - r * 2.45),
               (x0 + L * 0.66, ground - r * 2.35), (x0 + L * 0.7, ground - r * 1.8),
               (x0 + L * 0.45, ground - r * 1.55)], fill=(246, 248, 251), outline=(170, 178, 190))
    d.polygon([(x0 + L * 0.12, ground - r * 2.05), (x0 + L * 0.36, ground - r * 2.1),
               (x0 + L * 0.36, ground - r * 1.9), (x0 + L * 0.15, ground - r * 1.85)], fill=(38, 40, 46))
    d.rounded_rectangle([x0 + L * 0.35, ground - r * 1.55, x0 + L * 0.58, ground - r * 0.95], radius=8,
                        fill=(90, 96, 108))
    d.line([(x0 + L * 0.66, ground - r * 2.75), (x0 + L * 0.8, ground - r * 2.85)], fill=(38, 40, 46), width=w)
    d.ellipse([x0 + L * 0.74, ground - r * 2.55, x0 + L * 0.82, ground - r * 2.25], fill=(250, 214, 140))


def scooter(layer, x0, ground, L):
    d = ImageDraw.Draw(layer)
    r = L * 0.13
    rear, front = (x0 + L * 0.2, ground - r), (x0 + L * 0.84, ground - r)
    wheel(d, *rear, r)
    wheel(d, *front, r)
    d.polygon([(x0 + L * 0.06, ground - r * 1.6), (x0 + L * 0.2, ground - r * 2.8),
               (x0 + L * 0.48, ground - r * 2.8), (x0 + L * 0.5, ground - r * 1.6),
               (x0 + L * 0.72, ground - r * 1.55), (x0 + L * 0.78, ground - r * 3.9),
               (x0 + L * 0.86, ground - r * 4.0), (x0 + L * 0.92, ground - r * 1.4),
               (x0 + L * 0.06, ground - r * 1.2)], fill=(246, 248, 251), outline=(170, 178, 190))
    d.polygon([(x0 + L * 0.16, ground - r * 2.8), (x0 + L * 0.46, ground - r * 2.8),
               (x0 + L * 0.44, ground - r * 3.2), (x0 + L * 0.2, ground - r * 3.2)], fill=(38, 40, 46))
    d.line([(x0 + L * 0.8, ground - r * 4.0), (x0 + L * 0.9, ground - r * 4.4)], fill=(38, 40, 46),
           width=max(4, int(L * 0.025)))
    d.ellipse([x0 + L * 0.84, ground - r * 3.6, x0 + L * 0.9, ground - r * 3.2], fill=(250, 214, 140))


def render(kind, w, h, name):
    W, H = w * S, h * S
    img, road_top = scene(W, H)
    ground = road_top + (H - road_top) * 0.62
    L = W * (0.62 if kind == 'car' else 0.46 if kind == 'motorcycle' else 0.42)
    x0 = (W - L) / 2
    shadow = Image.new('L', (W, H), 0)
    ImageDraw.Draw(shadow).ellipse([x0 - L * 0.02, ground - H * 0.03, x0 + L * 1.02, ground + H * 0.04], fill=150)
    shadow = shadow.filter(ImageFilter.GaussianBlur(S * 6))
    img = Image.composite(Image.new('RGB', (W, H), (60, 64, 72)), img, shadow)
    layer = img.copy()
    {'car': car, 'motorcycle': motorcycle, 'scooter': scooter}[kind](layer, x0, ground, L)
    out = layer.resize((w, h), Image.LANCZOS)
    os.makedirs(OUT, exist_ok=True)
    out.save(os.path.join(OUT, name), optimize=True)


if __name__ == '__main__':
    for kind in ('car', 'motorcycle', 'scooter'):
        render(kind, 1024, 440, f'{kind}.png')
    print('written to', os.path.abspath(OUT))
