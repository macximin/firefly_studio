#!/usr/bin/env python3
"""Pure decisions for daily submission and bounded, submission-free recovery.

Call under the controller's existing exclusive lock. This module starts no
processes, calls no services, and writes no files. The caller persists attempt
receipts before reconciliation and executes returned actions in order.
"""
from datetime import date as Date, datetime, timedelta, timezone
import json
from pathlib import Path
import re
import socket
import urllib.error


class LifecycleConflict(ValueError):
    """Identity ambiguity that requires inspection, never another submission."""


def is_transient_error(error):
    """Retry only transport failures; identity, auth and malformed data need review.

    daily-planning.request currently redacts HTTP errors to RuntimeError text.
    Only its anchored HTTP status prefix is accepted, not arbitrary error prose.
    """
    if isinstance(error, urllib.error.HTTPError):
        return error.code in (408, 425, 429, 500, 502, 503, 504)
    if isinstance(error, (TimeoutError, ConnectionError, socket.gaierror)):
        return True
    if isinstance(error, urllib.error.URLError):
        return is_transient_error(error.reason)
    return isinstance(error, RuntimeError) and bool(
        re.match(r'^HTTP (?:408|425|429|500|502|503|504) for /', str(error)))


def _time(value):
    if isinstance(value, str):
        value = datetime.fromisoformat(value.replace('Z', '+00:00'))
    if not isinstance(value, datetime) or value.tzinfo is None:
        raise ValueError('A timezone-aware timestamp is required')
    return value.astimezone(timezone.utc)


def _iso(value):
    return _time(value).isoformat()


def batch_snapshot(path):
    """Read only the local batch identity and cycle state, never raw outputs."""
    path = Path(path)
    batch = json.loads((path / 'batch.json').read_text())
    batch_id = batch.get('batchId', path.name)
    if batch_id != path.name:
        raise LifecycleConflict('Batch directory and recorded identity differ')
    receipt_path = path / 'cycle-receipt.json'
    receipt = json.loads(receipt_path.read_text()) if receipt_path.exists() else {}
    return {'batchId': batch_id, 'date': batch['date'],
            'status': receipt.get('status', 'unfinished')}


def route_action(exists, *, allow_writer_start):
    """An existing route directory is an immutable submission claim."""
    if exists:
        return 'observe_existing'
    return 'submit_once' if allow_writer_start else 'missing_no_submission'


def retry_gate(previous, *, now, max_attempts=3):
    """Inspect a persisted operation receipt without consuming another attempt."""
    if max_attempts < 1:
        raise ValueError('max_attempts must be positive')
    now = _time(now)
    previous = previous or {}
    attempts = previous.get('attempts', 0)
    if isinstance(attempts, bool) or not isinstance(attempts, int) or attempts < 0:
        raise ValueError('Invalid retry attempt count')
    state = previous.get('state')
    if state == 'succeeded':
        reason = 'already_succeeded'
    elif state == 'manual_required' or previous.get('retryable') is False:
        reason = 'manual_required'
    elif attempts >= max_attempts:
        reason = 'attempts_exhausted'
    elif previous.get('nextRetryAt') and now < _time(previous['nextRetryAt']):
        reason = 'cooldown'
    else:
        reason = 'ready'
    return {'allowed': reason == 'ready', 'reason': reason, 'attempts': attempts,
            'remainingAttempts': max(0, max_attempts - attempts),
            'nextRetryAt': previous.get('nextRetryAt')}


def begin_attempt(previous, *, operation_id, phase, now, max_attempts=3,
                  delay_seconds=300):
    """Return the reservation to persist BEFORE an external recovery attempt.

    Use a separate operation_id for each date/preflight or batch/reconciliation.
    A crashed attempt still consumes its reservation and observes the cooldown.
    """
    if phase not in ('preflight', 'reconcile') or not operation_id:
        raise ValueError('A preflight or reconcile operation identity is required')
    if delay_seconds < 1:
        raise ValueError('Retry delay must be positive')
    if previous and (previous.get('operationId') != operation_id or
                     previous.get('phase') != phase):
        raise LifecycleConflict('Retry receipt belongs to another operation')
    gate = retry_gate(previous, now=now, max_attempts=max_attempts)
    if not gate['allowed']:
        raise LifecycleConflict('Retry is not due: ' + gate['reason'])
    return {'schemaVersion': 'firefly-planning-retry/v1',
            'operationId': operation_id, 'phase': phase,
            'attempts': gate['attempts'] + 1, 'maxAttempts': max_attempts,
            'state': 'running', 'retryable': True, 'startedAt': _iso(now),
            'nextRetryAt': (_time(now) + timedelta(seconds=delay_seconds)).isoformat(),
            'noWriterSubmission': True}


