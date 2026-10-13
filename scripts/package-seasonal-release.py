#!/usr/bin/env python3
"""Package approved C/C′ artwork offline; full releases remain candidates for review."""
import argparse
import fcntl
from datetime import datetime, timezone
import hashlib
import json
import math
import re
import shutil
import tempfile
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
IDS = [f'kou-{i:02}' for i in range(1, 73)]
ALGORITHM = 'organic-growth-48-v2'
SUPPORTED_ALGORITHMS = {'organic-growth-48-v1', ALGORITHM}
FILES = {'initial':'initial.png','completed':'completed.png','transition':'transition.webp','idle':'idle.png','provenance':'provenance.json'}


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read(path):
    return json.loads(path.read_text())


def write(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2)+'\n')


def rgba(path):
    with Image.open(path) as image:
        image.load()
        if image.mode != 'RGBA' or image.size != (512,512):
            raise ValueError(f'Expected transparent 512 RGBA: {path}')
        result = image.copy()
    if result.getchannel('A').getextrema()[0] != 0 or not result.getchannel('A').getbbox():
        raise ValueError(f'Invalid transparency: {path}')
    return result


def visual_equal(a,b):
    aa,bb=np.asarray(a),np.asarray(b)
    return np.array_equal(aa[:,:,3],bb[:,:,3]) and np.array_equal(aa[aa[:,:,3]>0],bb[bb[:,:,3]>0])


def transition(initial, completed, index, seed, visible_edge=43.24):
    cx,cy=seed
    radius=max(math.hypot(x-cx,y-cy) for x,y in [(0,0),(512,0),(0,512),(512,512)])*1.35
    frames=[initial]
    for i in range(1,11):
        t=i/11
        r=radius*t*t*(3-2*t)
        points=[]
        for k in range(48):
            angle=k/48*math.pi*2
            wobble=1+.12*math.sin(3*angle+t*6+index*.71)+.065*math.sin(7*angle-t*4+index)+.025*math.sin(13*angle+t*9)
            points.append((round((cx+math.cos(angle)*r*wobble)*4),round((cy+math.sin(angle)*r*wobble)*4)))
        mask=Image.new('L',(2048,2048))
        ImageDraw.Draw(mask).polygon(points,fill=255)
        mask=mask.resize((512,512),Image.Resampling.LANCZOS).filter(ImageFilter.GaussianBlur(.12*306/visible_edge))
        # Replace pixels under the reveal instead of alpha-compositing C onto C′ twice.
        frames.append(Image.composite(completed,initial,mask))
    frames.append(completed)
    return frames


