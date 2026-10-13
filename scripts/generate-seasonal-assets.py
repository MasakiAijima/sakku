#!/usr/bin/env python3
"""Plan versioned seasonal originals; --execute calls the bundled imagegen CLI.

Each edit reserves 90 JPY permanently, including uncertain failures and reference
input. This covers a conservative allowance for three SDK attempts, not billed
usage. Dry runs require no key and write nothing. V2 supports only three reviewed
seasonal relations. Other candidates require motif reduction before expansion.
"""
import argparse
import datetime
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import sys
import subprocess
import tempfile
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
CLI = Path.home() / '.codex/skills/.system/imagegen/scripts/image_gen.py'
PROMPT_VERSION = 2
RESERVATION_JPY = 90
CONDITIONS = dict(model='gpt-image-2', size='1024x1024', quality='medium',
                  background='opaque', output_format='png', n=1)
STYLE = (
    'Redesign the attached faceless seasonal artwork. Use it as the style reference '
    'for unequal areas of color, long curves and how shapes overlap, not just its colors. '
    'Express one seasonal moment with a few large flat color fields and expressive '
    'organic contours. Choose one dominant motif first; use only one or two auxiliary '
    'motifs, much smaller than the dominant one. Draw long curves, uneven swelling '
    'and shallow and deep pinches. Avoid equal petals, mechanical repetition and '
    'internal bilateral symmetry. Create directional flow through leaning and '
    'projecting silhouettes. Choose only the necessary 2-4 colors from #D94B35 '
    '#ED8B35 #3159A7 #E3BC45 #72804A #E9B8B5 #B9D5DE #B58A50 #F5F3ED, '
    'giving the dominant color the largest area. Keep subtle uneven ink printing '
    'inside the fields, supporting the shapes. Make a complete static composition; '
    'do not separate parts or add gaps for animation. Keep the motif inside the '
    'central 60 percent of a square canvas. Solid chromakey magenta #FF00FF '
    'background only; no magenta in the artwork. No faces, eyes, text, logos, '
    'outlines, frames, shadows, gradients, translucency or fine decorative details. '
)
REFERENCES = {
    'kou-01': '01-east-wind-thaw.png',
    'kou-32': '03-lotus-opens.png',
    'kou-54': '05-maple-colors.png',
}
MOTIFS = {
    'kou-01': 'One broad warm wind ribbon dominates, leaning across the image with a long '
              'uneven sweeping contour and pinched turn. One small pale blue melting ice '
              'piece and one tiny droplet overlap its lower edge. Show warm wind loosening '
              'ice through this single relation. No plants, flowers or extra wind bands.',
    'kou-32': 'One large pink lotus flower leans to one side. Use only two or three broad petal masses, '
              'unequal in width and height, with long irregular curves and asymmetric '
              'overlap. One small muted green leaf sits close below it. Show the flower '
              'beginning to open. No visible flower center, stamens, water or extra leaves.',
    'kou-54': 'One large vermilion maple leaf dominates, tilting with irregular broad lobes '
              'of unequal size and curved uneven edges. One much smaller cobalt blue ivy '
              'leaf overlaps near its base. Show a colored maple overlapping a smaller ivy, with the blue '
              'ivy supporting the red silhouette. No yellow twig, branches, berries, extra leaves or fine veins.',
}


def environment(root):
    env = dict(os.environ)
    path = root / '.env.local'
    if path.exists():
        for line in path.read_text().splitlines():
            match = re.fullmatch(r'\s*(?:export\s+)?(IMAGE_MODEL|OPENAI_API_KEY)\s*=\s*(.*?)\s*', line)
            if match and match[1] not in env:
                env[match[1]] = match[2].strip('\"\'')
    return env