def finish_attempt(attempt, *, now, outcome, error=None, delay_seconds=300):
    """Close an existing reservation; error text must already be sanitized."""
    if outcome not in ('succeeded', 'retryable_error', 'manual_required'):
        raise ValueError('Invalid attempt outcome')
    if attempt.get('state') != 'running':
        raise LifecycleConflict('Only a reserved running attempt can be completed')
    if delay_seconds < 1:
        raise ValueError('Retry delay must be positive')
    result = {**attempt, 'finishedAt': _iso(now)}
    if outcome == 'retryable_error':
        result['state'] = ('exhausted' if attempt['attempts'] >= attempt['maxAttempts']
                           else 'retry_wait')
        result['nextRetryAt'] = (_time(now) + timedelta(seconds=delay_seconds)).isoformat()
    else:
        result['state'] = outcome
        result.pop('nextRetryAt', None)
    result['retryable'] = outcome == 'retryable_error'
    if error is not None:
        result['error'] = str(error)[:1000]
    return result


def preflight_error_receipt(attempt, *, today, now, error, retryable):
    """A local receipt remains available even when Notion cannot be reached."""
    Date.fromisoformat(today)
    if attempt.get('phase') != 'preflight':
        raise LifecycleConflict('Expected a reserved preflight attempt')
    receipt = finish_attempt(attempt, now=now, error=error,
                             outcome='retryable_error' if retryable else 'manual_required')
    return {**receipt, 'date': today, 'stage': 'preflight_failed',
            'noSubmission': True}


def plan_tick(batches, *, today, hour, start_hour=2, recovery_only=False,
              notion_execution_ids=None, active_batch_id=None,
              recovery_attempts=None, now=None, max_recovery_attempts=3):
    """Plan old recovery first, then today's single eligible submission.

    ``batches`` are snapshots of local batch.json/cycle-receipt.json files.
    ``notion_execution_ids`` must be the confirmed query for TODAY: None means
    unverified; [] means verified empty. No new writing is allowed without that
    readback. A pre-existing batch is ONLY reconciled, including missing routes.
    Terminal failed/incomplete jobs are never re-submitted by recovery.

    The caller catches recovery failures per action and records a bounded retry;
    a past batch needing attention must not silently consume today's schedule.
    """
    Date.fromisoformat(today)
    if not 0 <= hour <= 23 or not 0 <= start_hour <= 23:
        raise ValueError('Invalid local hour')
    if recovery_attempts is not None and now is None:
        raise ValueError('Retry-aware scheduling requires current time')
    by_id = {}
    by_date = {}
    for batch in batches:
        batch_id = batch.get('batchId')
        if not isinstance(batch_id, str) or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._-]*', batch_id):
            raise LifecycleConflict('Invalid local batch identity')
        Date.fromisoformat(batch['date'])
        if batch_id in by_id:
            raise LifecycleConflict('Duplicate local batch identity')
        by_id[batch_id] = batch
        by_date.setdefault(batch['date'], []).append(batch)
    if active_batch_id is not None and active_batch_id not in by_id:
        raise LifecycleConflict('Active batch has no matching local identity')
    if active_batch_id is not None and by_id[active_batch_id]['date'] > today:
        raise LifecycleConflict('Active batch date is in the future')
    current = by_date.get(today, [])
    if len(current) > 1:
        raise LifecycleConflict('Ambiguous same-day local batches; no new submission')
    if notion_execution_ids is not None:
        if len(notion_execution_ids) > 1:
            raise LifecycleConflict('Ambiguous same-day Notion records; no new submission')
        if notion_execution_ids and (not current or notion_execution_ids[0] != current[0]['batchId']):
            raise LifecycleConflict('Notion/local execution mismatch; no new submission')
    actions = []
    holds = []
    for batch in sorted(by_id.values(), key=lambda b: (b['date'], b['batchId'])):
        if batch['date'] > today or batch.get('status') == 'finished':
            continue
        # An explicitly identified old active batch may be resumed even when
        # historical canaries share its date. Do not guess among other duplicates.
        if len(by_date[batch['date']]) > 1 and batch['batchId'] != active_batch_id:
            holds.append({'batchId': batch['batchId'], 'reason': 'ambiguous_historical_date'})
            continue
        previous = (recovery_attempts or {}).get(batch['batchId'])
        if now is not None:
            gate = retry_gate(previous, now=now, max_attempts=max_recovery_attempts)
            if not gate['allowed']:
                holds.append({'batchId': batch['batchId'], 'reason': gate['reason']})
                continue
        actions.append({'kind': 'recover', 'batchId': batch['batchId'],
                        'date': batch['date'], 'allowWriterStart': False})
    if not current and hour >= start_hour and not recovery_only:
        if notion_execution_ids is None:
            holds.append({'date': today, 'reason': 'notion_preflight_required'})
        else:
            actions.append({'kind': 'start', 'batchId': 'daily-planning-' + today.replace('-', ''),
                            'date': today, 'allowWriterStart': True})
    return {'actions': actions, 'holds': holds,
            'generationScheduled': any(a['allowWriterStart'] for a in actions)}
