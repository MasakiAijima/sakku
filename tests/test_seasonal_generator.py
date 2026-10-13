import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from PIL import Image

SPEC = importlib.util.spec_from_file_location('generator', Path(__file__).resolve().parents[1] / 'scripts/generate-seasonal-assets.py')
generator = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(generator)


class GeneratorTests(unittest.TestCase):
    def job(self, root):
        reference = root / 'reference.png'
        Image.new('RGB', (32, 32), 'white').save(reference)
        directory = root / 'output/seasonal-assets/test-v2/kou-01'
        return dict(id='kou-01', hash='abc', prompt='A flat motif',
                    reference_path=str(reference),
                    reference_sha256=generator.hashlib.sha256(reference.read_bytes()).hexdigest(),
                    output=str(directory / 'original.png'),
                    provenance=str(directory / 'generation.json'),
                    prompt_path=str(directory / 'prompt.txt'))

    def test_plan_restricts_reviewed_relations_and_records_edit_inputs(self):
        jobs = generator.plan(generator.ROOT, ['kou-01', 'kou-32', 'kou-54'], 'test-v2', 'gpt-image-2')
        self.assertEqual([job['name'] for job in jobs], ['東風凍を解く', '蓮始めて開く', '楓蔦黄ばむ'])
        self.assertTrue(all(job['prompt_version'] == 2 for job in jobs))
        self.assertTrue(all(job['conditions']['quality'] == 'medium' for job in jobs))
        self.assertTrue(all(job['operation'] == 'edit' for job in jobs))
        for job in jobs:
            self.assertEqual(job['reference_sha256'], generator.hashlib.sha256(Path(job['reference_path']).read_bytes()).hexdigest())
        with self.assertRaisesRegex(ValueError, 'one seasonal relation'):
            generator.plan(generator.ROOT, ['kou-02'], 'test-v2', 'gpt-image-2')
        with self.assertRaisesRegex(ValueError, 'unique canonical'):
            generator.plan(generator.ROOT, ['kou-01', 'kou-01'], 'test-v2', 'gpt-image-2')

    def test_budget_refuses_before_subprocess(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            base = root / 'output/seasonal-assets'
            base.mkdir(parents=True)
            (base / 'budget-ledger.json').write_text(json.dumps(dict(budget_jpy=1000, entries=[dict(reserved_jpy=990)])))
            with patch.object(generator, 'CLI', Path(__file__)), patch.object(generator.subprocess, 'run') as runner:
                with self.assertRaises(ValueError):
                    generator.execute(root, [self.job(root)], dict(OPENAI_API_KEY='sk-test'))
                runner.assert_not_called()

    def test_failure_retains_reservation_without_secret(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            job = self.job(root)
            with patch.object(generator, 'CLI', Path(__file__)), patch.object(generator.subprocess, 'run', side_effect=RuntimeError('sk-secret-partial')):
                with self.assertRaisesRegex(RuntimeError, 'Reservation retained'):
                    generator.execute(root, [job], dict(OPENAI_API_KEY='sk-secret-partial'))
            ledger = json.loads((root / 'output/seasonal-assets/budget-ledger.json').read_text())
            self.assertEqual(ledger['entries'][0]['reserved_jpy'], 90)
            self.assertEqual(ledger['entries'][0]['status'], 'failed')
            self.assertNotIn('sk-secret', Path(job['provenance']).read_text())

    def test_existing_unproven_original_refused(self):
        with tempfile.TemporaryDirectory() as temporary:
            job = self.job(Path(temporary))
            image = Path(job['output'])
            image.parent.mkdir(parents=True)
            image.write_bytes(b'original')
            with self.assertRaisesRegex(ValueError, 'matching provenance'):
                generator.pending([job])
            self.assertEqual(image.read_bytes(), b'original')

    def test_success_skips_exact_output_and_rejects_prompt_drift(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            job = self.job(root)
            def run(command, **kwargs):
                self.assertIn('edit', command)
                self.assertEqual(command[command.index('--image') + 1], job['reference_path'])
                self.assertIn('--prompt-file', command)
                Image.new('RGB', (1024, 1024), 'magenta').save(job['output'], format='PNG')
                return type('Result', (), dict(returncode=0))()
            with patch.object(generator, 'CLI', Path(__file__)), patch.object(generator.subprocess, 'run', side_effect=run) as runner:
                generator.execute(root, [job], dict(OPENAI_API_KEY='sk-test'))
                generator.execute(root, [job], dict(OPENAI_API_KEY='sk-test'))
                self.assertEqual(runner.call_count, 1)
            record = json.loads(Path(job['provenance']).read_text())
            self.assertEqual(record['status'], 'succeeded')
            self.assertIsNone(record['actual_cost_jpy'])
            self.assertEqual(Path(job['prompt_path']).read_text(), job['prompt'])
            with self.assertRaisesRegex(ValueError, 'matching provenance'):
                generator.pending([dict(job, hash='changed-prompt')])

    def test_reference_drift_refuses_before_any_reservation(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            job = self.job(root)
            Path(job['reference_path']).write_bytes(b'changed')
            with patch.object(generator, 'CLI', Path(__file__)), patch.object(generator.subprocess, 'run') as runner:
                with self.assertRaisesRegex(ValueError, 'Reference changed'):
                    generator.execute(root, [job], dict(OPENAI_API_KEY='sk-test'))
                runner.assert_not_called()
            self.assertFalse((root / 'output/seasonal-assets/budget-ledger.json').exists())

    def test_environment_wins(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / '.env.local').write_text('IMAGE_MODEL=other\nOPENAI_API_KEY=local\n')
            with patch.dict(generator.os.environ, dict(IMAGE_MODEL='gpt-image-2', OPENAI_API_KEY='environment')):
                result = generator.environment(root)
            self.assertEqual(result['IMAGE_MODEL'], 'gpt-image-2')
            self.assertEqual(result['OPENAI_API_KEY'], 'environment')

    def test_truncated_png_retains_failed_reservation(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            job = self.job(root)
            def run(command, **kwargs):
                Path(job['output']).write_bytes(b'\x89PNG\r\n\x1a\nmock')
                return type('Result', (), dict(returncode=0))()
            with patch.object(generator, 'CLI', Path(__file__)), patch.object(generator.subprocess, 'run', side_effect=run):
                with self.assertRaisesRegex(RuntimeError, 'Reservation retained'):
                    generator.execute(root, [job], dict(OPENAI_API_KEY='sk-test'))
            record = json.loads(Path(job['provenance']).read_text())
            self.assertEqual(record['status'], 'failed')
            ledger = json.loads((root / 'output/seasonal-assets/budget-ledger.json').read_text())
            self.assertEqual(ledger['entries'][0]['reserved_jpy'], 90)


if __name__ == '__main__':
    unittest.main()
