#!/usr/bin/env python3
"""Offline draft packaging. Inputs: original.png, cutout.png, prompt.txt per PoC ID."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import shutil
import tempfile

from PIL import Image, ImageDraw

POC = {'kou-01': '東風凍を解く', 'kou-32': '蓮始めて開く', 'kou-54': '楓蔦黄ばむ'}
SIZE = 512
FRAMES = 12


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')


def normalize(path):
    source = Image.open(path).convert('RGBA')
    bounds = source.getchannel('A').getbbox()
    if not bounds:
        raise ValueError(f'Empty cutout: {path}')
    source = source.crop(bounds)
    source.thumbnail((306, 306), Image.Resampling.LANCZOS)
    canvas = Image.new('RGBA', (SIZE, SIZE))
    canvas.alpha_composite(source, ((SIZE-source.width)//2, (SIZE-source.height)//2))
    return canvas


def geometric_initial(completed):
    bounds = completed.getchannel('A').getbbox()
    x0, y0, x1, y1 = bounds
    mx, my = (x0+x1)//2, (y0+y1)//2
    regions = [(x0,y0,mx,my),(mx,y0,x1,my),(x0,my,mx,y1),(mx,my,x1,y1)]
    result = Image.new('RGBA', completed.size)
    draw = ImageDraw.Draw(result)
    palette = [(147, 166, 144), (192, 164, 154), (180, 164, 125), (133, 155, 164)]
    for region in regions:
        part = completed.crop(region)
        if not part.getchannel('A').getbbox():
            continue
        r,g,b,a = part.resize((1,1), Image.Resampling.BOX).getpixel((0,0))
        color = min(palette, key=lambda c: sum((u-v)**2 for u,v in zip(c, (r,g,b))))
        draw.rounded_rectangle(region, radius=38, fill=(*color, 255))
    return result


def save_animation(path, frames, duration):
    frames[0].save(path, format='WEBP', save_all=True, append_images=frames[1:],
                   lossless=True, duration=duration, loop=0, method=6)


def validate(folder, files):
    report = {}
    for filename in files:
        path = folder / filename
        with Image.open(path) as image:
            count = getattr(image, 'n_frames', 1)
            expected = FRAMES if filename in ('transition.webp', 'idle.webp') else 1
            if count != expected:
                raise ValueError(f'{filename}: expected {expected} frames, got {count}')
            boxes = []
            for i in range(count):
                image.seek(i)
                rgba = image.convert('RGBA')
                box = rgba.getchannel('A').getbbox()
                if image.size != (SIZE, SIZE) or not box or min(box[:2]) <= 0 or max(box[2:]) >= SIZE:
                    raise ValueError(f'{filename}: invalid dimensions or clipping')
                if rgba.getpixel((0, 0))[3] != 0:
                    raise ValueError(f'{filename}: opaque background')
                boxes.append(box)
            report[filename] = {'sha256': sha(path), 'bytes': path.stat().st_size,
                                'frames': count, 'alphaBounds': boxes}
    return report


def package(inputs, destination):
    if destination.exists():
        raise ValueError(f'Refusing to overwrite existing directory: {destination}')
    for kou_id in POC:
        for filename in ('original.png', 'cutout.png', 'prompt.txt'):
            if not (inputs / kou_id / filename).is_file():
                raise ValueError(f'Missing input: {inputs / kou_id / filename}')
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = Path(tempfile.mkdtemp(prefix='seasonal-package-', dir=destination.parent))
    entries = []
    sheet = Image.new('RGB', (SIZE*4, SIZE*len(POC)), '#f6f1e7')
    try:
        for row, (kou_id, name) in enumerate(POC.items()):
            source = inputs / kou_id
            target = temporary / kou_id
            target.mkdir()
            completed = normalize(source / 'cutout.png')
            initial = geometric_initial(completed)
            initial.save(target / 'initial.png')
            completed.save(target / 'completed.png')
            completed.save(target / 'completed.webp', lossless=True, method=6)
            transition = [Image.blend(initial, completed, i/(FRAMES-1)) for i in range(FRAMES)]
            idle = [completed.rotate(1.5*math.sin(2*math.pi*i/FRAMES), resample=Image.Resampling.BICUBIC,
                                     center=(256, 256)) for i in range(FRAMES)]
            save_animation(target / 'transition.webp', transition, 70)
            save_animation(target / 'idle.webp', idle, 100)
            sprite = Image.new('RGBA', (SIZE*FRAMES, SIZE))
            for index, frame in enumerate(idle):
                sprite.paste(frame, (index*SIZE, 0))
            sprite.save(target/'idle-sprite.png')
            files = ['initial.png', 'completed.png', 'completed.webp', 'transition.webp', 'idle.webp']
            checks = validate(target, files)
            with Image.open(target/'idle-sprite.png') as check_sprite:
                if check_sprite.size != (SIZE*FRAMES, SIZE):
                    raise ValueError('Invalid sprite dimensions')
                for index, frame in enumerate(idle):
                    decoded = check_sprite.crop((index*SIZE, 0, (index+1)*SIZE, SIZE)).convert('RGBA')
                    if decoded.tobytes() != frame.tobytes():
                        raise ValueError('Sprite frame differs from source')
            provenance = {'kouId': kou_id, 'provider': 'openai', 'model': 'gpt-image-2',
                          'generation': {'size': '1024x1024', 'quality': 'low'}, 'promptVersion': 1,
                          'generatedAt': datetime.fromtimestamp((source/'original.png').stat().st_mtime, timezone.utc).isoformat(),
                          'generatedAtSource': 'original file timestamp; API timestamp unavailable',
                          'prompt': (source/'prompt.txt').read_text(),
                          'sourceHashes': {f: sha(source/f) for f in ('original.png','cutout.png','prompt.txt')},
                          'files': checks, 'actualCost': None,
                          'costEvidence': 'Bundled generation CLI returned no usage; actual cost unknown',
                          'rights': {'reference': 'https://openai.com/policies/terms-of-use/', 'review': 'pending'},
                          'initialMethod': 'Approximate Muted Pop: 2x2 silhouette bounding regions, up to four large rounded geometric segments, nearest muted palette color; approximate initial, not final art',
                          'idleMethod': 'Provisional rigid rotation +/-1.5 degrees about fixed canvas center; not separated-piece animation'}
            write_json(target/'provenance.json', provenance)
            entry = {'kouId': kou_id, 'name': name, 'anchor': {'x': .5, 'y': .5},
                     'width': SIZE, 'height': SIZE, 'format': 'png+animated-webp', 'transparent': True,
                     'colorSpace': 'sRGB', 'review': 'pending', 'provenance': f'{kou_id}/provenance.json'}
            entry.update({state: f'{kou_id}/{state}.{ext}' for state, ext in
                          [('initial','png'), ('completed','png'), ('transition','webp'), ('idle','webp')]})
            entry['idleSpriteCandidate'] = {'src': f'{kou_id}/idle-sprite.png', 'frames': FRAMES, 'frameDurationMs': 100, 'frameWidth': SIZE, 'frameHeight': SIZE, 'bytes': (target/'idle-sprite.png').stat().st_size, 'sha256': sha(target/'idle-sprite.png')}
            entry['animation'] = {'transitionFrameDurationMs': 70, 'idleFrameDurationMs': 100, 'frames': FRAMES, 'loop': True}
            entry['formatComparisonBytes'] = {f: checks[f]['bytes'] for f in ['completed.png','completed.webp','idle.webp']}
            entry['formatComparisonBytes']['idle-sprite.png'] = (target/'idle-sprite.png').stat().st_size
            entry['completedWebpCandidate'] = f'{kou_id}/completed.webp'
            entries.append(entry)
            for col, picture in enumerate([initial, completed, transition[5], idle[3]]):
                sheet.paste(picture, (col*SIZE, row*SIZE), picture)
            print(f'{kou_id}: validated 512x512 alpha; 12 transition and idle frames')
        sheet.save(temporary/'contact-sheet.png')
        write_json(temporary/'manifest.json', {'version': 'poc-v1', 'status': 'draft', 'assets': entries})
        write_json(temporary/'review.json', {'status':'pending', 'formatDecision':'pending browser load and visual review',
                   'contactSheetColumns':['initial','completed','transition midpoint','idle maximum sway'],
                   'qualityDecision': 'changes required; do not expand to72 before review', 'knownConcerns': ['initial geometry is approximate and requires art review', 'transition is provisional crossfade, not final layering', 'residual thin shadow', 'extra wind shapes', 'lotus dimensional center', 'maple extra yellow twig'], 'assets':list(POC)})
        temporary.rename(destination)
    except BaseException:
        shutil.rmtree(temporary)
        raise


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input-root', type=Path, required=True)
    parser.add_argument('--output-root', type=Path, required=True)
    args = parser.parse_args()
    try:
        package(args.input_root.resolve(), args.output_root.resolve())
    except (ValueError, OSError) as error:
        parser.exit(1, f'{error}\n')
