#!/usr/bin/env python3
"""Fixed CLI worker; lifetime is independent of the agent's terminal call."""
import argparse
import contextlib
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import signal
import shutil
import subprocess
import sys
import time

HQ = Path(__file__).resolve().parents[1]
MODELS = {'astra': 'gpt-6-astra', 'grok-cli': 'grok-4.6',
          'gemini-cli': 'gemini-3.1-pro-high', 'grok-supervisor': 'grok-4.6',
          'grok-web': 'web-observed', 'chatgpt-web': 'web-observed', 'gemini-web': 'web-observed'}
RUNTIME_SOURCE_FILES = (
    'scripts/planning-process.py', 'scripts/planning-astra.py',
    'scripts/planning-browser-guard.py', 'scripts/planning-browser-wait.py',
    'scripts/planning-clipboard.py', 'scripts/browser-guard-bin/ego-browser',
    'docs/web-planning-worker.md', 'docs/templates/webnovel-project-plan-v1.md',
    'config/planning-provider-policy.json', 'config/daily-planning.json',
)

class JobInterrupted(Exception):
    """Do not use InterruptedError: selectors may consume it as a retryable EINTR."""

def now():
    return dt.datetime.now(dt.timezone.utc).isoformat()

def save(path, value):
    temporary = path.with_name(path.name + f'.{os.getpid()}.tmp')
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2))
    temporary.replace(path)

def runtime_snapshot(argv):
    def digest(path):
        try:return hashlib.sha256(path.read_bytes()).hexdigest()
        except OSError:return None
    executable=shutil.which(str(argv[0])) or str(argv[0])
    executable_path=Path(executable).resolve()
    return {'schemaVersion':'firefly-runtime-file-observation/v1','observedAt':now(),
            'files':{relative:digest(HQ/relative) for relative in RUNTIME_SOURCE_FILES},
            'executable':{'path':str(executable_path),'sha256':digest(executable_path)},
            'argvSha256':hashlib.sha256(json.dumps(list(map(str,argv)),ensure_ascii=False).encode()).hexdigest(),
            'meaning':'Files observed at process start/end; not an immutable runtime copy.'}

def runtime_changes(before, after):
    changed=[name for name in sorted(set(before['files'])|set(after['files']))
             if before['files'].get(name)!=after['files'].get(name)]
    if before['executable']!=after['executable']:changed.append('runtime-executable')
    if before['argvSha256']!=after['argvSha256']:changed.append('runtime-argv')
    return changed

def process_birth(pid):
    """Identity check before signalling a registered group; do not trust a stale PID."""
    try:
        return subprocess.check_output(['/bin/ps', '-p', str(pid), '-o', 'lstart='],
                                       text=True, timeout=2).strip() or None
    except (subprocess.SubprocessError, OSError):
        return None

def live_groups():
    # macOS can return EPERM for killpg(..., 0) when only zombies remain.
    output = subprocess.check_output(['/bin/ps', '-axo', 'pgid=,stat='], text=True, timeout=2)
    return {int(fields[0]) for line in output.splitlines()
            if len(fields := line.split()) >= 2 and not fields[1].startswith('Z')}

def signal_group(pid, number):
    try:os.killpg(pid, number)
    except ProcessLookupError:pass
    except PermissionError:
        if pid in live_groups():raise

@contextlib.contextmanager
def interruptible():
    previous = {}
    def stop(signum, _frame):
        # Further termination signals must not interrupt child cleanup.
        for number in previous:signal.signal(number, signal.SIG_IGN)
        raise JobInterrupted(f'Process interrupted by signal {signum}')
    try:
        for number in (signal.SIGTERM, signal.SIGINT):
            previous[number] = signal.signal(number, stop)
        yield
    finally:
        for number, handler in previous.items():signal.signal(number, handler)

def spawn_owned(argv, directory, role, **kwargs):
    """The child registers its new group before starting any external action."""
    directory = Path(directory).resolve()
    return subprocess.Popen([sys.executable, str(Path(__file__).resolve()), 'owned-child',
                             '--directory', str(directory), '--role', role, '--', *map(str, argv)],
                            start_new_session=True, **kwargs)

def owned_child(directory, role, argv):
    registry = directory/'process-groups';registry.mkdir(parents=True, exist_ok=True)
    pid = os.getpid()
    if os.getpgid(pid) != pid:raise RuntimeError('Owned child must lead its process group')
    birth = process_birth(pid)
    if birth is None:raise RuntimeError('Could not record child identity; external action was not started')
    save(registry/f'{pid}.json', {'pid':pid, 'pgid':pid, 'birth':birth,
                                'role':role, 'registeredAt':now(), 'status':'running'})
    # A stop can race with Popen. Registration-before-check closes that launch window.
    if (directory/'job-stop.json').exists():return 125
    os.environ['FIREFLY_PROCESS_JOB'] = str(directory)
    os.execvpe(argv[0], argv, os.environ)

