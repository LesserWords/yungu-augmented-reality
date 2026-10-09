import sys
from PIL import Image
ref = Image.open('/mnt/user-data/uploads/YUNGU_MASCOTE.png').convert('RGBA')
ren = Image.open(sys.argv[1]).convert('RGBA').resize(ref.size)
def on_white(im):
    bg = Image.new('RGBA', im.size, (255, 255, 255, 255)); bg.alpha_composite(im); return bg.convert('RGB')
a, b = on_white(ref), on_white(ren)
over = Image.blend(a, b, 0.5)
out = Image.new('RGB', (ref.width * 3, ref.height), 'white')
out.paste(a, (0, 0)); out.paste(b, (ref.width, 0)); out.paste(over, (ref.width * 2, 0))
out.resize((out.width // 2, out.height // 2)).save(sys.argv[2])
