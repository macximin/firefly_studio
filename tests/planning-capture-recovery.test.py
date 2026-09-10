import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('capture_daily', ROOT/'scripts/daily-planning.py')
daily = importlib.util.module_from_spec(spec)
spec.loader.exec_module(daily)


class CaptureRecoveryTests(unittest.TestCase):
    def fixture(self, root):
        route = root/'grok-web'
        capture = route/'capture-recovery'
        capture.mkdir(parents=True)
        (route/'input.md').write_text('Same approved input')
        text = '\n'.join(f'## {n}. 항목\n'+(
            '\n'.join(w+': 구체적인 인물과 행동의 결과를 서술한다.' for w in daily.planning_input.WORDS)
            if n == 2 else '실제 사건과 주인공의 이득을 서술한다.') for n in range(1, 10))
        (capture/'plan.md').write_text(text)
        receipt = {'status':'failed','inputSha256':daily.sha('Same approved input'),
                   'finishedAt':'2026-09-09T00:00:00Z','error':'Transport stopped after capture'}
        web = {'status':'submitted','conversationUrl':'https://grok.com/c/test'}
        daily.save(route/'receipt.json', receipt)
        daily.save(route/'web-receipt.json', web)
        daily.save(capture/'copy-receipt.json', {'status':'complete','verified':True,
            'method':'ego-copy+os-pbpaste','copyExitCode':0,'sha256':daily.sha(text)})
        recovery = {'schemaVersion':'firefly-capture-recovery/v1','route':'grok-web',
            'inputSha256':receipt['inputSha256'],'conversationUrl':web['conversationUrl'],
            'outputSha256':daily.sha(text),
            'sourceProcessReceiptSha256':daily.sha((route/'receipt.json').read_text()),
            'sourceWebReceiptSha256':daily.sha((route/'web-receipt.json').read_text())}
        daily.save(route/'capture-recovery.json', recovery)
        daily.save(root/'input-receipt.json', {'promptSha256':receipt['inputSha256']})
        return route, text

    def test_verified_capture_preserves_failed_transport_and_records_exception(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary);route,text=self.fixture(root)
            extracted,receipt,web,_=daily.extract(route,'grok-web')
            self.assertEqual(extracted,text)
            self.assertEqual(receipt['status'],'failed')
            self.assertEqual(web['status'],'submitted')
            self.assertTrue(web['captureRecovery']['verified'])
            with patch.object(daily,'author_evidence',return_value={'route':'grok-web','model':'observed'}):
                candidate=daily.collect(root,'grok-web')
            self.assertEqual(candidate['state'],'complete')
            self.assertEqual(candidate['receipt']['process']['status'],'failed')
            self.assertTrue(candidate['issues'])
            self.assertEqual(len(daily.operational_events(root)),1)

    def test_changed_input_output_or_source_receipts_rejected(self):
        for filename in ['input.md','capture-recovery/plan.md','receipt.json','web-receipt.json']:
            with self.subTest(filename=filename),tempfile.TemporaryDirectory() as temporary:
                route,_=self.fixture(Path(temporary))
                target=route/filename
                target.write_text(target.read_text()+' ')
                with self.assertRaises(daily.lifecycle.LifecycleConflict):daily.extract(route,'grok-web')

    def test_unverified_copy_rejected(self):
        with tempfile.TemporaryDirectory() as temporary:
            route,_=self.fixture(Path(temporary))
            path=route/'capture-recovery/copy-receipt.json';copy=daily.read(path)
            copy['verified']=False;daily.save(path,copy)
            with self.assertRaises(daily.lifecycle.LifecycleConflict):daily.extract(route,'grok-web')

    def test_other_conversation_or_route_rejected(self):
        for key,value in [('route','chatgpt-web'),('conversationUrl','https://grok.com/c/other')]:
            with self.subTest(key=key),tempfile.TemporaryDirectory() as temporary:
                route,_=self.fixture(Path(temporary));path=route/'capture-recovery.json'
                recovery=daily.read(path);recovery[key]=value;daily.save(path,recovery)
                with self.assertRaises(daily.lifecycle.LifecycleConflict):daily.extract(route,'grok-web')

    def test_recovery_never_waives_browser_stop(self):
        for marker in ['browser-blocked.json','browser-runtime-error.json']:
            with self.subTest(marker=marker),tempfile.TemporaryDirectory() as temporary:
                route,_=self.fixture(Path(temporary));daily.save(route/marker,{'reason':'stop'})
                with self.assertRaises(daily.lifecycle.LifecycleConflict):daily.extract(route,'grok-web')

    def test_capture_symlink_cannot_escape_route(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary);route,text=self.fixture(root)
            outside=root/'other-plan.md';outside.write_text(text)
            path=route/'capture-recovery/plan.md';path.unlink();path.symlink_to(outside)
            with self.assertRaises(daily.lifecycle.LifecycleConflict):daily.extract(route,'grok-web')


if __name__ == '__main__':
    unittest.main()
