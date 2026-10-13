#!/usr/bin/env python3
"""Generate isolated revisions; publish only after visual approval."""
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
import fcntl
import hashlib
import importlib.util
import json
import re
from pathlib import Path
import shutil
import subprocess
import sys
import threading

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('revision_base', ROOT / 'scripts/generate-seasonal-gallery.py')
base = importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)
REVISION = 'revision-12'
RAW = ROOT / 'output/seasonal-assets' / REVISION
PUBLIC = ROOT / 'public/seasonal-assets' / REVISION
GALLERY = ROOT / 'public/seasonal-assets/poc-v3/gallery.json'
INPUT = ROOT / 'data' / f'seasonal-artwork-{REVISION}.json'
POLICY = 'user-waived-for-targeted-revision'
EXTRA_STYLE = ('\nThis is a new subject design, not a recoloring of the reference. '
               'Use the reference only for flat color planes, organic contours and print texture. '
               'Never copy its subject silhouette or arrangement. Do not use a curled ribbon, '
               'spiral, swirl or wave-shaped blob as a generic symbol for weather or water. '
               'Follow the specific seasonal scene and distinguishing silhouette below.\n')


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


def load():
    content = json.loads(INPUT.read_text())
    entries = content['entries']
    gallery = json.loads(GALLERY.read_text())
    canonical = {row['id']: row for row in gallery['entries']}
    target_count = content.get('targetCount', 12)
    if not isinstance(target_count, int) or isinstance(target_count, bool) or not 1 <= target_count <= 72:
        raise ValueError('Target count must be between 1 and 72')
    if len(canonical) != 72 or len(gallery['entries']) != 72:
        raise ValueError('Expected 72 canonical gallery entries')
    if len(entries) != target_count or len({row['id'] for row in entries}) != target_count:
        raise ValueError(f'Exactly {target_count} unique revisions required')
    for row in entries:
        if row['id'] not in canonical or row['name'] != canonical[row['id']]['name']:
            raise ValueError('Canonical identity mismatch')
        if not row.get('subjectPrompt') or not row.get('colorReason') or not 2 <= len(row.get('palette', [])) <= 5:
            raise ValueError('Missing revision definition')
    return content


def make_job(row):
    reference = Path(row.get('referencePath') or f"public/seasonal-assets/poc-v2/review/{row['referenceId']}-revised.png")
    if not reference.is_absolute():
        reference = ROOT / reference
    if not reference.is_file():
        raise ValueError('Approved style reference missing')
    palette = ', '.join(f"{item['hex']} ({item['role']})" for item in row['palette'])
    prompt = base.STYLE + EXTRA_STYLE + 'Subject and seasonal relation: ' + row['subjectPrompt']
    prompt += '\nSemantic color palette: ' + palette + '\nColor intent: ' + row['colorReason']
    directory = RAW / row['id']
    identity = dict(id=row['id'], name=row['name'], prompt=prompt, conditions=base.CONDITIONS,
                    reference_sha256=base.sha(reference), generator_version=REVISION + '-v1', operation='edit')
    return dict(identity, hash=digest(identity), reference_source=str(reference), reference_path=str(directory / 'reference.png'),
                output=str(directory / 'original.png'), provenance=str(directory / 'generation.json'),
                prompt_path=str(directory / 'prompt.txt'))


def pending(jobs):
    todo = []
    for job in jobs:
        record_path = Path(job['provenance'])
        if record_path.exists():
            record = json.loads(record_path.read_text())
            target = PUBLIC / job['id']
            if record.get('hash') != job['hash']:
                raise ValueError('Existing revision has changed inputs; archive explicitly before retry')
            if record.get('status') != 'succeeded':
                raise ValueError('Existing unsuccessful revision requires explicit review before retry')
            expected = [('original.png', Path(job['output']), 'image_sha256'),
                        ('completed.png', target / 'completed.png', 'completed_sha256'),
                        ('full.png', target / 'full.png', 'full_sha256'),
                        ('reference.png', Path(job['reference_path']), 'reference_sha256')]
            if any(not path.is_file() or base.sha(path) != record.get(key) for _, path, key in expected):
                raise ValueError('Existing success files do not match provenance')
            if not (target / 'completed.webp').is_file():
                raise ValueError('Existing success WebP missing')
        else:
            if Path(job['output']).exists():
                raise ValueError('Untracked existing original image')
            todo.append(job)
    return todo