def stop_groups(directory, pids=None, grace=2.0, reason=None):
    """Stop only groups registered to this job, then record the cleanup evidence."""
    directory = Path(directory)
    if reason:save(directory/'job-stop.json', {'at':now(), 'reason':reason})
    selected = []
    for path in (directory/'process-groups').glob('*.json'):
        record = json.loads(path.read_text());pid = record['pgid']
        if record.get('status') != 'running' or (pids is not None and pid not in pids):continue
        if pid == os.getpgrp():continue
        birth = process_birth(pid)
        if birth is not None and birth != record.get('birth'):
            record.update(status='identity-mismatch', cleanedAt=now());save(path, record);continue
        # If the original leader exited, its children may still hold this group.
        signal_group(pid, signal.SIGTERM)
        selected.append((path, record))
    end = time.monotonic() + grace
    while selected and time.monotonic() < end:
        living = live_groups()
        alive_groups = [record['pgid'] for _, record in selected if record['pgid'] in living]
        if not alive_groups:break
        time.sleep(.05)
    for path, record in selected:
        birth = process_birth(record['pgid'])
        if birth is not None and birth != record.get('birth'):
            record.update(status='identity-mismatch', cleanedAt=now())
        else:
            signal_group(record['pgid'], signal.SIGKILL)
            record.update(status='stopped', cleanedAt=now())
        save(path, record)

def finish_owned(process, directory, grace=2.0):
    stop_groups(directory, {process.pid}, grace=grace)
    # A child not yet registered observes the stop flag only for a whole-job stop.
    # For a single operation, also signal Popen's known, unreaped PID.
    if process.poll() is None:
        signal_group(process.pid, signal.SIGKILL)
    return process.communicate()

def command(route, directory):
    model = MODELS[route]
    prompt = str(directory / 'input.md')
    if route.endswith('-web'):
        url = {'grok-web':'https://grok.com/','chatgpt-web':'https://chatgpt.com/',
               'gemini-web':'https://gemini.google.com/app?hl=ko'}[route]
        instruction = (HQ/'docs/web-planning-worker.md').read_text().replace('JOB_DIRECTORY',str(directory)).replace('SERVICE_URL',url).replace('ROUTE_NAME',route)
        return [str(Path.home()/'.grok/bin/grok'), '--cwd', str(directory/'work'),
                '--model','grok-4.6','--reasoning-effort','high','--verbatim','--no-plan',
                '--tools','run_terminal_cmd,read_file,get_task_output',
                '--disallowed-tools','search_tool,use_tool',
                '--disable-web-search','--no-subagents','--always-approve',
                '--max-turns','90','--output-format','json','-p',instruction]
    if route.startswith('grok'):
        return [str(Path.home()/'.grok/bin/grok'), '--cwd', str(directory/'work'),
                '--model', model, '--reasoning-effort', 'high', '--verbatim',
                '--no-plan', '--tools', 'read_file',
                '--disallowed-tools', 'read_file,search_tool,use_tool',
                '--disable-web-search', '--no-subagents',
                '--max-turns', '2', '--output-format', 'json', '--prompt-file', prompt]
    if route == 'gemini-cli':
        return [str(Path.home()/'.gemini/bin/agy'), '--model', model, '--effort', 'high',
                '--disable-slash-commands', '--print-timeout', '60m',
                '--output-format', 'json', '--print', (directory/'input.md').read_text()]
    return [str(Path.home()/'.hermes/hermes-agent/venv/bin/python'), str(HQ/'scripts/planning-astra.py'), '--input', prompt, '--directory', str(directory)]