def validate_asset(folder,entry,source_initial=None,source_completed=None):
    if entry.get('width')!=512 or entry.get('height')!=512 or entry.get('anchor')!={'x':.5,'y':.5} or entry.get('transparent') is not True or entry.get('colorSpace')!='sRGB':
        raise ValueError('Invalid asset geometry metadata')
    if entry.get('animation',{}).get('durationMs')!=720 or entry['animation'].get('loop') is not False or entry['animation'].get('idle')!='static':
        raise ValueError('Invalid animation metadata')
    for state,filename in FILES.items():
        path=folder/filename
        if not path.is_file() or digest(path)!=entry['hashes'][state]:
            raise ValueError(f'Asset hash mismatch: {path}')
    initial,completed,idle=[rgba(folder/FILES[s]) for s in ['initial','completed','idle']]
    if not visual_equal(idle,completed) or (folder/'idle.png').read_bytes()!=(folder/'completed.png').read_bytes():
        raise ValueError('Idle must equal completed')
    if source_initial and (folder/'initial.png').read_bytes()!=source_initial.read_bytes():
        raise ValueError('Initial source differs')
    if source_completed and (folder/'completed.png').read_bytes()!=source_completed.read_bytes():
        raise ValueError('Completed source differs')
    box=completed.getchannel('A').getbbox()
    if list(box)!=entry['visibleBounds'] or list(initial.getchannel('A').getbbox())!=entry['precursorBounds']:
        raise ValueError('Bounds differ')
    motion=entry['motionBounds']
    if motion!={'x':box[0],'y':box[1],'width':box[2]-box[0],'height':box[3]-box[1]}:
        raise ValueError('Motion bounds differ')
    with Image.open(folder/'transition.webp') as animation:
        count=animation.n_frames
        if count<2 or count!=entry['animation']['frames'] or animation.info.get('loop')!=1:
            raise ValueError('Invalid animation count/loop')
        duration=0
        for frame in range(count):
            animation.seek(frame);animation.load()
            image=animation.convert('RGBA')
            b=image.getchannel('A').getbbox()
            if image.size!=(512,512) or not b or b[0]<box[0] or b[1]<box[1] or b[2]>box[2] or b[3]>box[3]:
                raise ValueError('Animation escapes C bounds')
            duration+=animation.info['duration']
            if frame==0 and not visual_equal(image,initial): raise ValueError('First frame differs')
            if frame==count-1 and not visual_equal(image,completed): raise ValueError('Last frame differs')
        if duration!=720: raise ValueError('Animation duration differs')
    provenance=read(folder/'provenance.json')
    placement=entry.get('placement',{})
    if any(type(placement.get(key)) not in [int,float] or not math.isfinite(placement[key]) for key in ['x','y']) or placement.get('visibleLongEdge')!=306:
        raise ValueError('Invalid placement geometry')
    if placement.get('visibleCenter')!=[(box[0]+box[2])/2,(box[1]+box[3])/2]:
        raise ValueError('Invalid visible center')
    expected_seed=[(entry['precursorBounds'][0]+entry['precursorBounds'][2])/2,(entry['precursorBounds'][1]+entry['precursorBounds'][3])/2]
    if entry['animation'].get('seed')!=expected_seed:
        raise ValueError('Invalid animation seed')
    if provenance.get('sourceGeometry')!={'placement':placement,'visibleBounds':entry['visibleBounds'],'precursorBounds':entry['precursorBounds']}:
        raise ValueError('Source geometry differs')
    if provenance.get('algorithmVersion') not in SUPPORTED_ALGORITHMS or provenance.get('kouId')!=entry['kouId']:
        raise ValueError('Invalid provenance')
    if provenance['algorithmVersion']==ALGORITHM:
        expected_prompt='sha256:'+hashlib.sha256(provenance['prompt'].encode('utf8')).hexdigest()
        if provenance.get('assetVersion')!=folder.parent.name or provenance.get('promptVersion')!=expected_prompt or provenance.get('provider')!='openai':
            raise ValueError('Invalid versioned provenance')
        timestamp=datetime.fromisoformat(provenance['processedAtUTC'])
        if timestamp.utcoffset()!=timezone.utc.utcoffset(timestamp):raise ValueError('Processing timestamp must be UTC')


def input_jobs(root, completed_study='color-study-c72', initial_study='color-study-cprime72'):
    for study in [completed_study,initial_study]:
        if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_-]{0,63}',study):
            raise ValueError('Study must be a safe directory name')
    base=root/'public/seasonal-assets'
    c,prime=base/completed_study,base/initial_study
    layout,pl=read(c/'layout.json'),read(prime/'layout.json')
    manifest,pm=read(c/'manifest.json'),read(prime/'manifest.json')
    for document in [layout,pl,manifest,pm]:
        if [e['id'] for e in document['entries']]!=IDS: raise ValueError('Expected canonical 72 entries')
    jobs={}
    for index,e in enumerate(layout['entries']):
        identity=e['id'];s=layout['sources'][identity];p=pl['sources'][identity]
        full,initial=c/s['path'],prime/p['path']
        generation=root/'output/seasonal-assets'/completed_study/identity/'generation.json'
        if digest(full)!=s['sha256'] or digest(initial)!=p['sha256']: raise ValueError('Source layout hash differs')
        payload={'algorithmVersion':ALGORITHM,'entry':e,'source':s,'precursor':p,
                 'cManifest':manifest['entries'][index],'primeManifest':pm['entries'][index],
                 'generation':read(generation),'generationSha256':digest(generation),
                 'layout':{'viewBox':layout['viewBox'],'commonVisibleLongEdge':layout['commonVisibleLongEdge']}}
        fingerprint=hashlib.sha256(json.dumps(payload,sort_keys=True,ensure_ascii=False).encode()).hexdigest()
        jobs[identity]=(full,initial,payload,fingerprint)
    return layout,jobs