def plan(root, ids, version, model):
    if model != 'gpt-image-2':
        raise ValueError('Model budget requires revalidation')
    rows = []
    for line in (root / 'docs/seasonal-motif-spec.md').read_text().splitlines():
        if re.match(r'^\|\s*kou-', line):
            cells = [cell.strip() for cell in line.strip().strip('|').split('|')]
            if len(cells) != 7 or any(not cell or len(cell) > 2000 for cell in cells):
                raise ValueError('Malformed motif table row')
            rows.append(cells)
    current = json.loads((root / 'data/calendar/current.json').read_text())
    master = json.loads((root / current['path']).read_text())['master']
    if len(rows) != 72 or len(master['kou']) != 72:
        raise ValueError('Expected 72 motifs and master entries')
    for row, entry in zip(rows, master['kou']):
        if row[:3] != [entry['id'], entry['sekki'], entry['name']]:
            raise ValueError('Motif ID/order/name mismatch')
    lookup = {row[0]: row for row in rows}
    if len(set(ids)) != len(ids) or any(identity not in lookup for identity in ids):
        raise ValueError('Expected unique canonical IDs')
    if any(identity not in MOTIFS for identity in ids):
        raise ValueError('V2 supports only kou-01, kou-32 and kou-54. Reduce every other motif to one seasonal relation before --all.')
    jobs = []
    for identity in ids:
        row = lookup[identity]
        prompt = STYLE + MOTIFS[identity]
        reference = root / 'output/imagegen/microseason-samples-v2' / REFERENCES[identity]
        reference_hash = hashlib.sha256(reference.read_bytes()).hexdigest()
        job = dict(id=identity, name=row[2], prompt=prompt, conditions=CONDITIONS,
                   master_version=master['version'], generator_version=2,
                   prompt_version=PROMPT_VERSION, operation='edit',
                   reference_path=str(reference), reference_sha256=reference_hash)
        job['hash'] = hashlib.sha256(json.dumps(job, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
        directory = root / 'output/seasonal-assets' / version / identity
        job['output'] = str(directory / 'original.png')
        job['provenance'] = str(directory / 'generation.json')
        job['prompt_path'] = str(directory / 'prompt.txt')
        jobs.append(job)
    return jobs


def pending(jobs):
    result = []
    for job in jobs:
        image, record = Path(job['output']), Path(job['provenance'])
        prompt_path = Path(job['prompt_path'])
        if image.exists() or record.exists() or prompt_path.exists():
            old = json.loads(record.read_text()) if record.exists() else {}
            if (image.is_file() and old.get('status') == 'succeeded'
                    and old.get('hash') == job['hash']
                    and prompt_path.is_file() and prompt_path.read_text() == job['prompt']
                    and old.get('image_sha256') == hashlib.sha256(image.read_bytes()).hexdigest()):
                validate_image(image)
                continue
            raise ValueError('Existing original lacks matching provenance. Choose a new version.')
        result.append(job)
    return result


def validate_image(path):
    with Image.open(path) as image:
        if image.format != 'PNG' or image.size != (1024, 1024):
            raise ValueError('Expected a 1024 by 1024 PNG')
        image.verify()
    with Image.open(path) as image:
        image.load()


def atomic_json(path, value):
    with tempfile.NamedTemporaryFile(mode='w', encoding='utf8', dir=path.parent,
                                     delete=False) as stream:
        temporary = Path(stream.name)
        json.dump(value, stream, ensure_ascii=False, indent=2)
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(temporary, path)


def reservations(ledger):
    if ledger.get('budget_jpy') != 1000 or not isinstance(ledger.get('entries'), list):
        raise ValueError('Invalid budget ledger')
    total = 0
    for entry in ledger['entries']:
        value = entry.get('reserved_jpy')
        if type(value) is not int or value < 0:
            raise ValueError('Invalid reservation')
        total += value
    return total


def execute(root, jobs, env):
    if not env.get('OPENAI_API_KEY') or not CLI.is_file():
        raise ValueError('Key or bundled CLI missing')
    base = root / 'output/seasonal-assets'
    base.mkdir(parents=True, exist_ok=True)
    with (base / '.generation.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        todo = pending(jobs)
        for job in todo:
            if hashlib.sha256(Path(job['reference_path']).read_bytes()).hexdigest() != job['reference_sha256']:
                raise ValueError('Reference changed after planning')
        ledger_path = base / 'budget-ledger.json'
        ledger = json.loads(ledger_path.read_text()) if ledger_path.exists() else dict(
            budget_jpy=1000, accounting='conservative reservation, not billed cost', entries=[])
        if reservations(ledger) + RESERVATION_JPY * len(todo) > 1000:
            raise ValueError('Cumulative budget exceeded before any request')
        for job in todo:
            directory = Path(job['output']).parent
            directory.mkdir(parents=True, exist_ok=True)
            timestamp = datetime.datetime.now(datetime.timezone.utc).isoformat()
            entry = dict(id=job['id'], hash=job['hash'], output=job['output'],
                         reserved_jpy=RESERVATION_JPY, attempted_at=timestamp, status='attempted')
            ledger['entries'].append(entry)
            atomic_json(ledger_path, ledger)
            record = dict(job, attempted_at=timestamp, status='attempted',
                          reserved_jpy=RESERVATION_JPY, actual_cost_jpy=None)
            atomic_json(Path(job['provenance']), record)
            Path(job['prompt_path']).write_text(job['prompt'])
            try:
                with tempfile.TemporaryDirectory(prefix='sakku-imagegen-') as temporary:
                    command = [sys.executable, str(CLI), 'edit',
                        '--image', job['reference_path'], '--prompt-file', job['prompt_path'],
                        '--out', job['output'], '--no-augment']
                    for key, value in CONDITIONS.items():
                        command += ['--' + key.replace('_', '-'), str(value)]
                    completed = subprocess.run(command, env=env, capture_output=True, timeout=600)
                    if completed.returncode or not Path(job['output']).is_file():
                        raise RuntimeError('CLI failed')
                    validate_image(Path(job['output']))
                    image = Path(job['output']).read_bytes()
                    record['image_sha256'] = hashlib.sha256(image).hexdigest()
                    record['status'] = entry['status'] = 'succeeded'
            except BaseException:
                record['status'] = entry['status'] = 'failed'
                record['error'] = 'Generation failed or interrupted. Reservation retained.'
                atomic_json(Path(job['provenance']), record)
                atomic_json(ledger_path, ledger)
                raise RuntimeError(record['error']) from None
            atomic_json(Path(job['provenance']), record)
            atomic_json(ledger_path, ledger)
            print(job['id'] + ' succeeded')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    selection = parser.add_mutually_exclusive_group(required=True)
    selection.add_argument('--ids')
    selection.add_argument('--all', action='store_true')
    parser.add_argument('--version', required=True)
    parser.add_argument('--execute', action='store_true')
    args = parser.parse_args()
    if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_-]{0,63}', args.version):
        parser.error('Version must be a plain filename component')
    if args.all:
        parser.error('V2 supports only three reviewed motifs. Reduce every other motif to one seasonal relation before --all.')
    try:
        ids = ['kou-%02d' % number for number in range(1, 73)] if args.all else args.ids.split(',')
        env = environment(ROOT)
        jobs = plan(ROOT, ids, args.version, env.get('IMAGE_MODEL', 'gpt-image-2'))
        todo = pending(jobs)
        if args.execute:
            execute(ROOT, jobs, env)
            return 0
        ledger = ROOT / 'output/seasonal-assets/budget-ledger.json'
        reserved = 0
        if ledger.exists():
            data = json.loads(ledger.read_text())
            reserved = reservations(data)
        print(json.dumps(dict(mode='dry-run', candidates=jobs, pending=len(todo),
            reservation_per_candidate_jpy=RESERVATION_JPY, already_reserved_jpy=reserved,
            projected_reserved_jpy=reserved + len(todo) * RESERVATION_JPY, budget_jpy=1000,
            fits_budget=reserved + len(todo) * RESERVATION_JPY <= 1000), ensure_ascii=False, indent=2))
    except (ValueError, OSError, RuntimeError, json.JSONDecodeError):
        print('Generation refused or failed. Check inputs, provenance, model and budget. Diagnostics are suppressed to protect credentials.', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
