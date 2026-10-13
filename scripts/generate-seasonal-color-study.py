#!/usr/bin/env python3
"""Generate isolated, composition-preserving color studies using bundled imagegen."""
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
import uuid

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('seasonal_gallery', ROOT / 'scripts/generate-seasonal-gallery.py')
base = importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)
RAW = ROOT / 'output/seasonal-assets/color-study-10'
PUBLIC = ROOT / 'public/seasonal-assets/color-study-10'
SOURCE = ROOT / 'public/seasonal-assets/poc-v3'
CONDITIONS = base.CONDITIONS
POLICY = 'User explicitly waived the previous budget for these requested color studies.'


def load_jobs(study='color-study-10'):
    if not re.fullmatch(r'color-study-[a-z0-9-]+', study):
        raise ValueError('Invalid study name')
    content = json.loads((ROOT / ('data/seasonal-' + study + '.json')).read_text())
    entries = content['entries']
    target_count = content.get('targetCount', 10)
    if type(target_count) is not int or not 1 <= target_count <= 72:
        raise ValueError('Expected target count between one and 72')
    if len(entries) != target_count or len({entry['id'] for entry in entries}) != target_count:
        raise ValueError('Expected target count of unique studies')
    jobs = []
    for entry in entries:
        source = (SOURCE / entry['sourcePath']).resolve()
        if not source.is_relative_to((ROOT / 'public/seasonal-assets').resolve()):
            raise ValueError('Source outside artwork directory')
        if not source.is_file() or not entry['prompt'].strip():
            raise ValueError('Missing source or prompt')
        identity = dict(id=entry['id'], prompt=entry['prompt'], reference_sha256=base.sha(source), conditions=CONDITIONS)
        digest = hashlib.sha256(json.dumps(identity, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
        jobs.append(dict(entry=entry, source=source, hash=digest, reference_sha256=identity['reference_sha256']))
    return content, jobs


def pending(jobs, retry_failed=False):
    todo = []
    for job in jobs:
        directory = RAW / job['entry']['id']
        record_path = directory / 'generation.json'
        if record_path.exists():
            record = json.loads(record_path.read_text())
            if record['hash'] != job['hash']:
                raise ValueError('Changed job requires new study/version')
            if record['status'] != 'succeeded':
                if retry_failed and record['status'] in ('failed','attempted'):
                    todo.append(job)
                    continue
                raise ValueError('Unsuccessful job requires explicit retry review')
            target = PUBLIC / job['entry']['id'] / 'completed.png'
            if not target.is_file() or base.sha(target) != record['completed_sha256']:
                raise ValueError('Successful output missing or changed')
            original=directory/'original.png'
            if not original.is_file() or base.sha(original)!=record.get('image_sha256'):
                raise ValueError('Successful original missing or changed')
        elif directory.exists() or (PUBLIC / job['entry']['id']).exists():
            raise ValueError('Existing untracked output will not be overwritten')
        else:
            todo.append(job)
    return todo


def archive_retry(job):
    identity=job['entry']['id']
    source=RAW/identity
    if not (source/'generation.json').exists():return
    record=json.loads((source/'generation.json').read_text())
    if record.get('hash')!=job['hash'] or record.get('status') not in ('failed','attempted'):
        raise ValueError('Only matching reviewed failed attempts can be archived')
    parent=RAW/'review/retries'/identity
    parent.mkdir(parents=True,exist_ok=True)
    unique=datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')+'-'+uuid.uuid4().hex[:8]
    staging=parent/('.'+unique)
    final=parent/unique
    staging.mkdir()
    moved=[]
    try:
        for original,label in [(source,'raw'),(PUBLIC/identity,'public')]:
            if original.exists():
                original.rename(staging/label)
                moved.append((original,label))
        staging.rename(final)
    except BaseException:
        for original,label in reversed(moved):
            if (staging/label).exists():(staging/label).rename(original)
        if staging.exists():staging.rmdir()
        raise


def publish(content, jobs):
    rows = []
    for job in jobs:
        if base.sha(job['source']) != job['reference_sha256']:
            raise ValueError('Current artwork changed during color study')
        row = dict(job['entry'], status='pending', sourceSha256=job['reference_sha256'])
        row['sourceImage'] = '../poc-v3/' + job['entry']['sourcePath']
        path = RAW / job['entry']['id'] / 'generation.json'
        if path.exists():
            record = json.loads(path.read_text())
            row['status'] = record['status'] if record['status'] in ('succeeded', 'failed') else 'pending'
            if record['status'] == 'succeeded':
                row.update(image=job['entry']['id']+'/completed.png', original=job['entry']['id']+'/full.png', generationHash=record['hash'])
        rows.append(row)
    PUBLIC.mkdir(parents=True, exist_ok=True)
    base.legacy.atomic_json(PUBLIC / 'manifest.json', dict(schemaVersion=1, model=CONDITIONS['model'], quality=CONDITIONS['quality'], budgetPolicy=POLICY, entries=rows))


def execute(content, jobs, concurrency, selected=None, retry_failed=False):
    if importlib.util.find_spec('openai') is None:
        raise ValueError('SDK missing before API calls')
    env = base.legacy.environment(ROOT)
    if not env.get('OPENAI_API_KEY') or not base.CLI.is_file():
        raise ValueError('Configured credentials or bundled CLI missing')
    RAW.parent.mkdir(parents=True, exist_ok=True)
    with (RAW.parent / '.generation.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        for job in jobs:
            previous=RAW/job['entry']['id']/'generation.json'
            if previous.exists() and json.loads(previous.read_text()).get('hash')!=job['hash']:
                raise ValueError('Changed job requires new study/version')
        selection=jobs if selected is None else selected
        todo = pending(selection,retry_failed=retry_failed)
        if retry_failed:
            for job in todo:archive_retry(job)
        todo=pending(selection)
        guard = threading.Lock()
        stop = threading.Event()
        publish(content, jobs)
        def run(job):
            if stop.is_set():
                return False
            identity = job['entry']['id']
            directory = RAW / identity
            directory.mkdir(parents=True, exist_ok=False)
            if base.sha(job['source']) != job['reference_sha256']:
                raise ValueError('Source changed before snapshot')
            reference = directory / 'reference.png'
            shutil.copyfile(job['source'], reference)
            if base.sha(reference) != job['reference_sha256']:
                raise ValueError('Source changed while snapshotting')
            prompt = directory / 'prompt.txt'
            prompt.write_text(job['entry']['prompt'])
            original = directory / 'original.png'
            record = dict(id=identity, hash=job['hash'], source_path=str(job['source']), reference_path=str(reference), reference_sha256=job['reference_sha256'], prompt=job['entry']['prompt'], conditions=CONDITIONS, budgetPolicy=POLICY, actual_cost_jpy=None, status='attempted', attempted_at=datetime.now(timezone.utc).isoformat())
            base.legacy.atomic_json(directory / 'generation.json', record)
            try:
                command = [sys.executable, str(base.CLI), 'edit', '--image', str(reference), '--prompt-file', str(prompt), '--out', str(original), '--no-augment']
                for key, value in CONDITIONS.items():
                    command.extend(['--'+key.replace('_', '-'), str(value)])
                result = subprocess.run(command, env=env, capture_output=True, timeout=600)
                if result.returncode:
                    diagnostic = result.stderr.decode('utf8', errors='replace')
                    allowed = ('insufficient_quota', 'rate_limit_exceeded', 'invalid_api_key', 'model_not_found', 'billing_hard_limit_reached', 'organization_verification_required')
                    record['error_category'] = next((value for value in allowed if value in diagnostic), 'cli_failed')
                    if record['error_category'] in ('insufficient_quota', 'invalid_api_key', 'model_not_found', 'billing_hard_limit_reached'):
                        stop.set()
                    raise ValueError('CLI failed')
                base.legacy.validate_image(original)
                cutout = directory / 'cutout.png'
                completed = base.cutout(original, cutout)
                target = PUBLIC / identity
                target.mkdir(parents=True, exist_ok=False)
                shutil.copyfile(cutout, target / 'full.png')
                completed.save(target / 'completed.png')
                completed.save(target / 'completed.webp', lossless=True, method=6)
                record.update(status='succeeded', image_sha256=base.sha(original), completed_sha256=base.sha(target / 'completed.png'), cutout_sha256=base.sha(cutout))
            except Exception:
                record.update(status='failed', error_category=record.get('error_category', 'generation_or_processing_failed'))
            with guard:
                base.legacy.atomic_json(directory / 'generation.json', record)
                publish(content, jobs)
            print(identity+' '+record['status']+' '+record.get('error_category', ''), flush=True)
            return record['status'] == 'succeeded'
        with ThreadPoolExecutor(max_workers=concurrency) as pool:
            results = [future.result() for future in as_completed([pool.submit(run, job) for job in todo])]
        return all(results)


def main():
    global RAW, PUBLIC
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--study', default='color-study-10')
    parser.add_argument('--execute', action='store_true')
    parser.add_argument('--ids')
    parser.add_argument('--retry-failed',action='store_true')
    parser.add_argument('--concurrency', type=int, choices=range(1, 4), default=3)
    args = parser.parse_args()
    if args.retry_failed and (not args.execute or not args.ids):
        parser.error('--retry-failed requires --execute and explicit --ids')
    if not re.fullmatch(r'color-study-[a-z0-9-]+', args.study):
        raise ValueError('Invalid study name')
    RAW = ROOT / 'output/seasonal-assets' / args.study
    PUBLIC = ROOT / 'public/seasonal-assets' / args.study
    content, jobs = load_jobs(args.study)
    selected=jobs
    if args.ids is not None:
        ids=args.ids.split(',')
        lookup={job['entry']['id']:job for job in jobs}
        if len(set(ids))!=len(ids) or any(identity not in lookup for identity in ids):
            parser.error('--ids must be unique study IDs')
        selected=[lookup[identity] for identity in ids]
    if not args.execute:
        todo=pending(selected)
        print(json.dumps(dict(count=len(jobs), pending=len(todo), conditions=CONDITIONS, budgetPolicy=POLICY), ensure_ascii=False, indent=2))
        return 0
    return 0 if execute(content, jobs, args.concurrency,selected=selected,retry_failed=args.retry_failed) else 1


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except Exception:
        print('Color study refused or failed; inspect safe provenance records. Credential diagnostics suppressed.', file=sys.stderr)
        raise SystemExit(1)
