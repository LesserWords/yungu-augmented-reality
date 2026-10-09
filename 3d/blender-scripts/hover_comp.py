# composite transparent frames over a soft studio background
import sys, os, glob, numpy as np
from PIL import Image
src, dst, mode = sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else "light"
os.makedirs(dst, exist_ok=True)
bg = None
for p in sorted(glob.glob(os.path.join(src, "f_*.png"))):
    im = Image.open(p).convert("RGBA")
    if bg is None:
        w, h = im.size; yy, xx = np.mgrid[0:h, 0:w]
        r = np.sqrt(((xx - w * .5) / w) ** 2 + ((yy - h * .62) / h) ** 2)
        t = np.clip(r / 0.75, 0, 1)[..., None]
        if mode == "dark":
            c0, c1 = np.array([24, 44, 62]), np.array([4, 10, 18])
        else:
            c0, c1 = np.array([250, 251, 252]), np.array([214, 220, 228])
        bg = Image.fromarray((c0 * (1 - t) + c1 * t).astype(np.uint8)).convert("RGBA")
    out = bg.copy(); out.alpha_composite(im)
    out.convert("RGB").save(os.path.join(dst, os.path.basename(p)))
