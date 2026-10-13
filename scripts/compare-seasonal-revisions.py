#!/usr/bin/env python3
"""Build equal-extent static artwork comparisons without image API calls."""
import argparse
import json
from pathlib import Path
from PIL import Image, ImageDraw

CANDIDATES = (
    ('kou-01', '東風凍を解く', '01-east-wind-thaw.png'),
    ('kou-32', '蓮始めて開く', '03-lotus-opens.png'),
    ('kou-54', '楓蔦黄ばむ', '05-maple-colors.png'),
)
CANVAS = 512
EXTENT = 306
BACKGROUND = '#f7f2e8'


def normalize(path):
    artwork = Image.open(path).convert('RGBA')
    bounds = artwork.getchannel('A').getbbox()
    if bounds is None:
        raise ValueError(f'Empty artwork {path}')
    artwork = artwork.crop(bounds)
    width, height = artwork.size
    target = (round(width * EXTENT / max(width, height)), round(height * EXTENT / max(width, height)))
    artwork = artwork.resize(target, Image.Resampling.LANCZOS)
    canvas = Image.new('RGBA', (CANVAS, CANVAS))
    canvas.alpha_composite(artwork, ((CANVAS - target[0]) // 2, (CANVAS - target[1]) // 2))
    bbox = canvas.getchannel('A').getbbox()
    if max(bbox[2] - bbox[0], bbox[3] - bbox[1]) != EXTENT:
        raise ValueError(f'Unexpected artwork extent {path}: {bbox}')
    if not all(0 < value < CANVAS for value in bbox):
        raise ValueError(f'Clipped artwork {path}: {bbox}')
    return canvas, bbox


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[1])
    args = parser.parse_args()
    root = args.root.resolve()
    public = root / 'public/seasonal-assets/poc-v2'
    review = public / 'review'
    review.mkdir(parents=True, exist_ok=True)
    manifest = []
    sheet = Image.new('RGB', (1024, 3 * 550), BACKGROUND)
    draw = ImageDraw.Draw(sheet)
    for index, (kou_id, name, reference) in enumerate(CANDIDATES):
        row = {'id': kou_id, 'name': name, 'alpha_bounds': {}}
        for column, (version, source) in enumerate((
            ('previous', root / 'public/seasonal-assets/poc-v1' / kou_id / 'completed.png'),
            ('revised', root / 'output/seasonal-assets/poc-v2' / kou_id / 'cutout.png'),
        )):
            artwork, bounds = normalize(source)
            output = review / f'{kou_id}-{version}.png'
            artwork.save(output)
            if version == 'revised':
                destination = public / kou_id / 'completed.png'
                destination.parent.mkdir(parents=True, exist_ok=True)
                artwork.save(destination)
            sheet.paste(artwork, (column * CANVAS, index * 550 + 38), artwork)
            draw.text((column * CANVAS + 16, index * 550 + 12), f'{kou_id} {version}', fill='#574936')
            row['alpha_bounds'][version] = list(bounds)
        Image.open(root / 'output/imagegen/microseason-samples-v2' / reference).save(review / f'{kou_id}-style-reference.png')
        manifest.append(row)
    (review / 'manifest.json').write_text(json.dumps({'canvas_px': CANVAS, 'artwork_extent_px': EXTENT, 'background': BACKGROUND, 'items': manifest}, ensure_ascii=False, indent=2) + '\n')
    export = root / 'output/seasonal-assets/poc-v2/comparison.png'
    export.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(export)
    print(json.dumps({'comparison': str(export), 'items': manifest}, ensure_ascii=False))


if __name__ == '__main__':
    main()