def package_one(release,identity,job):
    full,initial,payload,fingerprint=job
    destination=release/identity
    if destination.exists():
        record=read(destination/'record.json')
        if record.get('fingerprint')!=fingerprint: raise ValueError('Changed inputs require a new version')
        validate_asset(destination,record['asset'],initial,full)
        return record['asset']
    temporary=Path(tempfile.mkdtemp(prefix='.'+identity+'-',dir=release))
    try:
        completed,precursor=rgba(full),rgba(initial)
        box=completed.getchannel('A').getbbox();pbox=precursor.getchannel('A').getbbox()
        if not (box[0]<=pbox[0] and box[1]<=pbox[1] and box[2]>=pbox[2] and box[3]>=pbox[3]):
            raise ValueError('Cprime escapes C bounds')
        seed=[(pbox[0]+pbox[2])/2,(pbox[1]+pbox[3])/2]
        frames=transition(precursor,completed,IDS.index(identity),seed,payload['layout']['commonVisibleLongEdge'])
        for source,name in [(initial,'initial.png'),(full,'completed.png'),(full,'idle.png')]: shutil.copyfile(source,temporary/name)
        frames[0].save(temporary/'transition.webp',save_all=True,append_images=frames[1:],duration=60,
                       loop=1,lossless=True,exact=True,method=4,minimize_size=False)
        with Image.open(temporary/'transition.webp') as webp: count=webp.n_frames
        generation={key:payload['generation'][key] for key in ['id','hash','reference_sha256','conditions','prompt','attempted_at','completed_sha256','reused_from'] if key in payload['generation']}
        if 'reused_from' in generation and (not isinstance(generation['reused_from'],str) or Path(generation['reused_from']).is_absolute()):
            del generation['reused_from']
        provenance={'kouId':identity,'algorithmVersion':ALGORITHM,'inputFingerprint':fingerprint,
                    'assetVersion':release.name,'promptVersion':'sha256:'+hashlib.sha256(generation.get('prompt','').encode('utf8')).hexdigest(),
                    'processedAtUTC':datetime.now(timezone.utc).isoformat(),'provider':'openai',
                    'generation':generation,'sourceGeometry':{'placement':{'x':payload['entry']['x'],'y':payload['entry']['y'],'visibleCenter':payload['source']['visibleCenter'],'visibleLongEdge':payload['source']['visibleLongEdge']},'visibleBounds':list(box),'precursorBounds':list(pbox)},'sourceHashes':{'C':digest(full),'Cprime':digest(initial),'generation':payload['generationSha256']},
                    'model':generation.get('conditions',{}).get('model'),'conditions':generation.get('conditions'),
                    'prompt':generation.get('prompt'),'generatedAt':generation.get('attempted_at'),
                    'actualCost':None,'license':{'reference':'user-provided reference artwork','rightsReview':'user approved C and Cprime; reference ownership not independently verified'},
                    'alphaComparison':'Endpoint visible RGBA and alpha exact; RGB under fully transparent pixels is immaterial'}
        write(temporary/'provenance.json',provenance)
        e=payload['entry'];s=payload['source']
        entry={'kouId':identity,'name':e['name'],'width':512,'height':512,'anchor':{'x':.5,'y':.5},'transparent':True,'colorSpace':'sRGB',
               'placement':{'x':e['x'],'y':e['y'],'visibleCenter':s['visibleCenter'],'visibleLongEdge':s['visibleLongEdge']},
               'visibleBounds':list(box),'precursorBounds':list(pbox),
               'motionBounds':{'x':box[0],'y':box[1],'width':box[2]-box[0],'height':box[3]-box[1]},
               'animation':{'seed':seed,'durationMs':720,'frames':count,'loop':False,'idle':'static'}}
        entry.update({state:f'{identity}/{filename}' for state,filename in FILES.items()})
        entry['hashes']={state:digest(temporary/filename) for state,filename in FILES.items()}
        validate_asset(temporary,entry,initial,full)
        write(temporary/'record.json',{'fingerprint':fingerprint,'asset':entry})
        temporary.rename(destination)
        return entry
    finally:
        if temporary.exists():shutil.rmtree(temporary)


