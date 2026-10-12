"""Keep the original connected print underneath softly breathing color pieces."""
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
        expanded = mask.filter(ImageFilter.MaxFilter(17)).filter(ImageFilter.MinFilter(17)).filter(ImageFilter.MaxFilter(7))
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
        # The unchanged print under the moving pieces preserves every original
        # contact, including shapes whose hidden portions are absent in the PNG.
        canvas = original.convert('RGBA')
        for index,(_,layer,center) in enumerate(pieces):
            offset = index*1.7
            dx = 1.2*math.sin(phase+offset)
            dy = 1.5*math.sin(phase+offset+0.8)
            angle = math.radians(0.55*math.sin(phase+offset+0.4))
            scale = 1.025 + 0.018*math.sin(phase+offset)
            a,b = math.cos(angle)/scale, math.sin(angle)/scale
            cx,cy = center
            matrix = (a,b,cx-a*(cx+dx)-b*(cy+dy),
                      -b,a,cy+b*(cx+dx)-a*(cy+dy))
            moved = layer.transform((SIZE,SIZE),Image.Transform.AFFINE,matrix,
                                    Image.Resampling.BICUBIC)
            canvas.alpha_composite(moved)
        rendered = np.array(canvas.convert('RGB').convert('HSV'))
        repaired = np.array(canvas.convert('RGB'))
        contact = foreground & (rendered[:,:,1] <= 28)
        repaired[contact] = rgb[contact]
        canvas = Image.fromarray(repaired)
        assert np.all(np.array(canvas.convert('HSV'))[:,:,1][foreground] > 28)
        frames.append(canvas.convert('RGB').quantize(palette=palette,dither=Image.Dither.NONE))
    target = source.with_name(source.stem+'-overlap.gif')
    frames[0].save(target,save_all=True,append_images=frames[1:],duration=100,
                   loop=0,disposal=1,optimize=False)
    with Image.open(target) as check:
        assert check.n_frames == COUNT and check.info['loop'] == 0
    # Export a small review sheet showing different overlap positions.
    sheet=Image.new('RGB',(SIZE*3,SIZE),background)
    for column,index in enumerate((0,16,32)):
        sheet.paste(frames[index].convert('RGB'),(SIZE*column,0))
    sheet.save(source.with_name(source.stem+'-overlap-review.jpg'))
    print(f'{target.name}: {len(pieces)} moving shapes, {target.stat().st_size:,} bytes',flush=True)
