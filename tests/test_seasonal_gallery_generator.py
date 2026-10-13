import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from PIL import Image

SPEC = importlib.util.spec_from_file_location('gallery_generator', Path(__file__).resolve().parents[1] / 'scripts/generate-seasonal-gallery.py')
generator = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(generator)


class GalleryGeneratorTests(unittest.TestCase):
    def setup_paths(self, temporary, reserved=360):
        root = Path(temporary)
        base = root / 'output/seasonal-assets'
        raw = base / 'poc-v3'
        public = root / 'public/seasonal-assets/poc-v3'
        base.mkdir(parents=True)
        (base / 'budget-ledger.json').write_text(json.dumps({'budget_jpy': 10000, 'entries': [{'reserved_jpy': reserved}]}))
        reference = root / 'reference.png'
        Image.new('RGB', (32, 32), 'white').save(reference)
        directory = raw / 'kou-01'
        job = dict(id='kou-01', hash='test', prompt='teal wind', reference_path=str(reference), reference_sha256=generator.sha(reference), output=str(directory / 'original.png'), provenance=str(directory / 'generation.json'), prompt_path=str(directory / 'prompt.txt'))
        return root, base, raw, public, job

    def test_budget_refuses_all_requests_when_full_selection_does_not_fit(self):
        with tempfile.TemporaryDirectory() as temporary:
            root, base, raw, public, job = self.setup_paths(temporary, 9900)
            with patch.multiple(generator, ROOT=root, RAW=raw, PUBLIC=public, CLI=Path(__file__)), patch.object(generator.legacy, 'environment', return_value={'OPENAI_API_KEY': 'test'}), patch.object(generator.subprocess, 'run') as runner:
                with self.assertRaisesRegex(ValueError, 'authorized budget'):
                    generator.execute({'entries': []}, [job], 4)
                runner.assert_not_called()
                self.assertEqual(len(json.loads((base / 'budget-ledger.json').read_text())['entries']), 1)

    def test_missing_sdk_refuses_before_reservation(self):
        with tempfile.TemporaryDirectory() as temporary:
            root, base, raw, public, job = self.setup_paths(temporary)
            with patch.multiple(generator, ROOT=root, RAW=raw, PUBLIC=public), patch.object(generator.importlib.util, 'find_spec', return_value=None), patch.object(generator.subprocess, 'run') as runner:
                with self.assertRaisesRegex(ValueError, 'SDK missing'):
                    generator.execute({'entries': []}, [job], 1)
                runner.assert_not_called()
                self.assertEqual(len(json.loads((base / 'budget-ledger.json').read_text())['entries']), 1)

    def test_failure_reserves130_and_suppresses_credentials(self):
        with tempfile.TemporaryDirectory() as temporary:
            root, base, raw, public, job = self.setup_paths(temporary)
            with patch.multiple(generator, ROOT=root, RAW=raw, PUBLIC=public, CLI=Path(__file__)), patch.object(generator.legacy, 'environment', return_value={'OPENAI_API_KEY': 'secret-value'}), patch.object(generator.subprocess, 'run', side_effect=RuntimeError('secret-value')):
                self.assertFalse(generator.execute({'entries': [{'id': 'kou-01'}]}, [job], 1))
            ledger = json.loads((base / 'budget-ledger.json').read_text())
            self.assertEqual(ledger['entries'][-1]['reserved_jpy'], 130)
            self.assertEqual(ledger['entries'][-1]['status'], 'failed')
            self.assertNotIn('secret-value', Path(job['provenance']).read_text())
            self.assertEqual(json.loads((public / 'gallery.json').read_text())['entries'][0]['status'], 'failed')

    def test_keying_preserves_yellow_and_pale_teal_with_transparent_margin(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            image = Image.new('RGB', (1024, 1024), '#FF00FF')
            image.paste('#E3BC45', (300, 300, 600, 700))
            image.paste('#90B8B0', (600, 400, 700, 650))
            image.save(root / 'original.png')
            result = generator.cutout(root / 'original.png', root / 'cutout.png')
            self.assertEqual(result.size, (512, 512))
            self.assertEqual(result.getpixel((0, 0))[3], 0)
            cutout = Image.open(root / 'cutout.png')
            self.assertEqual(cutout.getpixel((400, 400)), (227, 188, 69, 255))
            self.assertEqual(cutout.getpixel((650, 500)), (144, 184, 176, 255))


if __name__ == '__main__':
    unittest.main()
