# adds a soft bloom on lime emissive pixels (frames are RGBA, transparent bg)
import sys, os, glob, numpy as np
from PIL import Image, ImageFilter
src, dst = sys.argv[1], sys.argv[2]; os.makedirs(dst, exist_ok=True)
for p in sorted(glob.glob(os.path.join(src, "f_*.png"))):
    im = Image.open(p).convert("RGBA"); a = np.asarray(im).astype(np.float32) / 255
    r, g, b, al = a[..., 0], a[..., 1], a[..., 2], a[..., 3]
    lime = np.clip((g - b - 0.35) * 2.2, 0, 1) * np.clip(g * 1.4 - 0.4, 0, 1) * al
    m = Image.fromarray((lime * 255).astype(np.uint8))
    halo = (np.asarray(m.filter(ImageFilter.GaussianBlur(im.width / 90))).astype(np.float32) * 0.9 +
            np.asarray(m.filter(ImageFilter.GaussianBlur(im.width / 30))).astype(np.float32) * 0.7) / 255
    col = np.array([0.72, 1.0, 0.25])
    rgb = a[..., :3] * al[..., None] + halo[..., None] * col      # premultiplied add
    alpha = np.clip(al + halo * 0.85, 0, 1)
    out = np.dstack([np.clip(rgb / np.maximum(alpha, 1e-4)[..., None], 0, 1), alpha])
    Image.fromarray((out * 255).astype(np.uint8)).save(os.path.join(dst, os.path.basename(p)))
