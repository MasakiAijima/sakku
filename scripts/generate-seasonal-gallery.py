#!/usr/bin/env python3
"""Generate semantically colored 72-kou concepts through the bundled imagegen CLI."""
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
import fcntl
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import threading
from collections import deque

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('seasonal_generator', ROOT / 'scripts/generate-seasonal-assets.py')
legacy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(legacy)
CLI = legacy.CLI
BUDGET = 10000
RESERVATION = 130
VERSION = 'poc-v3'
RAW = ROOT / 'output/seasonal-assets' / VERSION
PUBLIC = ROOT / 'public/seasonal-assets' / VERSION
CONDITIONS = dict(model='gpt-image-2', size='1024x1024', quality='high', background='opaque', output_format='png', n=1)
STYLE = (
    'Use case: stylized-concept. Asset: one independent Japanese microseason illustration. '
    'The attached image is a STYLE reference only. Preserve its few large flat color planes, '
    'expressive hand-cut organic silhouette, long unequal curves, asymmetric swelling and pinches, '
    'and restrained uneven screen-print ink inside each color field. Do not copy its subject or colors. '
    'Express only the seasonal relationship specified below. One dominant motif occupies most of '
    'the artwork; at most one or two much smaller auxiliary motifs overlap it into one compact composition. '
    'Choose natural, seasonally meaningful colors from the specified palette. Never default to red. '
    'Use broad solid opaque color planes. Silhouette has character and directional flow; avoid '
    'bilateral symmetry, equally spaced petals, repeated geometry and fine outlines. '
    'The static image must be complete; do not add separate parts or gaps for animation. '
    'Center the entire compact artwork within the central 60 percent of the square, with ample '
    'clean empty margin on all sides. Solid chromakey magenta #FF00FF background; no magenta, '
    'hot pink, fuchsia, purple spill or pink reflected lighting in the artwork. Pink petals must '
    'be muted salmon #E9B8B5, distinct from the magenta background. '
    'No faces, eyes, pupils, letters, numerals, titles, borders, frames, realistic shading, '
    'gradients, shadows, translucency, fine veins, repeated decorative dots or textures outside shapes. '
)


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_entries():
    content = json.loads((ROOT / 'data/seasonal-artwork-v3.json').read_text())
    current = json.loads((ROOT / 'data/calendar/current.json').read_text())
    master = json.loads((ROOT / current['path']).read_text())['master']
    entries = content['entries']
    if content['masterVersion'] != master['version'] or len(entries) != 72:
        raise ValueError('Semantic content/master mismatch')
    for entry, canonical in zip(entries, master['kou']):
        if [entry['id'], entry['name'], entry['sekkiId']] != [canonical['id'], canonical['name'], canonical['sekkiId']]:
            raise ValueError('Canonical ID/name/order mismatch')
        if not entry['subjectPrompt'] or not entry['colorReason'] or not 2 <= len(entry['palette']) <= 5:
            raise ValueError('Missing semantic artwork definition')
    return content


