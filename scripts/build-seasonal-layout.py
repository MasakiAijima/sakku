#!/usr/bin/env python3
"""Build a deterministic 72-kou preview layout from the approved sample silhouettes."""
import hashlib
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
MASTER = ROOT / 'data/calendar/versions/ac9f68a0f13d1604967fe9150779c7dcd9dbf12115ce0254c5ddd7a896350e1c.json'
OUTPUT = ROOT / 'public/seasonal-assets/poc-v2/layout.json'
CENTER = np.array([350., 350.])
RADIUS = 285.
GAP = 3.
SEED = 1972


def hull(points):
    points = sorted(set(points))
    def cross(a, b, c):
        return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])
    lower, upper = [], []
    for point in points:
        while len(lower) > 1 and cross(lower[-2], lower[-1], point) <= 0:
            lower.pop()
        lower.append(point)
    for point in reversed(points):
        while len(upper) > 1 and cross(upper[-2], upper[-1], point) <= 0:
            upper.pop()
        upper.append(point)
    return np.array(lower[:-1] + upper[:-1], dtype=float)


def load_sources():
    sources = {}
    for key in ['kou-01', 'kou-32', 'kou-54']:
        relative = f'review/{key}-revised.png'
        path = OUTPUT.parent / relative
        image = Image.open(path).convert('RGBA')
        alpha = np.array(image)[:, :, 3]
        bounds = image.getchannel('A').getbbox()
        cx, cy = (bounds[0]+bounds[2])/2, (bounds[1]+bounds[3])/2
        edge = max(bounds[2]-bounds[0], bounds[3]-bounds[1])
        boundary = []
        for y in range(image.height):
            xs = np.flatnonzero(alpha[y])
            if len(xs):
                boundary.extend([(int(xs[0]), y), (int(xs[-1])+1, y), (int(xs[0]), y+1), (int(xs[-1])+1, y+1)])
        polygon = (hull(boundary)-[cx, cy])/edge
        sources[key] = {'path': relative, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
                        'canvas': [image.width, image.height], 'visibleBounds': list(bounds),
                        'visibleCenter': [cx, cy], 'visibleLongEdge': edge, 'polygon': polygon}
    return sources


def balanced_points():
    index = np.arange(72)
    angle = index * math.pi * (3-math.sqrt(5))
    distance = 253 * np.sqrt((index+.5)/72)
    points = CENTER + np.column_stack([distance*np.cos(angle), distance*np.sin(angle)])
    grid = np.arange(70., 631., 5.)
    x, y = np.meshgrid(grid, grid)
    samples = np.column_stack([x.ravel(), y.ravel()])
    samples = samples[np.linalg.norm(samples-CENTER, axis=1) < 268]
    for _ in range(65):
        owners = np.argmin(np.sum((samples[:, None, :]-points[None, :, :])**2, axis=2), axis=1)
        counts = np.bincount(owners, minlength=72)
        points = np.column_stack([np.bincount(owners, weights=samples[:, dim], minlength=72)/counts for dim in range(2)])
    angles = (np.arctan2(points[:, 1]-350, points[:, 0]-350)+math.pi/2) % (2*math.pi)
    return points[np.argsort(angles)]


def pair_profiles(polygons):
    profiles = {}
    for a in range(72):
        for b in range(a+1, 72):
            axes = []
            for polygon in [polygons[a], polygons[b]]:
                edges = np.roll(polygon, -1, axis=0)-polygon
                normals = np.column_stack([-edges[:, 1], edges[:, 0]])
                normals /= np.linalg.norm(normals, axis=1)[:, None]
                axes.extend(normals)
            axes = np.array(axes)
            pa, pb = polygons[a] @ axes.T, polygons[b] @ axes.T
            profiles[a, b] = (axes, pa.min(axis=0), pa.max(axis=0), pb.min(axis=0), pb.max(axis=0))
    return profiles


