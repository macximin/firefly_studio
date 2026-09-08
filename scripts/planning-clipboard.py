#!/usr/bin/env python3
"""Serialize a browser Copy script and macOS clipboard capture. Shell script on stdin."""
import argparse
import fcntl
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import time

HQ = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('planning_process', HQ/'scripts/planning-process.py')
runtime = importlib.util.module_from_spec(spec);spec.loader.exec_module(runtime)

def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--output', required=True)
    p.add_argument('--expected-file')
    p.add_argument('--anchor', action='append', default=[])
    a = p.parse_args()
    if not a.expected_file and len(a.anchor) < 2:
        p.error('Require exact expected file, or at least two distinctive observed response anchors')
    script = sys.stdin.read()
    output = Path(a.output).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    directory = Path(os.environ.get('FIREFLY_PROCESS_JOB', os.environ.get('FIREFLY_BROWSER_JOB', str(output.parent))))
    lock = HQ / '.firefly/clipboard.lock'
    lock.parent.mkdir(parents=True, exist_ok=True)
    receipt = {'status': 'failed', 'requestedAt': time.time(), 'pid': os.getpid(), 'output': str(output)}
    code = 1
    try:
        with runtime.interruptible(), lock.open('a') as handle:
            deadline = time.monotonic() + 180
            while True:
                try:
                    fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
                    break
                except BlockingIOError:
                    if time.monotonic() > deadline:
                        raise TimeoutError('Clipboard lock wait exceeded 180 seconds')
                    time.sleep(.1)
            receipt['lockAcquiredAt'] = time.time()
            if output.exists():
                raise FileExistsError('Capture output already exists')
            environment=os.environ.copy()
            # Grok's terminal shell can reset PATH. Restore the scoped shim inside
            # this fixed, non-login Copy shell, independently of its caller.
            environment['PATH']=str(Path(__file__).resolve().parents[1]/'scripts/browser-guard-bin')+os.pathsep+environment.get('PATH','')
            process = runtime.spawn_owned(['/bin/bash', '-e'], directory, 'clipboard-copy',
                                          stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                          stderr=subprocess.PIPE, text=True,env=environment)
            receipt['copyProcessGroup'] = process.pid
            try:
                stdout, stderr = process.communicate(script, timeout=90)
            except (subprocess.TimeoutExpired, runtime.JobInterrupted) as error:
                if os.environ.get('FIREFLY_BROWSER_JOB'):
                    runtime.save(directory/'browser-runtime-error.json', {
                        'at':runtime.now(), 'kind':type(error).__name__,
                        'reason':'Copy interrupted; preserve the conversation and do not resubmit.'})
                raise TimeoutError('Copy interrupted; owned process group stopped before releasing lock') from error
            finally:
                runtime.finish_owned(process, directory)
            result = subprocess.CompletedProcess(process.args, process.returncode, stdout, stderr)
            copy_log=output.with_suffix(output.suffix + f'.{os.getpid()}.copy.log')
            copy_log.write_text(result.stdout + result.stderr)
            receipt['copyLogPath']=str(copy_log)
            receipt['copyExitCode']=result.returncode
            combined = (result.stdout + result.stderr).lower()
            if result.returncode or 'firefly_copy_confirmed' not in combined or any(x in combined for x in
                ['user has taken control', 'user is controlling', 'inactive', 'not assigned to an agent']):
                raise RuntimeError('Copy script failed or did not confirm the actual Copy action; inspect copy log')
            data = subprocess.check_output(['/usr/bin/pbpaste'], timeout=10)
            text = data.decode('utf-8')
            if not data.strip():
                raise ValueError('Clipboard empty')
            if a.expected_file and data != Path(a.expected_file).read_bytes():
                raise ValueError('Clipboard differs from expected source')
            if any(anchor not in text for anchor in a.anchor):
                raise ValueError('Clipboard does not match observed response anchors')
            with output.open('xb') as target:
                target.write(data)
            receipt.update(status='complete', sha256=hashlib.sha256(data).hexdigest(),
                           bytes=len(data), characters=len(text), capturedAt=time.time(),
                           method='ego-copy+os-pbpaste', verified=True)
            code = 0
    except Exception as error:
        receipt['error'] = str(error)
    receipt['finishedAt'] = time.time()
    # One receipt per invocation; never replace a previous result.
    receipt_path = output.with_suffix(output.suffix + f'.{os.getpid()}.receipt.json')
    receipt_path.write_text(json.dumps(receipt, ensure_ascii=False, indent=2))
    print(json.dumps(receipt, ensure_ascii=False))
    return code

if __name__ == '__main__':
    sys.exit(main())
