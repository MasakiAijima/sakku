"""Separate visible printed color shapes and animate them against a fixed ground."""
from pathlib import Path
import math
import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parent
SIZE, COUNT = 560, 64

def components(labels):
    seen = np.zeros(labels.shape, dtype=bool)
    for y, x in zip(*np.nonzero(labels)):
        if seen[y, x]:
            continue
        value = labels[y, x]
        stack, pixels = [(y, x)], []
        seen[y, x] = True
        while stack:
            cy, cx = stack.pop()
            pixels.append((cy, cx))
            for ny, nx in ((cy-1,cx),(cy+1,cx),(cy,cx-1),(cy,cx+1)):
                if 0 <= ny < SIZE and 0 <= nx < SIZE and not seen[ny,nx] and labels[ny,nx] == value:
                    seen[ny,nx] = True
                    stack.append((ny,nx))
        if len(pixels) >= 65:
            yield pixels

for source in sorted(ROOT.glob('0*.png')):
    original = Image.open(source).convert('RGB').resize((SIZE,SIZE), Image.Resampling.LANCZOS)
    rgb = np.array(original)
    hsv = np.array(original.convert('HSV'))
    h,s,v = hsv[:,:,0],hsv[:,:,1],hsv[:,:,2]
    labels = np.zeros((SIZE,SIZE), dtype=np.uint8)
    foreground = s > 28
    labels[foreground] = 1
    labels[foreground & (h >= 14) & (h < 42)] = 2
    labels[foreground & (h >= 42) & (h < 112)] = 3
    labels[foreground & (h >= 112) & (h < 190)] = 4
    labels[foreground & ((h < 14) | (h >= 190)) & (s < 155)] = 5
    labels[foreground & (h >= 112) & (h < 190) & (s < 145)] = 6
    pieces = []
    for pixels in components(labels):
        ys,xs = np.array(pixels).T
        mask_array = np.zeros((SIZE,SIZE), dtype=np.uint8)
        mask_array[ys,xs] = 255
        mask = Image.fromarray(mask_array)
        # A narrow color bleed hides antialias fringes at the old overlap edges.
        expanded = mask.filter(ImageFilter.MaxFilter(5))
        color = tuple(np.median(rgb[ys,xs],axis=0).astype(int))
        layer = Image.new('RGB',(SIZE,SIZE),color)
        layer.paste(original,(0,0),mask)
        layer = layer.convert('RGBA')
        layer.putalpha(expanded)
        pieces.append((len(pixels), layer, (float(xs.mean()),float(ys.mean()))))
    pieces.sort(key=lambda item:item[0],reverse=True)
    background = tuple(np.median(rgb[:40,:40].reshape(-1,3),axis=0).astype(int))
    palette = original.quantize(colors=128)
    frames=[]
    for frame_index in range(COUNT):
        phase = 2*math.pi*frame_index/COUNT
        canvas = Image.new('RGBA',(SIZE,SIZE),background+(255,))
        for index,(_,layer,center) in enumerate(pieces):
            offset = index*1.7
            dx = 7*math.sin(phase+offset)
            dy = 5*math.sin(phase+offset+0.8)
            angle = 2.4*math.sin(phase+offset+0.4)
            moved = layer.rotate(angle,Image.Resampling.BICUBIC,center=center,
                                 translate=(dx,dy))
            canvas.alpha_composite(moved)
        frames.append(canvas.convert('RGB').quantize(palette=palette,dither=Image.Dither.NONE))
    target = source.with_name(source.stem+'-breeze.gif')
    frames[0].save(target,save_all=True,append_images=frames[1:],duration=100,
                   loop=0,disposal=1,optimize=False)
    with Image.open(target) as check:
        assert check.n_frames == COUNT and check.info['loop'] == 0
    # Export a small review sheet showing different overlap positions.
    sheet=Image.new('RGB',(SIZE*3,SIZE),background)
    for column,index in enumerate((0,16,32)):
        sheet.paste(frames[index].convert('RGB'),(SIZE*column,0))
    sheet.save(source.with_name(source.stem+'-breeze-review.jpg'))
    print(f'{target.name}: {len(pieces)} moving shapes, {target.stat().st_size:,} bytes',flush=True)