def execute(jobs, concurrency):
    if importlib.util.find_spec('openai') is None:
        raise ValueError('OpenAI SDK missing before API call')
    env = base.legacy.environment(ROOT)
    if not env.get('OPENAI_API_KEY') or not base.CLI.is_file():
        raise ValueError('Configured API key or bundled CLI missing')
    stop = threading.Event()
    def run(job):
        if stop.is_set():
            return False
        directory = Path(job['output']).parent
        directory.mkdir(parents=True, exist_ok=True)
        source = Path(job['reference_source'])
        if base.sha(source) != job['reference_sha256']:
            raise ValueError('Style reference changed after planning')
        shutil.copyfile(source, job['reference_path'])
        if base.sha(Path(job['reference_path'])) != job['reference_sha256']:
            raise ValueError('Style reference snapshot mismatch')
        Path(job['prompt_path']).write_text(job['prompt'])
        record = dict(job, status='attempted', attempted_at=datetime.now(timezone.utc).isoformat(),
                      budgetPolicy=POLICY, actualCost=None)
        base.legacy.atomic_json(Path(job['provenance']), record)
        try:
            command = [sys.executable, str(base.CLI), 'edit', '--image', job['reference_path'],
                       '--prompt-file', job['prompt_path'], '--out', job['output'], '--no-augment']
            for key, value in base.CONDITIONS.items():
                command += ['--' + key.replace('_', '-'), str(value)]
            result = subprocess.run(command, env=env, capture_output=True, timeout=600)
            if result.returncode:
                diagnostic = result.stderr.decode('utf8', errors='replace')
                allowed = ('insufficient_quota', 'rate_limit_exceeded', 'invalid_api_key', 'model_not_found',
                           'billing_hard_limit_reached', 'organization_verification_required')
                record['error_category'] = next((key for key in allowed if key in diagnostic), 'cli_failed')
                if record['error_category'] in ('insufficient_quota', 'invalid_api_key', 'model_not_found', 'billing_hard_limit_reached'):
                    stop.set()
                raise ValueError('CLI generation failed')
            base.legacy.validate_image(Path(job['output']))
            completed = base.cutout(Path(job['output']), directory / 'cutout.png')
            target = PUBLIC / job['id']
            target.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(directory / 'cutout.png', target / 'full.png')
            completed.save(target / 'completed.png')
            completed.save(target / 'completed.webp', lossless=True, method=6)
            record.update(status='succeeded', image_sha256=base.sha(Path(job['output'])),
                          completed_sha256=base.sha(target / 'completed.png'),
                          full_sha256=base.sha(target / 'full.png'),
                          cutout_sha256=base.sha(directory / 'cutout.png'))
        except Exception as error:
            record['status'] = 'failed'
            if isinstance(error, subprocess.TimeoutExpired):
                record['error_category'] = 'cli_timeout'
            elif str(error) in ('Empty or clipped artwork', 'Chroma background was not generated'):
                record['error_category'] = 'invalid_cutout'
            record.setdefault('error_category', 'generation_or_processing_failed')
        base.legacy.atomic_json(Path(job['provenance']), record)
        print(job['id'] + ' ' + record['status'] + ' ' + record.get('error_category', ''), flush=True)
        return record['status'] == 'succeeded'
    with ThreadPoolExecutor(max_workers=concurrency) as pool:
        results = [future.result() for future in as_completed([pool.submit(run, job) for job in jobs])]
    return all(results)


def unchanged_snapshot(gallery, selected):
    result = {}
    for row in gallery['entries']:
        if row['id'] in selected:
            continue
        files = {}
        for field in ('image', 'original'):
            path = (GALLERY.parent / row[field].split('?', 1)[0]).resolve()
            files[field] = dict(path=str(path), sha256=base.sha(path))
        result[row['id']] = dict(rowSha256=digest(row), files=files)
    expected = 72 - len(selected)
    if len(result) != expected:
        raise ValueError(f'Expected {expected} untouched entries')
    return result


