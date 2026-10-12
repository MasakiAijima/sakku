"""Encode the five approved-direction still samples as gentle looping GIFs."""
from pathlib import Path
import math
from PIL import Image

ROOT = Path(__file__).resolve().parent
SIZE = 640
COUNT = 80

for source in sorted(ROOT.glob('0*.png')):
    original = Image.open(source).convert('RGB').resize((SIZE, SIZE), Image.Resampling.LANCZOS)
    # Keep a single shared palette throughout each loop to avoid color flicker.
    palette = original.quantize(colors=128)
    background = original.getpixel((12, 12))
    frames = []
    for index in range(COUNT):
        phase = 2 * math.pi * index / COUNT
        angle = math.radians(0.65 * math.sin(phase))
        scale = 0.94
        a, b = math.cos(angle) / scale, math.sin(angle) / scale
        dx, dy = 2 * math.sin(phase), 7 * math.cos(phase)
        center = SIZE / 2
        matrix = (a, b, center - a * (center + dx) - b * (center + dy),
                  -b, a, center + b * (center + dx) - a * (center + dy))
        frame = original.transform((SIZE, SIZE), Image.Transform.AFFINE, matrix,
                                   Image.Resampling.BICUBIC, fillcolor=background)
        frames.append(frame.quantize(palette=palette, dither=Image.Dither.NONE))
    target = source.with_suffix('.gif')
    frames[0].save(target, save_all=True, append_images=frames[1:],
                   duration=80, loop=0, disposal=1, optimize=False)
    with Image.open(target) as check:
        assert check.n_frames == COUNT
        assert check.info['loop'] == 0
        durations = []
        for index in range(check.n_frames):
            check.seek(index)
            durations.append(check.info['duration'])
        assert sum(durations) == 6400
    print(f'{target.name}: {COUNT} frames, 6.4 seconds, {target.stat().st_size:,} bytes')
