#!/usr/bin/env python3
"""Refresh fixed 72-kou layout sources without moving any saved coordinates."""
import argparse
import hashlib
import importlib.util
import json
import math
from pathlib import Path
from urllib.parse import urlsplit

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
if not (ROOT / 'scripts/build-seasonal-layout.py').is_file():
    ROOT = Path.cwd()

def build(write=True, gallery_path=None, output=None):
    old_path = ROOT / 'public/seasonal-assets/poc-v2/layout.json'
    gallery_path = Path(gallery_path or ROOT / 'public/seasonal-assets/poc-v3/gallery.json').resolve()
    output = Path(output).resolve() if output else gallery_path.parent / 'layout.json'
    old = json.loads(old_path.read_text())
    gallery = json.loads(gallery_path.read_text())
    canonical = [f'kou-{index:02}' for index in range(1, 73)]
    if [row['id'] for row in old['entries']] != canonical:
        raise ValueError('Saved layout must contain canonical 72 entries in order')
    if [row['id'] for row in gallery['entries']] != canonical:
        raise ValueError('Gallery must contain canonical 72 entries in order')
    spec = importlib.util.spec_from_file_location('seasonal_layout', ROOT / 'scripts/build-seasonal-layout.py')
    geometry = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(geometry)
    geometry.GAP = 3.
    geometry.RADIUS = 285.
    sources = {}
    polygons = []
    for saved, current in zip(old['entries'], gallery['entries']):
        if current['status'] != 'succeeded' or not current.get('image'):
            raise ValueError(f"Image is not successfully generated: {current['id']}")
        if any(saved[key] != current[key] for key in ('id', 'name', 'sekkiId', 'season')):
            raise ValueError(f"Gallery metadata mismatch: {current['id']}")
        image_url = urlsplit(current['image'])
        if image_url.scheme or image_url.netloc:
            raise ValueError('Only local gallery image paths are supported')
        relative = image_url.path
        path = (gallery_path.parent / relative).resolve()
        path.relative_to((ROOT / 'public/seasonal-assets').resolve())
        with Image.open(path) as original:
            image = original.convert('RGBA')
        alpha = np.asarray(image)[:, :, 3]
        bounds = image.getchannel('A').getbbox()
        if not bounds:
            raise ValueError(f"Empty image: {current['id']}")
        cx, cy = (bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2
        edge = max(bounds[2] - bounds[0], bounds[3] - bounds[1])
        boundary = []
        for y in range(image.height):
            xs = np.flatnonzero(alpha[y])
            if len(xs):
                left, right = int(xs[0]), int(xs[-1]) + 1
                boundary.extend([(left, y), (right, y), (left, y + 1), (right, y + 1)])
        polygons.append((geometry.hull(boundary) - [cx, cy]) / edge)
        sources[current['id']] = {
            'path': relative, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
            'canvas': [image.width, image.height], 'visibleBounds': list(bounds),
            'visibleCenter': [cx, cy], 'visibleLongEdge': edge,
        }
    points = np.array([[row['x'], row['y']] for row in old['entries']], dtype=float)
    profiles = geometry.pair_profiles(polygons)
    low, high = 0., min(55.31, old['commonVisibleLongEdge'])
    if geometry.fits(points, polygons, profiles, high):
        low = high
    else:
        for _ in range(40):
            middle = (low + high) / 2
            if geometry.fits(points, polygons, profiles, middle):
                low = middle
            else:
                high = middle
    size = math.floor(low * 100) / 100
    if not geometry.fits(points, polygons, profiles, size):
        raise ValueError('Updated silhouettes do not fit the fixed layout')
    entries = [{**row, 'sourceId': row['id'], 'placeholder': False} for row in old['entries']]
    result = {**old, 'status': 'current-artwork-fixed-layout',
              'algorithm': 'fixed coordinates / latest 72 silhouettes / common-size fit',
              'commonVisibleLongEdge': size, 'minimumHullGap': 3.,
              'sources': sources, 'entries': entries}
    if write:
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'path': str(output), 'count': len(entries),
                      'commonVisibleLongEdge': size, 'coordinatesPreserved': True,
                      'overlap': False, 'written': write}))
    return result

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--gallery', type=Path, default=ROOT / 'public/seasonal-assets/poc-v3/gallery.json')
    parser.add_argument('--output', type=Path)
    parser.add_argument('--dry-run', action='store_true')
    arguments = parser.parse_args()
    build(write=not arguments.dry_run, gallery_path=arguments.gallery, output=arguments.output)
