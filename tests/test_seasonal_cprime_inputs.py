import contextlib,importlib.util,io,json,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('cprime_input',ROOT/'scripts/extract-seasonal-cprime.py')
extract=importlib.util.module_from_spec(spec);spec.loader.exec_module(extract)
class CprimeInputs(unittest.TestCase):
 def test_named_inputs_preserve_approved_pixels_and_frame(self):
  with tempfile.TemporaryDirectory() as temp:
   root=Path(temp);base=root/'public/seasonal-assets';base.mkdir(parents=True)
   pointer=json.loads((ROOT/'public/seasonal-assets/current.json').read_text())
   shipped=ROOT/'public/seasonal-assets'/Path(pointer['manifest']).parent
   release=json.loads((shipped/'manifest.json').read_text())
   source_dir=base/'source-copy';source_dir.mkdir();rows=[];sources={}
   for index,asset in enumerate(release['assets']):
    identity=asset['kouId'];directory=source_dir/identity;directory.mkdir()
    (directory/'completed.png').symlink_to(shipped/asset['completed'])
    rows.append({'id':identity,'name':asset['name'],'image':identity+'/completed.png','season':['spring','summer','autumn','winter'][index//18],'targetLabel':'accent','x':asset['placement']['x'],'y':asset['placement']['y']})
    sources[identity]={'path':identity+'/completed.png','sha256':asset['hashes']['completed'],'canvas':[512,512],'visibleCenter':asset['placement']['visibleCenter'],'visibleLongEdge':asset['placement']['visibleLongEdge'],'visibleBounds':asset['visibleBounds']}
   (source_dir/'manifest.json').write_text(json.dumps({'entries':rows}))
   (source_dir/'layout.json').write_text(json.dumps({'entries':rows,'sources':sources,**release['layout']}))
   with contextlib.redirect_stdout(io.StringIO()),patch.object(extract,'ROOT',root),patch('sys.argv',['extract','--completed-study','source-copy','--output-study','next-prime','--rules',str(ROOT/'data/seasonal-cprime-extraction.json')]):extract.main()
   manifest=json.loads((base/'next-prime/manifest.json').read_text());self.assertEqual(len(manifest['entries']),72)
   for entry in manifest['entries']:
    self.assertTrue(entry['sourceImage'].startswith('../source-copy/'))
    self.assertEqual((base/'next-prime'/entry['image']).read_bytes(),(shipped/entry['id']/'initial.png').read_bytes())
   layout=json.loads((base/'next-prime/layout.json').read_text());source=json.loads((base/'source-copy/layout.json').read_text());self.assertEqual(layout['entries'],source['entries']);self.assertEqual(layout['commonVisibleLongEdge'],source['commonVisibleLongEdge'])
if __name__=='__main__':unittest.main()