def check(release):
    manifest=read(release/'manifest.json')
    if manifest.get('schemaVersion')!=2 or manifest.get('status') not in ['review','approved'] or manifest.get('version')!=release.name:
        raise ValueError('Invalid release manifest')
    if [e['kouId'] for e in manifest['assets']]!=IDS: raise ValueError('Release must contain canonical 72')
    layout=manifest.get('layout',{})
    edge=layout.get('commonVisibleLongEdge')
    if manifest.get('animation')!={'kind':'organic-growth','durationMs':720,'staggerMs':45,'idle':'static'} or layout.get('viewBox')!=[0,0,700,700] or type(edge) not in [int,float] or not math.isfinite(edge) or not 0<edge<=55.31:
        raise ValueError('Invalid release layout or animation')
    for entry in manifest['assets']:
        identity=entry['kouId']
        if any(entry[state]!=f'{identity}/{filename}' for state,filename in FILES.items()): raise ValueError('Unsafe reference')
        record=read(release/identity/'record.json')
        if record['asset']!=entry or record['fingerprint']!=read(release/identity/'provenance.json')['inputFingerprint']:
            raise ValueError('Record differs')
        validate_asset(release/identity,entry)
    return manifest


def package_locked(root,release,ids,completed_study='color-study-c72',initial_study='color-study-cprime72'):
    layout,jobs=input_jobs(root,completed_study,initial_study)
    if (release/'manifest.json').exists(): check(release)
    for identity in IDS:
        existing=release/identity/'record.json'
        if existing.exists() and read(existing).get('fingerprint')!=jobs[identity][3]:
            raise ValueError('Changed inputs require a new version')
    release.mkdir(parents=True,exist_ok=True)
    for identity in ids: package_one(release,identity,jobs[identity])
    if all((release/i/'record.json').is_file() for i in IDS):
        assets=[]
        for identity in IDS: assets.append(package_one(release,identity,jobs[identity]))
        manifest={'schemaVersion':2,'version':release.name,'status':'review',
                  'layout':{'viewBox':layout['viewBox'],'commonVisibleLongEdge':layout['commonVisibleLongEdge']},
                  'animation':{'kind':'organic-growth','durationMs':720,'staggerMs':45,'idle':'static'},'assets':assets}
        if (release/'manifest.json').exists():
            old=check(release)
            if old['assets']!=assets: raise ValueError('Changed release requires new version')
        else:
            write(release/'.manifest.tmp',manifest);(release/'.manifest.tmp').replace(release/'manifest.json')
            check(release)
    return ids


def package(root,release,ids,completed_study='color-study-c72',initial_study='color-study-cprime72'):
    release.parent.mkdir(parents=True,exist_ok=True)
    with (release.parent/('.'+release.name+'.package.lock')).open('a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        return package_locked(root,release,ids,completed_study,initial_study)


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--version',required=True)
    parser.add_argument('--ids',default='kou-01,kou-32,kou-54')
    parser.add_argument('--all',action='store_true');parser.add_argument('--check',action='store_true')
    parser.add_argument('--release-root',type=Path)
    parser.add_argument('--completed-study',default='color-study-c72')
    parser.add_argument('--initial-study',default='color-study-cprime72')
    args=parser.parse_args()
    if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_-]{0,63}',args.version):parser.error('Invalid version')
    release=(args.release_root or ROOT/'public/seasonal-assets/releases')/args.version
    try:
        if args.check: check(release);print('Validated canonical 72 release')
        else:
            ids=IDS if args.all else args.ids.split(',')
            if len(set(ids))!=len(ids) or any(i not in IDS for i in ids):raise ValueError('Invalid IDs')
            package(ROOT,release,ids,args.completed_study,args.initial_study);print(f'Validated {len(ids)} assets; current unchanged')
    except (ValueError,OSError,KeyError) as error:parser.exit(1,str(error)+'\n')