def execute(directory, argv, timeout):
    job = json.loads((directory/'job.json').read_text())
    status = {**job, 'status': 'running', 'startedAt': now(), 'workerPid': os.getpid()}
    started = time.monotonic()
    start_snapshot=runtime_snapshot(argv)
    save(directory/'runtime-start.json',start_snapshot)
    save(directory/'status.json', status)
    process = None
    try:
        with interruptible(), (directory/'stdout.raw').open('w') as out, (directory/'stderr.raw').open('w') as err:
            environment = os.environ.copy()
            environment['FIREFLY_PROCESS_JOB'] = str(directory)
            if job['route'].endswith('-web'):
                environment['FIREFLY_BROWSER_JOB'] = str(directory)
                environment['FIREFLY_EGO_BINARY'] = shutil.which('ego-browser') or ''
                environment['PATH'] = str(HQ/'scripts/browser-guard-bin') + os.pathsep + environment.get('PATH', '')
            process = spawn_owned(argv, directory, 'writer', cwd=directory/'work', stdout=out,
                                  stderr=err, env=environment)
            status['writerPid'] = process.pid
            save(directory/'status.json', status)
            try:
                deadline = time.monotonic() + timeout
                while process.poll() is None:
                    if job['route'].endswith('-web') and (directory/'browser-blocked.json').exists():
                        status.update(status='blocked', error='Browser control handoff: worker stopped; explicit human resume required.')
                        break
                    if (directory/'browser-runtime-error.json').exists():
                        status.update(status='failed', error='Browser operation stopped with an uncertain execution result; inspect runtime error.')
                        break
                    if time.monotonic() >= deadline:raise subprocess.TimeoutExpired(argv, timeout)
                    time.sleep(min(.2, max(.01, deadline-time.monotonic())))
                if status['status']=='running':
                    status.update(status='process_completed' if process.returncode == 0 else 'failed')
            except subprocess.TimeoutExpired:
                status.update(status='timed_out',
                              error='Writer exceeded the explicit deadline; preserve partial output.')
            finally:
                stop_groups(directory, grace=3.5, reason=status['status'])
                finish_owned(process, directory, grace=0)
    except Exception as error:
        status.update(status='failed', error=f'{type(error).__name__}: {error}')
        stop_groups(directory, grace=3.5, reason=status['status'])
        if process is not None:finish_owned(process, directory, grace=0)
    # The child can write a marker and exit between two polls. Stop evidence wins.
    if job['route'].endswith('-web') and (directory/'browser-blocked.json').exists():
        status.update(status='blocked', error='Browser control handoff: worker stopped; explicit human resume required.')
    elif (directory/'browser-runtime-error.json').exists():
        status.update(status='failed', error='Browser operation stopped with an uncertain execution result; inspect runtime error.')
    if process is not None:status['exitCode']=process.returncode
    end_snapshot=runtime_snapshot(argv)
    save(directory/'runtime-end.json',end_snapshot)
    changed=runtime_changes(start_snapshot,end_snapshot)
    status['runtimeProvenance']={'startManifest':'runtime-start.json','endManifest':'runtime-end.json',
                                'startSha256':hashlib.sha256((directory/'runtime-start.json').read_bytes()).hexdigest(),
                                'endSha256':hashlib.sha256((directory/'runtime-end.json').read_bytes()).hexdigest(),
                                'changedFiles':changed,'driftDetected':bool(changed),
                                'meaning':'File observations only; changed files flag a potentially mixed execution.'}
    status.update(finishedAt=now(), elapsedSeconds=round(time.monotonic()-started, 2))
    status['rawFiles'] = {name: hashlib.sha256((directory/name).read_bytes()).hexdigest()
                         for name in ('stdout.raw', 'stderr.raw') if (directory/name).exists()}
    status['meaning'] = 'Process completion only; response extraction, format, publication and HIL are separate.'
    save(directory/'receipt.json', status)
    save(directory/'status.json', status)
    return status

def main():
    if len(sys.argv)>1 and sys.argv[1]=='owned-child':
        child=argparse.ArgumentParser();child.add_argument('--directory',required=True)
        child.add_argument('--role',required=True);child.add_argument('command',nargs=argparse.REMAINDER)
        args=child.parse_args(sys.argv[2:]);argv=args.command
        if argv and argv[0]=='--':argv=argv[1:]
        if not argv:child.error('command required')
        return owned_child(Path(args.directory).resolve(),args.role,argv)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['start', 'status', 'worker'])
    parser.add_argument('--directory', required=True)
    parser.add_argument('--route', choices=list(MODELS))
    parser.add_argument('--input')
    parser.add_argument('--timeout', type=int, default=3600)
    args = parser.parse_args()
    directory = Path(args.directory).resolve()
    if args.action == 'status':
        path = directory / ('receipt.json' if (directory/'receipt.json').exists() else 'status.json')
        print(path.read_text())
        return
    if args.action == 'worker':
        job = json.loads((directory/'job.json').read_text())
        execute(directory, command(job['route'], directory), job['timeoutSeconds'])
        return
    if not args.route or not args.input or not 1 <= args.timeout <= 3600:
        parser.error('start requires --route, --input and a timeout from 1 to 3600 seconds')
    policy = json.loads((HQ/'config/planning-provider-policy.json').read_text())
    if args.route in policy['disabledRoutes']:
        parser.error('Route retired by user')
    prompt = Path(args.input).read_bytes()
    if not prompt.strip():
        parser.error('Input is empty')
    directory.mkdir(parents=True, exist_ok=False)  # Never overwrite or resubmit an existing job.
    (directory/'work').mkdir()
    (directory/'input.md').write_bytes(prompt)
    job = {'schemaVersion': 'firefly-planning-process/v1', 'route': args.route,
           'modelRequested': MODELS[args.route], 'inputSha256': hashlib.sha256(prompt).hexdigest(),
           'reasoningRequested': 'highest-available' if args.route.endswith('-web') else 'medium' if args.route=='astra' else 'high',
           'timeoutSeconds': args.timeout, 'queuedAt': now()}
    if args.route.endswith('-web'):
        job.update(requestedWebMode='highest-available', controllerModelRequested='grok-4.6',
                   controllerReasoningRequested='high')
    save(directory/'job.json', job)
    save(directory/'status.json', {**job, 'status': 'queued'})
    with (directory/'worker.log').open('a') as log:
        process = subprocess.Popen([sys.executable, str(Path(__file__).resolve()), 'worker',
                                    '--directory', str(directory)], stdin=subprocess.DEVNULL,
                                   stdout=log, stderr=log, start_new_session=True)
    save(directory/'spawn-receipt.json', {'workerPid': process.pid, 'startedAt': now()})
    print(json.dumps({'directory': str(directory), 'workerPid': process.pid, 'status': 'started'}))

if __name__ == '__main__':
    sys.exit(main())
