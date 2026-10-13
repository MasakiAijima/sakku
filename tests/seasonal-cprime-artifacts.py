from pathlib import Path
import json,hashlib
import numpy as np
from PIL import Image
root=Path(__file__).resolve().parents[1];base=root/'public/seasonal-assets';m=json.loads((base/'color-study-cprime72/manifest.json').read_text());c=json.loads((base/'color-study-c72/layout.json').read_text())
assert len(m['entries'])==72
for e in m['entries']:
 source=base/'color-study-cprime72'/e['sourceImage'];target=base/'color-study-cprime72'/e['image'];a=np.array(Image.open(source));b=np.array(Image.open(target));assert a.shape==b.shape==(512,512,4)
 visible=b[:,:,3]>0;assert visible.sum()>0;assert visible.sum()<(a[:,:,3]>0).sum();assert np.array_equal(a[visible],b[visible]);assert np.all(b[~visible]==0)
 digest=hashlib.sha256(source.read_bytes()).hexdigest();assert digest==e['sourceSha256']==c['sources'][e['id']]['sha256']
 record=json.loads((root/'output/seasonal-assets/color-study-c72'/e['id']/'generation.json').read_text());assert record['completed_sha256']==digest
print(json.dumps({'passed':True,'count':72,'survivingPixelsExact':True,'CSourceHashesUnchanged':True}))
