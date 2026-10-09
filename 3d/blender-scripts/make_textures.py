# Generates the chest-screen textures (base color + emission) from the reference layout.
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import numpy as np, sys
OUT = sys.argv[1]
X0, X1, Y0, Y1 = 355, 669, 872, 1079          # panel bounds in reference px
W = 1024; s = W / (X1 - X0); H = round((Y1 - Y0) * s)
def P(x, y): return ((x - X0) * s, (y - Y0) * s)
def superellipse_mask(w, h, n, inset):
    yy, xx = np.mgrid[0:h, 0:w]
    a = w / 2 - inset; b = h / 2 - inset
    v = np.abs((xx + .5 - w / 2) / a) ** n + np.abs((yy + .5 - h / 2) / b) ** n
    return v
N = 4.0
v_outer = superellipse_mask(W, H, N, 0)
# --- base color ---
navy = np.array([3, 13, 22], float)
yy, xx = np.mgrid[0:H, 0:W]
grad = 1.0 + 0.6 * (1 - yy / H) * (1 - xx / W)          # faint lighter top-left
base = np.ones((H, W, 3)) * navy * grad[..., None]
# inner green glow next to the frame (dark green halo)
d = np.clip((v_outer - 0.62) / 0.38, 0, 1) ** 2.2
glow_col = np.array([40, 90, 15], float)
base = base * (1 - d[..., None] * .85) + glow_col * d[..., None] * .85
img = Image.fromarray(base.clip(0, 255).astype(np.uint8))
emis = Image.fromarray((np.array([60, 150, 10]) * (d[..., None] ** 1.5) * .35).clip(0, 255).astype(np.uint8))
dr = ImageDraw.Draw(img); de = ImageDraw.Draw(emis)
font = ImageFont.truetype('/usr/share/fonts/truetype/google-fonts/Poppins-Medium.ttf', round(68 * s))
txt = 'Yungu'
bb = dr.textbbox((0, 0), txt, font=font, anchor='ls')
# place so the text spans x 415..587 with baseline at y 992
tw = bb[2] - bb[0]; target = (587 - 415) * s
font = ImageFont.truetype('/usr/share/fonts/truetype/google-fonts/Poppins-Medium.ttf', round(68 * s * target / tw))
x, y = P(415, 993)
dr.text((x, y), txt, font=font, fill=(229, 232, 228), anchor='ls')
de.text((x, y), txt, font=font, fill=(70, 72, 70), anchor='ls')
# green quote mark (bold closing double quote)
lime = (190, 245, 60); lime_e = (200, 255, 90)
qf = ImageFont.truetype('/usr/share/fonts/truetype/google-fonts/Poppins-Bold.ttf', round(50 * s))
qx, qy = P(598, 950)
dr.text((qx, qy), '\u201d', font=qf, fill=lime, anchor='lt')
de.text((qx, qy), '\u201d', font=qf, fill=lime_e, anchor='lt')
# indicator dots
for (dx, dy) in ((512, 904), (512, 1038)):
    cx, cy = P(dx, dy); rx, ry = 9.5 * s, 7.5 * s
    dr.ellipse((cx - rx, cy - ry, cx + rx, cy + ry), fill=lime)
    de.ellipse((cx - rx, cy - ry, cx + rx, cy + ry), fill=lime_e)
# soft bloom on emission
emis = Image.blend(emis, emis.filter(ImageFilter.GaussianBlur(6)), 0.35)
img.save(f'{OUT}/chest_screen_basecolor.png'); emis.save(f'{OUT}/chest_screen_emission.png')
print(W, H)
# ground glow: radial falloff in alpha
g = 256; yy, xx = np.mgrid[0:g, 0:g]
r = np.sqrt(((xx + .5) / g * 2 - 1) ** 2 + ((yy + .5) / g * 2 - 1) ** 2)
alpha = np.clip(1 - r, 0, 1) ** 1.8
rgba = np.zeros((g, g, 4), np.uint8); rgba[..., 0] = 200; rgba[..., 1] = 255; rgba[..., 2] = 90
rgba[..., 3] = (alpha * 255).astype(np.uint8)
Image.fromarray(rgba).save(f'{OUT}/ground_glow.png')
# body bottom glow: vertical alpha gradient (v=0 bottom, v=1 top)
h = 256; v = (np.arange(h)[::-1] + .5) / h          # row 0 = top of image = v 1
alpha = np.clip(1 - v, 0, 1) ** 2.3
rgba = np.zeros((h, 8, 4), np.uint8); rgba[..., 0] = 200; rgba[..., 1] = 255; rgba[..., 2] = 80
rgba[..., 3] = (alpha[:, None] * 255).astype(np.uint8)
Image.fromarray(rgba).save(f'{OUT}/body_glow_gradient.png')
