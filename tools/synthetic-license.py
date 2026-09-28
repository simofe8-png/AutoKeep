"""SYNTHETIC Israeli-license-like test images (fake owner data; vehicle facts = public registry record)."""
import random, re
from PIL import Image, ImageDraw, ImageFont, ImageFilter
F = 'C:/Windows/Fonts/'
def font(sz, bold=False): return ImageFont.truetype(F + ('arialbd.ttf' if bold else 'arial.ttf'), sz)
def vis(s):  # visual order for RTL text without bidi: reverse Hebrew runs, keep Latin/digit runs
    parts = re.findall(r'[\u0590-\u05FF\s\'".,:()-]+|[^\u0590-\u05FF]+', s)
    return ''.join(p[::-1] if re.search(r'[\u0590-\u05FF]', p) else p for p in reversed(parts))
W, H = 1700, 1080
im = Image.new('RGB', (W, H), (236, 240, 228)); d = ImageDraw.Draw(im)
d.rectangle([20, 20, W - 20, H - 20], outline=(60, 90, 60), width=4)
d.rectangle([20, H - 110, W - 20, H - 20], fill=(255, 0, 255))  # test-image marker (selection by color)
def rtext(x_right, y, s, f, fill=(20, 20, 20)):
    t = vis(s); w = d.textlength(t, font=f); d.text((x_right - w, y), t, font=f, fill=fill)
rtext(W - 60, 40, 'מדינת ישראל - משרד התחבורה', font(40, True))
rtext(W - 60, 95, 'רישיון רכב', font(56, True))
d.text((60, 45), 'SAMPLE / TEST ONLY', font=font(34, True), fill=(180, 30, 30))
rtext(W - 60, 175, 'מספר רכב', font(38, True)); d.text((W - 640, 165), '77-881-76', font=font(64, True), fill=(10, 10, 10))
rows = [('שם בעל הרכב', 'ישראל ישראלי', True), ('ת.ז.', '000000018', False), ('כתובת', 'רחוב הדוגמה 1 עיר הדוגמה', True),
        ('תוצר', 'סיאט ספרד', True), ('דגם', 'IBIZA', False), ('שנת ייצור', '2012', False), ('צבע', 'שחור מטלי', True),
        ('מספר שלדה', 'VSSZZZ6JZCR122118', False), ('דגם מנוע', 'CGG', False), ('סוג דלק', 'בנזין', True),
        ('תוקף רישיון', '25/08/2027', False)]
y = 270
for label, value, heb in rows:
    rtext(W - 60, y, label, font(34, True))
    if heb: rtext(W - 520, y, value, font(34))
    else: d.text((W - 520 - d.textlength(value, font=font(34)), y), value, font=font(34), fill=(20, 20, 20))
    y += 68
im.save('license-clean.png')
# "Photographed": perspective, lighting gradient, blur, noise, JPEG
bg = Image.new('RGB', (2000, 1500), (90, 70, 55)); card = im.rotate(-4, expand=True, fillcolor=(90, 70, 55))
bg.paste(card, (130, 180))
grad = Image.linear_gradient('L').resize(bg.size).rotate(35)
bg = Image.composite(bg, Image.eval(bg, lambda v: int(v * 0.7)), grad)
bg = bg.filter(ImageFilter.GaussianBlur(1.3))
px = bg.load(); random.seed(1)
for _ in range(250000):
    x, yy = random.randrange(bg.width), random.randrange(bg.height); r, g, b = px[x, yy]; n = random.randint(-25, 25)
    px[x, yy] = (max(0, min(255, r + n)), max(0, min(255, g + n)), max(0, min(255, b + n)))
bg.save('license-photo.jpg', quality=78)
print('ok')
