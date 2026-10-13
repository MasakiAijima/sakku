#!/usr/bin/env python3
"""Extract reviewed C accent parts while preserving source pixels and C frame geometry."""
import argparse,hashlib,json,re
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw,ImageFilter
ROOT=Path(__file__).resolve().parents[1]
BASE=ROOT/'public/seasonal-assets/color-study-c72'
OUT=ROOT/'public/seasonal-assets/color-study-cprime72'
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def hsv(rgb):
 r,g,b=np.moveaxis(rgb.astype(float)/255,-1,0);hi=np.maximum.reduce([r,g,b]);lo=np.minimum.reduce([r,g,b]);d=hi-lo
 h=np.zeros_like(hi);nz=d>0
 for channel,offset,numerator in [(r,0,g-b),(g,2,b-r),(b,4,r-g)]:
  m=nz&(hi==channel);h[m]=(numerator[m]/d[m]+offset)%6
 return h*60,np.divide(d,hi,out=np.zeros_like(hi),where=hi>0),hi

def main():
 global BASE,OUT
 parser=argparse.ArgumentParser(description=__doc__)
 parser.add_argument('--completed-study',default='color-study-c72')
 parser.add_argument('--output-study',default='color-study-cprime72')
 parser.add_argument('--rules',type=Path,default=ROOT/'data/seasonal-cprime-extraction.json')
 args=parser.parse_args()
 if any(not re.fullmatch(r'[a-z0-9][a-z0-9-]{0,63}',name) for name in [args.completed_study,args.output_study]) or args.completed_study==args.output_study:parser.error('Distinct safe study names required')
 BASE=ROOT/'public/seasonal-assets'/args.completed_study
 OUT=ROOT/'public/seasonal-assets'/args.output_study
 manifest=json.loads((BASE/'manifest.json').read_text());layout=json.loads((BASE/'layout.json').read_text())
 rules=json.loads(args.rules.read_text());rows=[];checks=[]
 OUT.mkdir(parents=True,exist_ok=True)
 for e in manifest['entries']:
  src=BASE/e['image'];im=Image.open(src).convert('RGBA');a=np.array(im);h,s,v=hsv(a[:,:,:3]);rule=rules['entries'].get(e['id'],{})
  lo,hi=rule.get('hue',{'spring':[315,350],'summer':[0,20],'autumn':[20,36],'winter':[195,240]}[e['season']])
  mask=(h>=lo)&(h<=hi)&(s>=rule.get('saturation',.8 if e['season']=='autumn' else .58))&(v>=rule.get('value',.87 if e['season']=='autumn' else (.35 if e['season']=='winter' else .78)))&(a[:,:,3]>128)
  if 'polygon' in rule:
   roi=Image.new('L',im.size);ImageDraw.Draw(roi).polygon([tuple(p) for p in rule['polygon']],fill=255);mask&=np.array(roi)>0
  # Close tiny print-grain holes; source alpha and RGBA remain unchanged.
  matte=Image.fromarray(mask.astype('uint8')*255).filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.MinFilter(3))
  mask=np.array(matte)>0
  # Discard isolated chroma spill specks; retain each substantial accent component.
  seen=np.zeros(mask.shape,dtype=bool);clean=np.zeros(mask.shape,dtype=bool)
  for y,x in zip(*np.where(mask)):
   if seen[y,x]:continue
   queue=[(y,x)];seen[y,x]=True;component=[]
   while queue:
    cy,cx=queue.pop();component.append((cy,cx))
    for ny,nx in [(cy-1,cx),(cy+1,cx),(cy,cx-1),(cy,cx+1)]:
     if 0<=ny<512 and 0<=nx<512 and mask[ny,nx] and not seen[ny,nx]:seen[ny,nx]=True;queue.append((ny,nx))
   if len(component)>=rule.get('minimumPixels',12):
    for cy,cx in component:clean[cy,cx]=True
  mask=clean
  if rule.get('fillHoles',True):
   outside=np.zeros(mask.shape,dtype=bool);queue=[(0,0)];outside[0,0]=True
   while queue:
    cy,cx=queue.pop()
    for ny,nx in [(cy-1,cx),(cy+1,cx),(cy,cx-1),(cy,cx+1)]:
     if 0<=ny<512 and 0<=nx<512 and not mask[ny,nx] and not outside[ny,nx]:outside[ny,nx]=True;queue.append((ny,nx))
   mask|=~outside
  mask&=a[:,:,3]>0
  result=a.copy();result[~mask]=0
  target=OUT/e['id'];target.mkdir(exist_ok=True)
  Image.fromarray(result).save(target/'completed.png');Image.fromarray(result).save(target/'completed.webp',lossless=True,method=6)
  bounds=Image.fromarray(result).getchannel('A').getbbox()
  if not bounds:raise ValueError('Empty accent: '+e['id'])
  assert np.array_equal(result[mask],a[mask])
  row={**e,'variant':'C′','sourceVariant':'C','sourceImage':'../'+args.completed_study+'/'+e['image'],'sourceSha256':sha(src),'image':e['id']+'/completed.png','original':e['id']+'/completed.png','generationHash':sha(target/'completed.png'),'colorReason':'候が訪れる前のC′。'+e['targetLabel']+'。C案と同じ位置・大きさで、差し色パーツだけを残しています。','extraction':{'rule':rule,'visibleBounds':bounds,'visiblePixels':int(mask.sum()),'method':'reviewed hue/region mask; original RGBA pixels'}}
  rows.append(row);checks.append({'id':e['id'],'pixels':int(mask.sum()),'fraction':round(float(mask.sum()/(a[:,:,3]>0).sum()),4),'bounds':bounds})
  layout['sources'][e['id']].update(path=row['image'],sha256=row['generationHash'],precursorVisibleBounds=bounds)
 layout.update(variant='C′',sourceVariant='C',algorithm='C fixed coordinates and full C frame / accent-only pixels')
 (OUT/'manifest.json').write_text(json.dumps({'schemaVersion':1,'variant':'C′','entries':rows},ensure_ascii=False,indent=2)+'\n')
 (OUT/'layout.json').write_text(json.dumps(layout,ensure_ascii=False,indent=2)+'\n')
 review=ROOT/'output/seasonal-assets'/args.output_study/'review';review.mkdir(parents=True,exist_ok=True)
 (review/'checks.json').write_text(json.dumps(checks,indent=2)+'\n')
 for season in ['spring','summer','autumn','winter']:
  sheet=Image.new('RGB',(1536,840),'#f7f2e8');draw=ImageDraw.Draw(sheet)
  for i,e in enumerate(x for x in rows if x['season']==season):
   x,y=i%6*256,i//6*280;draw.text((x+12,y+8),e['id'],fill='#463f33');p=Image.open(OUT/e['image']).resize((256,256),Image.Resampling.LANCZOS);sheet.paste(p,(x,y+24),p)
  sheet.save(review/(season+'.png'))
 print(json.dumps({'count':len(rows),'review':str(review),'checks':checks}))
if __name__=='__main__':main()
