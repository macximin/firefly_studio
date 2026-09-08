#!/usr/bin/env python3
"""Scoped Ego gateway with a shared queue/execution deadline and owned child cleanup."""
import fcntl
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time

HQ = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('planning_process', HQ/'scripts/planning-process.py')
runtime = importlib.util.module_from_spec(spec);spec.loader.exec_module(runtime)
STOP = re.compile(r'user has taken control|user is controlling|not assigned to an agent|task space.{0,40}inactive', re.I)

def rejection(script, blocked):
    if blocked:return 'This task is blocked pending explicit human resume outside this worker.'
    if re.search(r'\b(takeOverTaskSpace|claimTaskSpace|waitForAgentControl)\s*\(', script):
        return 'Autonomous takeover is unavailable in unattended workers.'
    return None

def main(call_seconds=90):
    directory = Path(os.environ['FIREFLY_BROWSER_JOB'])
    blocked = directory/'browser-blocked.json';script = sys.stdin.read()
    reason = rejection(script, blocked.exists())
    if reason:print(reason, file=sys.stderr);return 73
    if sys.argv[1:] != ['nodejs']:print('Only nodejs heredocs supported', file=sys.stderr);return 73
    real = os.environ['FIREFLY_EGO_BINARY']
    deadline = min(time.monotonic()+call_seconds,
                   float(os.environ.get('FIREFLY_BROWSER_DEADLINE_MONOTONIC', 'inf')))
    lock = HQ/'.firefly/browser-control.lock';lock.parent.mkdir(parents=True, exist_ok=True)
    process = None
    try:
        with runtime.interruptible(), lock.open('a') as handle:
            while True:
                if blocked.exists() or (directory/'job-stop.json').exists():return 73
                if time.monotonic() >= deadline:
                    print(json.dumps({'status':'busy', 'reason':'Browser queue deadline; no operation started'}))
                    return 75
                try:fcntl.flock(handle, fcntl.LOCK_EX|fcntl.LOCK_NB);break
                except BlockingIOError:time.sleep(min(.1, max(0, deadline-time.monotonic())))
            if blocked.exists() or (directory/'job-stop.json').exists():return 73
            process = runtime.spawn_owned([real, 'nodejs'], directory, 'ego-browser',
                                          stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                          stderr=subprocess.PIPE, text=True)
            try:
                stdout, stderr = process.communicate(script, timeout=max(.01, deadline-time.monotonic()))
                if STOP.search(stdout+stderr):
                    runtime.save(blocked, {'blockedAt':time.time(), 'reason':'Ego control handoff',
                                          'scriptSha256':hashlib.sha256(script.encode()).hexdigest()})
                sys.stdout.write(stdout);sys.stderr.write(stderr)
                return 73 if blocked.exists() else process.returncode
            except (subprocess.TimeoutExpired, runtime.JobInterrupted) as error:
                runtime.save(directory/'browser-runtime-error.json', {
                    'at':runtime.now(), 'kind':type(error).__name__,
                    'reason':'Browser operation interrupted; its result is uncertain. Do not resubmit.',
                    'scriptSha256':hashlib.sha256(script.encode()).hexdigest()})
                print('Browser operation stopped; inspect browser-runtime-error.json', file=sys.stderr)
                return 124
            finally:
                # Stop and reap Ego before releasing the shared browser lock.
                runtime.finish_owned(process, directory)
    except runtime.JobInterrupted:
        print('Browser queue interrupted; no operation started', file=sys.stderr)
        return 75

if __name__ == '__main__':sys.exit(main())
