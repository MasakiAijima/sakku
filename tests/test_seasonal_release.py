import importlib.util
import fcntl
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from PIL import Image

PATH=Path(__file__).resolve().parents[1]/'scripts/package-seasonal-release.py'
spec=importlib.util.spec_from_file_location('release',PATH)
release=importlib.util.module_from_spec(spec);spec.loader.exec_module(release)


class ReleaseTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Use shipped real artwork/provenance, not private raw output directories.
        cls.fixture=tempfile.TemporaryDirectory();cls.fixture_root=Path(cls.fixture.name)
        base=cls.fixture_root/'public/seasonal-assets';base.mkdir(parents=True)
        pointer=release.read(release.ROOT/'public/seasonal-assets/current.json')
        shipped=release.ROOT/'public/seasonal-assets'/Path(pointer['manifest']).parent
        manifest=release.read(shipped/'manifest.json')
        entries=[];sources={};prime_sources={}
        for asset in manifest['assets']:
            identity=asset['kouId'];placement=asset['placement']
            entries.append({'id':identity,'name':asset['name'],'x':placement['x'],'y':placement['y']})
            for study,state in [('color-study-c72','completed'),('color-study-cprime72','initial')]:
                directory=base/study/identity;directory.mkdir(parents=True)
                (directory/'completed.png').symlink_to(shipped/asset[state])
            source={'path':identity+'/completed.png','sha256':asset['hashes']['completed'],'canvas':[512,512],'visibleCenter':placement['visibleCenter'],'visibleLongEdge':placement['visibleLongEdge'],'visibleBounds':asset['visibleBounds']}
            sources[identity]=source;prime_sources[identity]={**source,'sha256':asset['hashes']['initial'],'precursorVisibleBounds':asset['precursorBounds']}
            raw=cls.fixture_root/'output/seasonal-assets/color-study-c72'/identity;raw.mkdir(parents=True)
            release.write(raw/'generation.json',release.read(shipped/asset['provenance'])['generation'])
        for study,data in [('color-study-c72',sources),('color-study-cprime72',prime_sources)]:
            release.write(base/study/'layout.json',{'viewBox':manifest['layout']['viewBox'],'commonVisibleLongEdge':manifest['layout']['commonVisibleLongEdge'],'entries':entries,'sources':data})
            release.write(base/study/'manifest.json',{'entries':entries})
        cls.layout,cls.jobs=release.input_jobs(cls.fixture_root)

    @classmethod
    def tearDownClass(cls):cls.fixture.cleanup()

    def test_three_real_samples_reuse_and_tamper(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary)
            for identity in ['kou-01','kou-32','kou-54']:
                entry=release.package_one(root,identity,self.jobs[identity])
                self.assertEqual(entry['animation']['durationMs'],720)
                self.assertEqual(entry['animation']['loop'],False)
                self.assertEqual(entry['idle'],identity+'/idle.png')
                with patch.object(release,'transition',side_effect=AssertionError('Reuse must not regenerate')):
                    self.assertEqual(release.package_one(root,identity,self.jobs[identity]),entry)
            (root/'kou-01/idle.png').write_bytes(b'tampered')
            with self.assertRaisesRegex(ValueError,'hash mismatch'):
                release.package_one(root,'kou-01',self.jobs['kou-01'])

    def test_failure_resume_changed_input_new_version(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary);v1=root/'v1';v1.mkdir()
            with patch.object(release,'transition',side_effect=RuntimeError('interrupt')):
                with self.assertRaisesRegex(RuntimeError,'interrupt'):
                    release.package_one(v1,'kou-01',self.jobs['kou-01'])
            self.assertEqual(list(v1.iterdir()),[])
            entry=release.package_one(v1,'kou-01',self.jobs['kou-01'])
            changed=(*self.jobs['kou-01'][:3],'changed-input-fingerprint')
            with self.assertRaisesRegex(ValueError,'new version'):
                release.package_one(v1,'kou-01',changed)
            v2=root/'v2';v2.mkdir()
            new_entry=release.package_one(v2,'kou-01',changed)
            self.assertEqual(new_entry['hashes']['completed'],entry['hashes']['completed'])
            self.assertNotEqual(new_entry['hashes']['provenance'],entry['hashes']['provenance'])
            self.assertFalse((root/'current.json').exists())

    def test_metadata_tamper_rejected_even_when_record_updated(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary)
            release.package_one(root,'kou-01',self.jobs['kou-01'])
            folder=root/'kou-01'
            record=release.read(folder/'record.json')
            record['asset']['placement']['x']+=1
            release.write(folder/'record.json',record)
            with self.assertRaisesRegex(ValueError,'Source geometry differs'):
                release.validate_asset(folder,release.read(folder/'record.json')['asset'])
            provenance=release.read(folder/'provenance.json')
            self.assertEqual(provenance['assetVersion'],root.name)
            self.assertEqual(provenance['provider'],'openai')
            self.assertTrue(provenance['promptVersion'].startswith('sha256:'))
            self.assertTrue(provenance['processedAtUTC'].endswith('+00:00'))
            self.assertEqual(provenance['generatedAt'],self.jobs['kou-01'][2]['generation']['attempted_at'])
            self.assertNotIn('source_path',provenance['generation'])
            self.assertNotIn('reference_path',provenance['generation'])
            self.assertNotIn(str(release.ROOT), (folder/'provenance.json').read_text())

    def test_historical_v1_provenance_remains_readable(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary)
            entry=release.package_one(root,'kou-01',self.jobs['kou-01'])
            folder=root/'kou-01'
            provenance=release.read(folder/'provenance.json')
            provenance['algorithmVersion']='organic-growth-48-v1'
            for key in ['assetVersion','promptVersion','processedAtUTC','provider']:provenance.pop(key)
            release.write(folder/'provenance.json',provenance)
            entry['hashes']['provenance']=release.digest(folder/'provenance.json')
            release.validate_asset(folder,entry)

    def test_concurrent_version_lock_refuses_before_packaging(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary)
            with (root/'.v1.package.lock').open('a') as lock:
                fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
                with patch.object(release,'package_locked') as package:
                    with self.assertRaises(BlockingIOError):release.package(release.ROOT,root/'v1',['kou-01'])
                    package.assert_not_called()

    def test_custom_study_directories_and_safe_names(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary)
            base=root/'public/seasonal-assets';base.mkdir(parents=True)
            # The canonical fixture files are linked read-only; generation writes only the release.
            (base/'annual-c').symlink_to(self.fixture_root/'public/seasonal-assets/color-study-c72',target_is_directory=True)
            (base/'annual-prime').symlink_to(self.fixture_root/'public/seasonal-assets/color-study-cprime72',target_is_directory=True)
            raw=root/'output/seasonal-assets';raw.mkdir(parents=True)
            (raw/'annual-c').symlink_to(self.fixture_root/'output/seasonal-assets/color-study-c72',target_is_directory=True)
            destination=base/'releases/custom-v1'
            release.package(root,destination,['kou-01'],'annual-c','annual-prime')
            self.assertTrue((destination/'kou-01/completed.png').is_file())
            self.assertFalse((destination/'manifest.json').exists())
            for unsafe in ['../escape','/absolute','has/slash','']:
                with self.assertRaisesRegex(ValueError,'safe directory'):
                    release.input_jobs(root,unsafe,'annual-prime')

    def test_partial_check_refuses_and_leaves_manifest(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary)/'test-v1';root.mkdir()
            path=root/'manifest.json'
            release.write(path,{'schemaVersion':2,'version':'test-v1','status':'review','assets':[]})
            before=path.read_bytes()
            with self.assertRaisesRegex(ValueError,'canonical 72'):release.check(root)
            self.assertEqual(path.read_bytes(),before)

    def test_opaque_or_wrong_dimensions_rejected(self):
        with tempfile.TemporaryDirectory() as temporary:
            path=Path(temporary)/'wrong.png'
            for size,mode,color in [((512,512),'RGBA',(1,2,3,255)),((256,256),'RGBA',(0,0,0,0)),((512,512),'RGB',(1,2,3))]:
                Image.new(mode,size,color).save(path)
                with self.assertRaises(ValueError):release.rgba(path)


if __name__=='__main__':unittest.main()
