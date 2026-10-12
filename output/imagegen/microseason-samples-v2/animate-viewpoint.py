"""Project the intact printed illustration as a plane turning 0–30–0 degrees."""
from pathlib import Path
import math
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent
SIZE, COUNT = 640, 80
source = ROOT / '03-lotus-opens.png'
original = Image.open(source).convert('RGB').resize((SIZE,SIZE),Image.Resampling.LANCZOS)
background = tuple(np.median(np.array(original)[:40,:40].reshape(-1,3),axis=0).astype(int))
palette = original.quantize(colors=128)
center = SIZE / 2
distance = SIZE * 2.2
extent = SIZE * 0.45
corners = [(-extent,-extent),(extent,-extent),(extent,extent),(-extent,extent)]
texture = [(0,0),(SIZE,0),(SIZE,SIZE),(0,SIZE)]
frames = []
for index in range(COUNT):
    angle = math.radians(15*(1-math.cos(2*math.pi*index/COUNT)))
    projected=[]
    for x,y in corners:
        depth = -x*math.sin(angle)
        factor = distance/(distance+depth)
        projected.append((center+x*math.cos(angle)*factor,center+y*factor))
    matrix,values=[],[]
    for (x,y),(u,v) in zip(projected,texture):
        matrix.extend([[x,y,1,0,0,0,-u*x,-u*y],[0,0,0,x,y,1,-v*x,-v*y]])
        values.extend([u,v])
    coefficients=np.linalg.solve(np.array(matrix),np.array(values))
    frame=original.transform((SIZE,SIZE),Image.Transform.PERSPECTIVE,coefficients,
                             Image.Resampling.BICUBIC,fillcolor=background)
    frames.append(frame.quantize(palette=palette,dither=Image.Dither.NONE))
target=ROOT/'03-lotus-opens-viewpoint-30.gif'
frames[0].save(target,save_all=True,append_images=frames[1:],duration=100,loop=0,
               disposal=1,optimize=False)
with Image.open(target) as check:
    assert check.n_frames == COUNT and check.info['loop'] == 0
sheet=Image.new('RGB',(SIZE*3,SIZE),background)
for column,index in enumerate((0,20,40)):
    sheet.paste(frames[index].convert('RGB'),(SIZE*column,0))
sheet.save(ROOT/'03-lotus-opens-viewpoint-30-review.jpg')
print(f'{target}: {COUNT} frames, 8 seconds, {target.stat().st_size:,} bytes')
