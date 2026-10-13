#!/usr/bin/env python3
"""Publish seasonal contact sheets and check the current gallery image artifacts."""
import json
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / 'public/seasonal-assets/poc-v3'
OUTPUT = ROOT / 'output/seasonal-assets/poc-v3/review'


def main():
    manifest = json.loads((BASE / 'gallery.json').read_text())
    OUTPUT.mkdir(parents=True, exist_ok=True)
    checks = []
    for season in ['spring', 'summer', 'autumn', 'winter']:
        entries = [row for row in manifest['entries'] if row['season'] == season]
        sheet = Image.new('RGB', (256*6, 280*3), '#f7f2e8')
        draw = ImageDraw.Draw(sheet)
        for index, entry in enumerate(entries):
            x, y = index % 6 * 256, index // 6 * 280
            draw.text((x+12, y+12), entry['id']+' '+entry['status'], fill='#463f33')
            if entry['status'] != 'succeeded':
                continue
            path = BASE / entry['image'].split('?', 1)[0]
            image = Image.open(path).convert('RGBA')
            alpha = image.getchannel('A')
            bounds = alpha.getbbox()
            assert image.size == (512, 512) and image.getpixel((0, 0))[3] == 0
            assert bounds and 0 < min(bounds[:2]) and max(bounds[2:]) < 512
            assert max(bounds[2]-bounds[0], bounds[3]-bounds[1]) == 306
            preview = image.resize((256, 256), Image.Resampling.LANCZOS)
            sheet.paste(preview, (x, y+24), preview)
            checks.append({'id': entry['id'], 'bounds': list(bounds), 'bytes': path.stat().st_size})
        sheet.save(OUTPUT / f'{season}.png')
    report = {'generated': len(checks), 'count': len(manifest['entries']), 'images': checks}
    (OUTPUT / 'checks.json').write_text(json.dumps(report, indent=2)+'\n')
    print(json.dumps({'generated': len(checks), 'contactSheets': str(OUTPUT)}))


if __name__ == '__main__':
    main()
