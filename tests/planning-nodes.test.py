import importlib.util
import json
from pathlib import Path
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer
from unittest.mock import patch

HQ = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('planning_nodes', HQ/'scripts/planning-nodes.py')
nodes = importlib.util.module_from_spec(spec)
spec.loader.exec_module(nodes)


class ReplayTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)/'outputs'
        self.batch = self.root/'example'
        self.job = self.batch/'astra'
        self.job.mkdir(parents=True)
        self.prompt = '# 기획 지침\n실제 지침'+nodes.FEEDBACK_MARKER+'의견 없음'+nodes.SOURCE_MARKER+'원문 근거'
        self.plan = '\n\n'.join(f'## {n}. 항목\n'+(
            '\n'.join(f'{w}: 실제 답변' for w in nodes.planning_input.WORDS) if n == 2 else '실제 본문') for n in range(1, 10))
        self.canary = {'state': 'complete', 'id': 'example', 'title': 'Example',
                       'generatedAt': '2026-09-08T00:00:00Z', 'markdown': self.plan,
                       'inputSha256': nodes.digest(self.prompt), 'outputSha256': nodes.digest(self.plan),
                       'author': {'route': 'astra', 'requestedModel': 'fixture'}, 'receipt': {}}
        (self.batch/'input.md').write_text(self.prompt)
        (self.job/'input.md').write_text(self.prompt)
        self.write(self.batch/'input-receipt.json', {'promptSha256': nodes.digest(self.prompt), 'sources': []})
        self.write(self.job/'canary.json', self.canary)
        self.write(self.job/'assistant-response.json', {'text': self.plan+'\n', 'sha256': nodes.digest(self.plan+'\n')})
        self.replay = nodes.Replay(self.root, Path(self.tmp.name)/'runtime')

    def write(self, path, value):
        path.write_text(json.dumps(value, ensure_ascii=False))

    def begin(self):
        selected = self.replay.stage('select', {'batchId': 'example', 'route': 'astra'})
        body = {'runId': selected['runId']}
        parts = {k: self.replay.stage(k, body)['text'] for k in ('sources', 'instructions', 'feedback')}
        return body, parts

    def test_exact_replay_uses_real_parts_without_external_calls(self):
        before = {p: nodes.digest(p.read_bytes()) for p in self.batch.rglob('*') if p.is_file()}
        with patch('socket.socket.connect', side_effect=AssertionError('Replay must be offline')):
            body, parts = self.begin()
            assembled = self.replay.stage('assemble', {**body, **parts})
            self.assertEqual(assembled['prompt'], self.prompt)
            answer = self.replay.stage('response', {**body, 'promptSha256': assembled['promptSha256']})
            check = self.replay.stage('validate', {**body, 'markdown': answer['markdown']})
            receipt = self.replay.stage('receipt', body)
        self.assertTrue(check['formatPassed'])
        self.assertEqual(receipt['qualityVerdict'], 'not-assessed')
        self.assertEqual(receipt['newModelCalls'], 0)
        self.assertEqual(before, {p: nodes.digest(p.read_bytes()) for p in before})

    def test_modified_input_cannot_reuse_original_answer(self):
        body, parts = self.begin()
        with self.assertRaisesRegex(ValueError, 'Changed input'):
            self.replay.stage('assemble', {**body, **parts, 'feedback': 'changed'})
        with self.assertRaisesRegex(ValueError, 'Previous node'):
            self.replay.stage('response', {**body, 'promptSha256': nodes.digest(self.prompt)})

    def test_corrupt_input_fails_closed(self):
        (self.job/'input.md').write_text('wrong prompt')
        with self.assertRaisesRegex(ValueError, 'inputs differ'):
            self.replay.stage('select', {'batchId': 'example', 'route': 'astra'})

    def test_raw_response_must_independently_match_saved_plan(self):
        self.write(self.job/'assistant-response.json', {'text': 'different', 'sha256': nodes.digest('different')})
        with self.assertRaisesRegex(ValueError, 'differs from saved plan'):
            self.replay.stage('select', {'batchId': 'example', 'route': 'astra'})

    def test_mid_execution_snapshot_drift_stops_replay(self):
        body, _ = self.begin()
        (self.job/'canary.json').write_text('{}')
        with self.assertRaisesRegex(ValueError, 'snapshot changed'):
            self.replay.stage('assemble', body)

    def test_path_traversal_and_unsupported_route_rejected(self):
        for batch, route in [('../example', 'astra'), ('example', 'grok-web'), ('/tmp', 'astra')]:
            with self.assertRaises(ValueError):
                self.replay.stage('select', {'batchId': batch, 'route': route})

    def test_retries_preserve_stage_output(self):
        body, _ = self.begin()
        self.assertEqual(self.replay.stage('feedback', body), self.replay.stage('feedback', body))

    def test_http_requires_token_and_has_no_creation_endpoint(self):
        server = ThreadingHTTPServer(('127.0.0.1', 0), nodes.handler(self.replay, 'test-token'))
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        self.addCleanup(server.server_close)
        self.addCleanup(server.shutdown)
        base = f'http://127.0.0.1:{server.server_port}'
        with self.assertRaises(urllib.error.HTTPError) as error:
            urllib.request.urlopen(base+'/v1/catalog')
        self.assertEqual(error.exception.code, 401)
        error.exception.close()
        req = urllib.request.Request(base+'/v1/stages/generate', data=b'{}',
                                     headers={'Authorization': 'Bearer test-token'})
        with self.assertRaises(urllib.error.HTTPError) as error:
            urllib.request.urlopen(req)
        self.assertEqual(error.exception.code, 409)
        error.exception.close()


if __name__ == '__main__':
    unittest.main()