def job_for(entry, master_version):
    identity = entry['id']
    if identity in ('kou-01', 'kou-32', 'kou-54'):
        reference = ROOT / f'public/seasonal-assets/poc-v2/review/{identity}-revised.png'
    else:
        reference = PUBLIC / entry['referenceId'] / 'completed.png'
        if not reference.is_file():
            raise ValueError('Generate and review kou-01, kou-32, kou-54 before the other candidates')
    palette = ', '.join(f"{item['hex']} ({item['role']})" for item in entry['palette'])
    prompt = STYLE + '\nSubject and seasonal relation: ' + entry['subjectPrompt'] + '\nSemantic color palette: ' + palette + '\nColor intent: ' + entry['colorReason']
    if identity == 'kou-01':
        prompt += '\nFor this edit keep the broad flowing wind silhouette, ice fragment and droplet of the attached artwork. Change the vermilion wind to pale muted teal #90B8B0. Ice and drop remain pale blue. Absolutely no red or orange wind.'
    elif identity == 'kou-54':
        prompt += '\nFor this edit keep the irregular broad maple lobes and the small ivy of the attached artwork. Change the dominant maple to golden yellow #E3BC45, with a little ochre. Change the blue ivy to natural muted olive #72804A. No red maple or blue ivy.'
    job = dict(id=identity, name=entry['name'], prompt=prompt, conditions=CONDITIONS,
               master_version=master_version, generator_version=3, prompt_version=3,
               operation='edit', reference_path=str(reference), reference_sha256=sha(reference))
    job['hash'] = hashlib.sha256(json.dumps(job, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
    directory = RAW / identity
    job.update(output=str(directory / 'original.png'), provenance=str(directory / 'generation.json'), prompt_path=str(directory / 'prompt.txt'))
    return job


def cutout(original, destination):
    image = Image.open(original).convert('RGB')
    rgb = np.array(image).astype(float)
    red, green, blue = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
    key = (red-green > 65) & (blue-green > 65) & (red > 135) & (blue > 135)
    height, width = key.shape
    background = np.zeros(key.shape, dtype=bool)
    queue = deque()
    for y, x in [(0, x) for x in range(width)] + [(height-1, x) for x in range(width)] + [(y, 0) for y in range(height)] + [(y, width-1) for y in range(height)]:
        if key[y, x] and not background[y, x]:
            background[y, x] = True
            queue.append((y, x))
    while queue:
        y, x = queue.popleft()
        for ny, nx in ((y-1, x), (y+1, x), (y, x-1), (y, x+1)):
            if 0 <= ny < height and 0 <= nx < width and key[ny, nx] and not background[ny, nx]:
                background[ny, nx] = True
                queue.append((ny, nx))
    if background.mean() < .2:
        raise ValueError('Chroma background was not generated')
    # Magenta is excluded from the subject palette, including isolated gaps inside the silhouette.
    background |= key
    alpha = np.full(key.shape, 255., dtype=float)
    alpha[background] = 0
    fringe = (~background) & (red-green > 25) & (blue-green > 25) & (red > 145) & (blue > 145)
    coverage = np.clip(1-(np.minimum(red-green, blue-green)-25)/100, .25, 1)
    alpha[fringe] = coverage[fringe]*255
    for channel, value in enumerate((255, 0, 255)):
        rgb[:, :, channel][fringe] = np.clip((rgb[:, :, channel][fringe]-(1-coverage[fringe])*value)/coverage[fringe], 0, 255)
    rgba = np.dstack([rgb, alpha]).astype('uint8')
    rgba[background, :3] = 0
    artwork = Image.fromarray(rgba)
    bounds = artwork.getchannel('A').getbbox()
    if not bounds or min(bounds[:2]) <= 0 or bounds[2] >= width or bounds[3] >= height:
        raise ValueError('Empty or clipped artwork')
    artwork.save(destination)
    visible = artwork.crop(bounds)
    scale = 306/max(visible.size)
    target = tuple(round(value*scale) for value in visible.size)
    visible = visible.resize(target, Image.Resampling.LANCZOS)
    canvas = Image.new('RGBA', (512, 512))
    canvas.alpha_composite(visible, ((512-target[0])//2, (512-target[1])//2))
    return canvas


def publish(content):
    PUBLIC.mkdir(parents=True, exist_ok=True)
    rows = []
    for entry in content['entries']:
        row = dict(entry, status='pending')
        record_path = RAW / entry['id'] / 'generation.json'
        if record_path.is_file():
            record = json.loads(record_path.read_text())
            row['status'] = record['status'] if record['status'] in ('succeeded', 'failed') else 'pending'
            if row['status'] == 'succeeded' and (PUBLIC / entry['id'] / 'completed.png').is_file():
                row['image'] = entry['id'] + '/completed.png'
                row['original'] = entry['id'] + '/full.png'
                row['generationHash'] = record['hash']
            elif row['status'] == 'succeeded':
                row['status'] = 'pending'
        rows.append(row)
    legacy.atomic_json(PUBLIC / 'gallery.json', dict(schemaVersion=3, model='gpt-image-2', quality='high', entries=rows))


def execute(content, jobs, concurrency):
    env = legacy.environment(ROOT)
    if importlib.util.find_spec('openai') is None:
        raise ValueError('OpenAI SDK missing before any reservation or API call')
    if not env.get('OPENAI_API_KEY') or not CLI.is_file():
        raise ValueError('Configured API key or bundled CLI missing')
    base = RAW.parent
    base.mkdir(parents=True, exist_ok=True)
    with (base / '.generation.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        todo = legacy.pending(jobs)
        ledger_path = base / 'budget-ledger.json'
        ledger = json.loads(ledger_path.read_text())
        reserved = sum(entry['reserved_jpy'] for entry in ledger['entries'])
        if ledger['budget_jpy'] != BUDGET or reserved + len(todo)*RESERVATION > BUDGET:
            raise ValueError('Cumulative authorized budget exceeded before API calls')
        guard = threading.Lock()
        stop = threading.Event()
        def run(job):
            if stop.is_set():
                return False
            directory = Path(job['output']).parent
            directory.mkdir(parents=True, exist_ok=True)
            if sha(Path(job['reference_path'])) != job['reference_sha256']:
                raise ValueError('Reference changed after planning')
            now = datetime.now(timezone.utc).isoformat()
            entry = dict(id=job['id'], hash=job['hash'], output=job['output'], reserved_jpy=RESERVATION, attempted_at=now, status='attempted')
            record = dict(job, attempted_at=now, status='attempted', reserved_jpy=RESERVATION, actual_cost_jpy=None)
            with guard:
                if sum(item['reserved_jpy'] for item in ledger['entries']) + RESERVATION > BUDGET:
                    raise ValueError('Budget exceeded')
                ledger['entries'].append(entry)
                legacy.atomic_json(ledger_path, ledger)
                legacy.atomic_json(Path(job['provenance']), record)
                Path(job['prompt_path']).write_text(job['prompt'])
            try:
                command = [sys.executable, str(CLI), 'edit', '--image', job['reference_path'], '--prompt-file', job['prompt_path'], '--out', job['output'], '--no-augment']
                for key, value in CONDITIONS.items():
                    command += ['--'+key.replace('_', '-'), str(value)]
                result = subprocess.run(command, env=env, capture_output=True, timeout=600)
                if result.returncode:
                    diagnostic = result.stderr.decode('utf8', errors='replace')
                    allowed = ['insufficient_quota', 'rate_limit_exceeded', 'invalid_api_key', 'model_not_found', 'billing_hard_limit_reached', 'organization_verification_required']
                    record['error_category'] = next((name for name in allowed if name in diagnostic), 'cli_failed')
                    if record['error_category'] in ('insufficient_quota', 'invalid_api_key', 'billing_hard_limit_reached', 'model_not_found'):
                        stop.set()
                    raise ValueError('Generation failed')
                legacy.validate_image(Path(job['output']))
                cutout_path = directory / 'cutout.png'
                completed = cutout(Path(job['output']), cutout_path)
                target = PUBLIC / job['id']
                target.mkdir(parents=True, exist_ok=True)
                Image.open(cutout_path).save(target / 'full.png')
                completed.save(target / 'completed.png')
                completed.save(target / 'completed.webp', lossless=True, method=6)
                record.update(status='succeeded', image_sha256=sha(Path(job['output'])), completed_sha256=sha(target / 'completed.png'), cutout_sha256=sha(cutout_path))
                entry['status'] = 'succeeded'
            except Exception as error:
                record['status'] = entry['status'] = 'failed'
                record['error'] = 'Generation or processing failed; reservation retained.'
                if isinstance(error, ValueError) and str(error) in ('Empty or clipped artwork', 'Chroma background was not generated'):
                    record['error_category'] = str(error)
            with guard:
                legacy.atomic_json(Path(job['provenance']), record)
                legacy.atomic_json(ledger_path, ledger)
                publish(content)
            print(job['id']+' '+record['status']+' '+record.get('error_category', ''), flush=True)
            return record['status'] == 'succeeded'
        with ThreadPoolExecutor(max_workers=concurrency) as executor:
            results = [future.result() for future in as_completed([executor.submit(run, job) for job in todo])]
        return all(results)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    selection = parser.add_mutually_exclusive_group()
    selection.add_argument('--ids')
    selection.add_argument('--all', action='store_true')
    parser.add_argument('--execute', action='store_true')
    parser.add_argument('--publish', action='store_true')
    parser.add_argument('--concurrency', type=int, choices=range(1, 5), default=4)
    args = parser.parse_args()
    content = load_entries()
    if args.publish:
        publish(content)
        return 0
    ids = args.ids.split(',') if args.ids else [entry['id'] for entry in content['entries']]
    if len(set(ids)) != len(ids) or not set(ids) <= {row['id'] for row in content['entries']}:
        raise ValueError('Invalid candidate selection')
    jobs = [job_for(entry, content['masterVersion']) for entry in content['entries'] if entry['id'] in ids]
    todo = legacy.pending(jobs)
    ledger = json.loads((RAW.parent / 'budget-ledger.json').read_text())
    total = sum(entry['reserved_jpy'] for entry in ledger['entries']) + len(todo)*RESERVATION
    if not args.execute:
        print(json.dumps(dict(count=len(jobs), pending=len(todo), model='gpt-image-2', quality='high', projected_reserved_jpy=total, budget_jpy=BUDGET, fits_budget=total <= BUDGET), indent=2))
        return 0
    return 0 if execute(content, jobs, args.concurrency) else 1


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except Exception:
        print('Gallery generation refused or failed. Check definitions, provenance, budget and safe status records. Credential diagnostics are suppressed.', file=sys.stderr)
        raise SystemExit(1)
