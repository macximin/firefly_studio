import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
import urllib.error

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('lifecycle', ROOT / 'scripts/planning-lifecycle.py')
lifecycle = importlib.util.module_from_spec(spec)
spec.loader.exec_module(lifecycle)
NOW = '2026-09-08T02:00:00+09:00'


class LifecycleTests(unittest.TestCase):
    def plan(self, batches=(), **kwargs):
        return lifecycle.plan_tick(batches, today='2026-09-08', hour=2,
                                   notion_execution_ids=[], **kwargs)

    def test_old_recovery_does_not_consume_today_and_cannot_start_missing_routes(self):
        result = self.plan([{'batchId': 'daily-planning-20260907', 'date': '2026-09-07',
                             'status': 'needs_attention'}])
        self.assertEqual([a['kind'] for a in result['actions']], ['recover', 'start'])
        old, current = result['actions']
        self.assertEqual(lifecycle.route_action(False, allow_writer_start=old['allowWriterStart']),
                         'missing_no_submission')
        self.assertEqual(lifecycle.route_action(False, allow_writer_start=current['allowWriterStart']),
                         'submit_once')
        for action in result['actions']:
            self.assertEqual(lifecycle.route_action(True, allow_writer_start=action['allowWriterStart']),
                             'observe_existing')

    def test_existing_today_never_schedules_a_second_submission(self):
        for status in ['unfinished', 'needs_attention', 'finished']:
            with self.subTest(status=status):
                result = self.plan([{'batchId': 'sentinel-canary-20260908', 'date': '2026-09-08',
                                     'status': status}])
                self.assertFalse(result['generationScheduled'])
                self.assertEqual(len(result['actions']), 0 if status == 'finished' else 1)

    def test_recovery_tick_and_unverified_preflight_never_generate(self):
        self.assertEqual(self.plan(recovery_only=True)['actions'], [])
        result = lifecycle.plan_tick([], today='2026-09-08', hour=2)
        self.assertEqual(result['holds'], [{'date': '2026-09-08', 'reason': 'notion_preflight_required'}])
        result = lifecycle.plan_tick([], today='2026-09-08', hour=1, notion_execution_ids=[])
        self.assertFalse(result['generationScheduled'])

    def test_ambiguous_identity_fails_before_producing_actions(self):
        batch = {'batchId': 'today', 'date': '2026-09-08', 'status': 'unfinished'}
        for batches, notion, active in [
            ([batch, {**batch, 'batchId': 'another'}], [], None),
            ([batch], ['different'], None),
            ([], ['today'], None),
            ([batch], ['today', 'today'], None),
            ([batch], [], 'missing'),
            ([{**batch, 'batchId': '../outside'}], [], None),
        ]:
            with self.subTest(batches=batches, notion=notion, active=active):
                with self.assertRaises(lifecycle.LifecycleConflict):
                    lifecycle.plan_tick(batches, today='2026-09-08', hour=2,
                                        notion_execution_ids=notion, active_batch_id=active)

    def test_read_only_snapshot_validates_directory_identity(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / 'today'
            path.mkdir()
            identity = path / 'batch.json'
            identity.write_text(json.dumps({'batchId': 'today', 'date': '2026-09-08'}))
            before = identity.read_bytes()
            self.assertEqual(lifecycle.batch_snapshot(path)['status'], 'unfinished')
            self.assertEqual(identity.read_bytes(), before)
            self.assertEqual(sorted(p.name for p in path.iterdir()), ['batch.json'])
            identity.write_text(json.dumps({'batchId': 'wrong', 'date': '2026-09-08'}))
            with self.assertRaises(lifecycle.LifecycleConflict):
                lifecycle.batch_snapshot(path)

    def test_retry_reservations_count_crashes_and_are_bounded(self):
        receipt = lifecycle.begin_attempt(None, operation_id='old-batch', phase='reconcile', now=NOW)
        self.assertFalse(lifecycle.retry_gate(receipt, now=NOW)['allowed'])
        # First attempt crashed after its reservation. It still counts.
        receipt = lifecycle.begin_attempt(receipt, operation_id='old-batch', phase='reconcile',
                                          now='2026-09-08T02:05:00+09:00')
        receipt = lifecycle.finish_attempt(receipt, now='2026-09-08T02:05:01+09:00',
                                           outcome='retryable_error', error='HTTP 503')
        receipt = lifecycle.begin_attempt(receipt, operation_id='old-batch', phase='reconcile',
                                          now='2026-09-08T02:10:01+09:00')
        receipt = lifecycle.finish_attempt(receipt, now='2026-09-08T02:10:02+09:00',
                                           outcome='retryable_error', error='HTTP 503')
        gate = lifecycle.retry_gate(receipt, now='2026-09-09T02:00:00+09:00')
        self.assertEqual(receipt['attempts'], 3)
        self.assertEqual(receipt['state'], 'exhausted')
        self.assertEqual(gate['reason'], 'attempts_exhausted')
        with self.assertRaises(lifecycle.LifecycleConflict):
            lifecycle.begin_attempt(receipt, operation_id='old-batch', phase='reconcile',
                                    now='2026-09-09T02:00:00+09:00')

    def test_exhausted_old_batch_does_not_block_today_or_repeat_forever(self):
        receipt = {'state': 'exhausted', 'attempts': 3, 'retryable': True}
        result = self.plan([{'batchId': 'old-batch', 'date': '2026-09-07', 'status': 'needs_attention'}],
                           recovery_attempts={'old-batch': receipt}, now=NOW)
        self.assertEqual([a['kind'] for a in result['actions']], ['start'])
        self.assertEqual(result['holds'][0]['reason'], 'attempts_exhausted')

    def test_preflight_failure_is_recordable_without_services_and_can_be_manual(self):
        attempt = lifecycle.begin_attempt(None, operation_id='2026-09-08', phase='preflight', now=NOW)
        failed = lifecycle.preflight_error_receipt(attempt, today='2026-09-08', now=NOW,
                                                  error='Notion HTTP 503', retryable=True)
        self.assertTrue(failed['noSubmission'])
        self.assertEqual(failed['stage'], 'preflight_failed')
        self.assertEqual(failed['state'], 'retry_wait')
        failed = lifecycle.preflight_error_receipt(attempt, today='2026-09-08', now=NOW,
                                                  error='Identity mismatch', retryable=False)
        self.assertEqual(lifecycle.retry_gate(failed, now='2026-09-09T02:00:00+09:00')['reason'],
                         'manual_required')

    def test_retry_identity_and_success_are_not_reused(self):
        attempt = lifecycle.begin_attempt(None, operation_id='today', phase='preflight', now=NOW)
        success = lifecycle.finish_attempt(attempt, now=NOW, outcome='succeeded')
        self.assertEqual(lifecycle.retry_gate(success, now=NOW)['reason'], 'already_succeeded')
        with self.assertRaises(lifecycle.LifecycleConflict):
            lifecycle.begin_attempt(attempt, operation_id='tomorrow', phase='preflight',
                                    now='2026-09-09T02:00:00+09:00')

    def test_retry_classification_excludes_auth_identity_and_bad_data(self):
        for error in [TimeoutError(), ConnectionError(), urllib.error.URLError(TimeoutError()),
                      RuntimeError('HTTP 503 for /api/firefly/planning-canaries')]:
            self.assertTrue(lifecycle.is_transient_error(error))
        for error in [FileNotFoundError(), ValueError('bad JSON'),
                      lifecycle.LifecycleConflict('identity mismatch'),
                      RuntimeError('HTTP 403 for /api/firefly/planning-canaries'),
                      RuntimeError('Some text mentions HTTP 503 for /')]:
            self.assertFalse(lifecycle.is_transient_error(error))


if __name__ == '__main__':
    unittest.main()