def separation(a, b, size, profile):
    axes, amin, amax, bmin, bmax = profile
    delta = (b-a) @ axes.T
    positive = size*(amax-bmin)-delta+GAP
    negative = size*(bmax-amin)+delta+GAP
    if np.any(positive <= 0) or np.any(negative <= 0):
        return None
    depths = np.minimum(positive, negative)
    axis = int(np.argmin(depths))
    return axes[axis]*depths[axis]*(1 if positive[axis] < negative[axis] else -1)


def relax(points, polygons, profiles, size):
    targets = points.copy()
    rng = np.random.default_rng(SEED)
    for iteration in range(220):
        corrections = np.zeros_like(points)
        count = 0
        order = rng.permutation(72)
        for offset, a in enumerate(order):
            for b in order[offset+1:]:
                if np.linalg.norm(points[a]-points[b]) > size*1.8+GAP:
                    continue
                lo, hi = sorted([int(a), int(b)])
                move = separation(points[lo], points[hi], size, profiles[lo, hi])
                if move is not None:
                    corrections[lo] -= move*.52
                    corrections[hi] += move*.52
                    count += 1
        points += np.clip(corrections, -3, 3)
        if iteration < 60:
            points += (targets-points)*.003
        for index, polygon in enumerate(polygons):
            vertices = points[index] + polygon*size
            distances = np.linalg.norm(vertices-CENTER, axis=1)
            farthest = int(np.argmax(distances))
            if distances[farthest] > RADIUS-GAP:
                direction = (vertices[farthest]-CENTER)/distances[farthest]
                points[index] -= direction*(distances[farthest]-(RADIUS-GAP))
        if not count and iteration > 60:
            break
    return points


def fits(points, polygons, profiles, size):
    for point, polygon in zip(points, polygons):
        if np.max(np.linalg.norm(point+polygon*size-CENTER, axis=1)) > RADIUS-GAP:
            return False
    for (a, b), profile in profiles.items():
        if np.linalg.norm(points[a]-points[b]) > size*1.8+GAP:
            continue
        if separation(points[a], points[b], size, profile) is not None:
            return False
    return True


def build():
    master = json.loads(MASTER.read_text())['master']
    rows = sorted(master['kou'], key=lambda row: row['order'])
    assert [row['id'] for row in rows] == [f'kou-{i:02}' for i in range(1, 73)]
    sources = load_sources()
    source_ids = [['kou-01']*18, ['kou-32']*18, ['kou-54']*18, ['kou-01', 'kou-32', 'kou-54']*6]
    source_ids = sum(source_ids, [])
    polygons = [sources[key]['polygon'] for key in source_ids]
    profiles = pair_profiles(polygons)
    points = balanced_points()
    for target_size in [48., 52., 56.]:
        points = relax(points, polygons, profiles, target_size)
    low, high = 0., 56.
    for _ in range(18):
        middle = (low+high)/2
        if fits(points, polygons, profiles, middle):
            low = middle
        else:
            high = middle
    size = round(math.floor(low*100)/100-.1, 2)
    points = np.round(points, 3)
    assert fits(points, polygons, profiles, size)
    entries = []
    for index, row in enumerate(rows):
        entries.append({'id': row['id'], 'name': row['name'], 'sekkiId': row['sekkiId'],
                        'season': ['spring', 'summer', 'autumn', 'winter'][index//18],
                        'sourceId': source_ids[index], 'placeholder': row['id'] != source_ids[index],
                        'x': float(points[index, 0]), 'y': float(points[index, 1])})
    result = {'schemaVersion': 1, 'status': 'sample-artwork-layout', 'seed': SEED,
              'masterVersion': master['version'], 'viewBox': [0, 0, 700, 700],
              'packingBoundary': {'cx': 350, 'cy': 350, 'radius': RADIUS},
              'commonVisibleLongEdge': size, 'minimumHullGap': GAP,
              'algorithm': 'sunflower / discrete Lloyd / silhouette-convex-hull relaxation',
              'sources': {key: {k: v for k, v in value.items() if k != 'polygon'} for key, value in sources.items()},
              'entries': entries}
    OUTPUT.write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n')
    print(json.dumps({'path': str(OUTPUT), 'count': len(entries), 'commonVisibleLongEdge': size, 'overlap': False}))


if __name__ == '__main__':
    build()
