import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

SCRIPT=Path(__file__).resolve().parents[1]/'scripts/generate-seasonal-color-study.py'
spec=importlib.util.spec_from_file_location('color_resume',SCRIPT)
color=importlib.util.module_from_spec(spec);spec.loader.exec_module(color)


class ColorResumeTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.root=Path(self.temp.name)
        self.raw=self.root/'raw';self.public=self.root/'public'
        self.source=self.root/'source.png';self.source.write_bytes(b'reference')
        self.jobs=[dict(entry=dict(id=f'kou-{i:02}',prompt='preserve color',sourcePath='source.png'),source=self.source,hash=f'hash-{i}',reference_sha256=color.base.sha(self.source)) for i in [1,2]]
        self.patches=[patch.object(color,'RAW',self.raw),patch.object(color,'PUBLIC',self.public),patch.object(color.base,'CLI',self.source),patch.object(color.base.legacy,'environment',return_value={'OPENAI_API_KEY':'test-not-real'}),patch.object(color.importlib.util,'find_spec',return_value=object())]
        for p in self.patches:p.start()
        self.addCleanup(self.temp.cleanup)
        for p in self.patches:self.addCleanup(p.stop)

    def record(self,job,status='failed',hash_value=None):
        identity=job['entry']['id'];d=self.raw/identity;d.mkdir(parents=True)
        target=self.public/identity;target.mkdir(parents=True)
        (d/'original.png').write_bytes(b'raw-attempt')
        (target/'completed.png').write_bytes(b'completed')
        record=dict(hash=hash_value or job['hash'],status=status,actual_cost_jpy=None,
                    image_sha256=color.base.sha(d/'original.png'),completed_sha256=color.base.sha(target/'completed.png'))
        (d/'generation.json').write_text(json.dumps(record))
        return d,target

    def test_matching_success_reused_never_archived_no_cli(self):
        for job in self.jobs:self.record(job,'succeeded')
        with patch.object(color.subprocess,'run') as api:
            self.assertTrue(color.execute({},self.jobs,1,selected=[self.jobs[0]],retry_failed=True))
            api.assert_not_called()
        self.assertFalse((self.raw/'review').exists())
        self.assertEqual(len(json.loads((self.public/'manifest.json').read_text())['entries']),2)
        (self.raw/'kou-01/original.png').write_bytes(b'tamper')
        with self.assertRaisesRegex(ValueError,'original'):color.pending([self.jobs[0]])

    def test_selective_retry_preserves_failed_and_uncertain_attempts(self):
        d,target=self.record(self.jobs[0],'attempted')
        self.record(self.jobs[1],'failed')
        original=(d/'generation.json').read_bytes()
        failure=type('Result',(),dict(returncode=1,stderr=b'rate_limit_exceeded'))()
        with patch.object(color.subprocess,'run',return_value=failure) as api:
            self.assertFalse(color.execute({},self.jobs,1,selected=[self.jobs[0]],retry_failed=True))
            self.assertEqual(api.call_count,1)
        archive=list((self.raw/'review/retries/kou-01').iterdir())
        self.assertEqual(len(archive),1)
        self.assertEqual((archive[0]/'raw/generation.json').read_bytes(),original)
        self.assertEqual((archive[0]/'raw/original.png').read_bytes(),b'raw-attempt')
        self.assertEqual((archive[0]/'public/completed.png').read_bytes(),b'completed')
        self.assertEqual(json.loads((self.raw/'kou-02/generation.json').read_text())['status'],'failed')
        self.assertFalse((self.raw/'review/retries/kou-02').exists())
        self.assertEqual(len(json.loads((self.public/'manifest.json').read_text())['entries']),2)

    def test_changed_hash_rejected_before_archive_or_cli(self):
        self.record(self.jobs[0],hash_value='old')
        with patch.object(color.subprocess,'run') as api:
            with self.assertRaisesRegex(ValueError,'new study/version'):
                color.execute({},self.jobs,1,selected=[self.jobs[0]],retry_failed=True)
            api.assert_not_called()
        self.assertFalse((self.raw/'review').exists())
        self.assertTrue((self.raw/'kou-01/generation.json').exists())

    def test_normal_failure_refuses_without_mutation(self):
        d,_=self.record(self.jobs[0]);before=(d/'generation.json').read_bytes()
        with patch.object(color.subprocess,'run') as api:
            with self.assertRaisesRegex(ValueError,'explicit retry'):color.execute({},self.jobs,1,selected=[self.jobs[0]])
            api.assert_not_called()
        self.assertEqual((d/'generation.json').read_bytes(),before)
        self.assertFalse((self.raw/'review').exists())

    def test_dry_run_selection_read_only_and_retry_requires_execute(self):
        with patch.object(color,'load_jobs',return_value=({},self.jobs)),patch.object(color,'ROOT',self.root),patch.object(color.subprocess,'run') as api:
            with patch('sys.argv',['generator','--study','color-study-test','--ids','kou-01']):
                self.assertEqual(color.main(),0)
            with patch('sys.argv',['generator','--study','color-study-test','--ids','kou-01','--retry-failed']):
                with self.assertRaises(SystemExit):color.main()
            api.assert_not_called()
        self.assertFalse((self.root/'output').exists())


if __name__=='__main__':unittest.main()