def publish(content, jobs):
    if pending(jobs):
        raise ValueError(f'All {len(jobs)} revisions must succeed before publishing')
    selected = {row['id'] for row in content['entries']}
    gallery = json.loads(GALLERY.read_text())
    unchanged_count = 72 - len(selected)
    snapshot_name = f'unchanged-{unchanged_count}.json'
    before = RAW / 'before'
    before.mkdir(parents=True, exist_ok=True)
    archive = before / 'gallery.json'
    if not archive.exists():
        shutil.copyfile(GALLERY, archive)
        shutil.copyfile(ROOT / 'data/seasonal-artwork-v3.json', before / 'seasonal-artwork-v3.json')
        base.legacy.atomic_json(before / snapshot_name, unchanged_snapshot(gallery, selected))
    snapshot = json.loads((before / snapshot_name).read_text())
    if unchanged_snapshot(gallery, selected) != snapshot:
        raise ValueError('Unselected rows or image hashes changed before publishing')
    semantic_sha = base.sha(before / 'seasonal-artwork-v3.json')
    if base.sha(ROOT / 'data/seasonal-artwork-v3.json') != semantic_sha:
        raise ValueError('Original semantic data changed')
    definitions = {row['id']: row for row in content['entries']}
    by_id = {job['id']: job for job in jobs}
    for row in gallery['entries']:
        if row['id'] not in selected:
            continue
        revision = definitions[row['id']]
        for key, value in revision.items():
            if key != 'referencePath':
                row[key] = value
        job = by_id[row['id']]
        prefix = '../' + REVISION + '/' + row['id']
        row.update(status='succeeded', image=prefix + '/completed.png?v=' + job['hash'][:12],
                   original=prefix + '/full.png?v=' + job['hash'][:12], generationHash=job['hash'])
    if unchanged_snapshot(gallery, selected) != snapshot:
        raise ValueError('Unselected entries changed during publication')
    base.legacy.atomic_json(GALLERY, gallery)
    saved = json.loads(GALLERY.read_text())
    if unchanged_snapshot(saved, selected) != snapshot:
        raise ValueError('Post-publication unchanged assertion failed')
    base.legacy.atomic_json(RAW / 'publication.json', dict(published_at=datetime.now(timezone.utc).isoformat(),
        ids=sorted(selected), unchangedCount=unchanged_count, unchangedSnapshot=str(before / snapshot_name),
        semanticDataSha256=semantic_sha, budgetPolicy=POLICY, actualCost=None))
    print(f'Published {len(selected)} revisions; {unchanged_count} rows and assets unchanged.')


def main():
    global REVISION, RAW, PUBLIC, INPUT
    parser = argparse.ArgumentParser(description=__doc__)
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument('--execute', action='store_true')
    modes.add_argument('--publish', action='store_true')
    parser.add_argument('--revision', default='revision-12')
    parser.add_argument('--concurrency', type=int, choices=range(1, 4), default=3)
    args = parser.parse_args()
    if not re.fullmatch(r'revision-[a-z0-9-]+', args.revision):
        raise ValueError('Invalid revision name')
    REVISION = args.revision
    RAW = ROOT / 'output/seasonal-assets' / REVISION
    PUBLIC = ROOT / 'public/seasonal-assets' / REVISION
    INPUT = ROOT / 'data' / f'seasonal-artwork-{REVISION}.json'
    content = load()
    jobs = [make_job(row) for row in content['entries']]
    todo = pending(jobs)
    if not args.execute and not args.publish:
        print(json.dumps(dict(count=len(jobs), pending=len(todo), conditions=base.CONDITIONS,
                              budgetPolicy=POLICY, actualCost=None), indent=2))
        return 0
    RAW.mkdir(parents=True, exist_ok=True)
    with (RAW.parent / '.generation.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        # Recheck inside the shared generation/publication lock.
        todo = pending(jobs)
        if args.publish:
            publish(content, jobs)
            return 0
        return 0 if execute(todo, args.concurrency) else 1


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except Exception:
        print('Revision runner refused or failed. Inspect safe provenance and input definitions; credential diagnostics suppressed.', file=sys.stderr)
        raise SystemExit(1)
