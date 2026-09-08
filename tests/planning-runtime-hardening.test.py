"""Local runtime canaries: fake workers only, no browser, model, clipboard or external writes."""
import contextlib
import fcntl
import importlib.util
import io
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import time
import types
import unittest
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]
def module(name,file):
    spec=importlib.util.spec_from_file_location(name,ROOT/file)
    value=importlib.util.module_from_spec(spec);spec.loader.exec_module(value);return value
worker=module('hardening_worker','scripts/planning-process.py')

def running(pid):
    result=subprocess.run(['/bin/ps','-p',str(pid),'-o','stat='],text=True,capture_output=True)
    return result.returncode==0 and result.stdout.strip() and not result.stdout.strip().startswith('Z')

def wait_file(path,seconds=5):
    end=time.monotonic()+seconds
    while not path.exists() and time.monotonic()<end:time.sleep(.02)
    if not path.exists():raise AssertionError('Fixture failed to start: '+str(path))

def fake_ego(directory):
    script=directory/'fake-ego'
    script.write_text('#!'+sys.executable+'\nimport os,time\nfrom pathlib import Path\nPath('+repr(str(directory/'ego.pid'))+').write_text(str(os.getpid()))\ntime.sleep(30)\n')
    script.chmod(0o700);return script

class RuntimeHardening(unittest.TestCase):
    def test_exit_zero_cannot_override_handoff_marker(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory=Path(temporary);(directory/'work').mkdir();(directory/'job.json').write_text('{"route":"grok-web"}')
            result=worker.execute(directory,[sys.executable,'-c',"from pathlib import Path;Path('../browser-blocked.json').write_text('{}')"],3)
            self.assertEqual(result['status'],'blocked');self.assertEqual(result['exitCode'],0)

    def test_timeout_cleans_registered_detached_descendant(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory=Path(temporary);(directory/'work').mkdir();(directory/'job.json').write_text('{"route":"grok-web"}')
            code=("import importlib.util,sys,time;from pathlib import Path;"
                  "s=importlib.util.spec_from_file_location('w',"+repr(str(ROOT/'scripts/planning-process.py'))+");"
                  "w=importlib.util.module_from_spec(s);s.loader.exec_module(w);"
                  "p=w.spawn_owned([sys.executable,'-c',\"import os,time;from pathlib import Path;Path('../child.pid').write_text(str(os.getpid()));time.sleep(30)\"],Path('..').resolve(),'fixture-copy');time.sleep(30)")
            result=worker.execute(directory,[sys.executable,'-c',code],.5)
            self.assertEqual(result['status'],'timed_out')
            self.assertFalse(running(int((directory/'child.pid').read_text())))
            self.assertTrue((directory/'job-stop.json').exists())

    def test_stop_before_owned_child_launch_prevents_action(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory=Path(temporary);(directory/'job-stop.json').write_text('{}')
            process=worker.spawn_owned([sys.executable,'-c',"from pathlib import Path;Path('unexpected').touch()"],directory,'fixture',cwd=directory)
            self.assertEqual(process.wait(timeout=3),125);self.assertFalse((directory/'unexpected').exists())
            worker.stop_groups(directory,grace=0)

    def test_runtime_manifest_detects_midrun_file_change(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory=Path(temporary);(directory/'work').mkdir();(directory/'job.json').write_text('{"route":"fixture"}')
            source=directory/'fixture-runtime.txt';source.write_text('before')
            with patch.object(worker,'HQ',directory),patch.object(worker,'RUNTIME_SOURCE_FILES',('fixture-runtime.txt',)):
                result=worker.execute(directory,[sys.executable,'-c',"from pathlib import Path;Path('../fixture-runtime.txt').write_text('after')"],3)
            self.assertEqual(result['status'],'process_completed')
            self.assertTrue(result['runtimeProvenance']['driftDetected'])
            self.assertEqual(result['runtimeProvenance']['changedFiles'],['fixture-runtime.txt'])
            self.assertTrue((directory/'runtime-start.json').exists());self.assertTrue((directory/'runtime-end.json').exists())

    def test_worker_sigterm_keeps_terminal_receipt_and_cleans_writer(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory=Path(temporary);(directory/'work').mkdir();(directory/'job.json').write_text('{"route":"grok-web"}')
            writer="import os,time;from pathlib import Path;Path('../writer.pid').write_text(str(os.getpid()));time.sleep(30)"
            code=("import importlib.util,sys;from pathlib import Path;s=importlib.util.spec_from_file_location('w',"+repr(str(ROOT/'scripts/planning-process.py'))+");w=importlib.util.module_from_spec(s);s.loader.exec_module(w);w.execute(Path("+repr(str(directory))+"),[sys.executable,'-c',"+repr(writer)+"],30)")
            process=subprocess.Popen([sys.executable,'-B','-c',code],stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
            try:
                wait_file(directory/'writer.pid');process.send_signal(signal.SIGTERM);process.wait(timeout=6)
                self.assertFalse(running(int((directory/'writer.pid').read_text())))
                receipt=json.loads((directory/'receipt.json').read_text())
                self.assertEqual(receipt['status'],'failed');self.assertIn('JobInterrupted',receipt['error'])
            finally:
                if process.poll() is None:process.kill();process.wait()
                process.stderr.close();worker.stop_groups(directory,grace=0)

    def test_busy_queue_is_bounded_without_starting_browser(self):
        guard=module('hardening_guard_busy','scripts/planning-browser-guard.py')
        with tempfile.TemporaryDirectory() as temporary:
            directory=Path(temporary);(directory/'.firefly').mkdir();guard.HQ=directory
            with (directory/'.firefly/browser-control.lock').open('a') as handle:
                fcntl.flock(handle,fcntl.LOCK_EX)
                output=io.StringIO();start=time.monotonic()
                with patch.dict(os.environ,{'FIREFLY_BROWSER_JOB':str(directory),'FIREFLY_EGO_BINARY':'/no-browser'}),patch.object(sys,'argv',['guard','nodejs']),patch.object(sys,'stdin',io.StringIO('await snapshotText()')),contextlib.redirect_stdout(output):
                    code=guard.main(call_seconds=.15)
            self.assertEqual(code,75);self.assertLess(time.monotonic()-start,1)
            self.assertEqual(json.loads(output.getvalue())['status'],'busy')
            self.assertFalse((directory/'browser-runtime-error.json').exists())
            self.assertFalse((directory/'process-groups').exists())

    def test_guard_timeout_reaps_browser_before_unlocking(self):
        guard=module('hardening_guard_timeout','scripts/planning-browser-guard.py')
        with tempfile.TemporaryDirectory() as temporary:
            directory=Path(temporary);guard.HQ=directory;executable=fake_ego(directory)
            with patch.dict(os.environ,{'FIREFLY_BROWSER_JOB':str(directory),'FIREFLY_EGO_BINARY':str(executable)}),patch.object(sys,'argv',['guard','nodejs']),patch.object(sys,'stdin',io.StringIO('fixture')),contextlib.redirect_stderr(io.StringIO()):
                self.assertEqual(guard.main(call_seconds=1),124)
            self.assertFalse(running(int((directory/'ego.pid').read_text())))
            self.assertTrue((directory/'browser-runtime-error.json').exists())
            with (directory/'.firefly/browser-control.lock').open('a') as handle:
                fcntl.flock(handle,fcntl.LOCK_EX|fcntl.LOCK_NB)

    def test_clipboard_sigterm_cleans_copy_group_and_writes_receipt(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory=Path(temporary);output=directory/'plan.md';pidfile=directory/'copy.pid'
            code=("import importlib.util,sys;from pathlib import Path;s=importlib.util.spec_from_file_location('c',"+repr(str(ROOT/'scripts/planning-clipboard.py'))+");c=importlib.util.module_from_spec(s);s.loader.exec_module(c);c.HQ=Path("+repr(str(directory))+");sys.argv=['clipboard','--output',"+repr(str(output))+",'--anchor','a','--anchor','b'];sys.exit(c.main())")
            process=subprocess.Popen([sys.executable,'-B','-c',code],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
            try:
                process.stdin.write('echo $$ > '+str(pidfile)+'\nsleep 30\n');process.stdin.close()
                wait_file(pidfile);process.send_signal(signal.SIGTERM);process.wait(timeout=6)
                self.assertFalse(running(int(pidfile.read_text())))
                receipts=list(directory.glob('plan.md.*.receipt.json'));self.assertEqual(len(receipts),1)
                self.assertEqual(json.loads(receipts[0].read_text())['status'],'failed');self.assertFalse(output.exists())
                with (directory/'.firefly/clipboard.lock').open('a') as handle:fcntl.flock(handle,fcntl.LOCK_EX|fcntl.LOCK_NB)
            finally:
                if process.poll() is None:process.kill();process.wait()
                process.stdout.close();process.stderr.close()
                worker.stop_groups(directory,grace=0)

    def test_wait_queue_busy_returns_pending(self):
        wait=module('hardening_wait','scripts/planning-browser-wait.py')
        fake=types.SimpleNamespace(returncode=75,communicate=lambda *a,**k:('{"status":"busy"}',''))
        now=[0.0]
        with tempfile.TemporaryDirectory() as temporary,patch.dict(os.environ,{'FIREFLY_BROWSER_JOB':temporary}),patch.object(sys,'argv',['wait','--task','1','--stop-selector','button.stop','--response-selector','.answer','--seconds','1']),patch.object(wait.runtime,'spawn_owned',return_value=fake),patch.object(wait.runtime,'finish_owned'),patch.object(wait.time,'monotonic',side_effect=lambda:now[0]),patch.object(wait.time,'sleep',side_effect=lambda s:now.__setitem__(0,now[0]+s)),contextlib.redirect_stdout(io.StringIO()) as output:
            self.assertEqual(wait.main(),0)
        self.assertEqual(json.loads(output.getvalue())['status'],'pending')
        self.assertEqual(json.loads(output.getvalue())['queueBusyPolls'],1)

    def test_wait_uses_guard_even_when_caller_path_points_to_real_cli(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory=Path(temporary);(directory/'browser-blocked.json').write_text('{}')
            fake=directory/'ego-browser';fake.write_text('#!/bin/sh\ntouch '+str(directory/'unexpected')+'\nprintf "FIREFLY_STATE {\\"busy\\":false,\\"text\\":\\"wrong\\"}\\n"\n');fake.chmod(0o700)
            env={**os.environ,'PATH':str(directory)+os.pathsep+os.environ.get('PATH',''),
                 'FIREFLY_BROWSER_JOB':str(directory),'FIREFLY_EGO_BINARY':str(fake)}
            result=subprocess.run([sys.executable,'-B',str(ROOT/'scripts/planning-browser-wait.py'),
                                   '--task','1','--stop-selector','.stop','--response-selector','.answer','--seconds','1'],
                                   env=env,text=True,capture_output=True,timeout=5)
            self.assertEqual(result.returncode,73,result.stderr)
            self.assertFalse((directory/'unexpected').exists())

    def test_wait_reads_ego_cli_log_from_stderr(self):
        wait=module('hardening_wait_stderr','scripts/planning-browser-wait.py')
        state='FIREFLY_STATE '+json.dumps({'busy':False,'text':'fixture complete'})+'\n'
        fake=types.SimpleNamespace(returncode=0,communicate=lambda *a,**k:('',state))
        now=[0.0]
        with tempfile.TemporaryDirectory() as temporary,patch.dict(os.environ,{'FIREFLY_BROWSER_JOB':temporary}),patch.object(sys,'argv',['wait','--task','1','--stop-selector','button.stop','--response-selector','.answer','--seconds','41']),patch.object(wait.runtime,'spawn_owned',return_value=fake),patch.object(wait.runtime,'finish_owned'),patch.object(wait.time,'monotonic',side_effect=lambda:now[0]),patch.object(wait.time,'sleep',side_effect=lambda s:now.__setitem__(0,now[0]+s)),contextlib.redirect_stdout(io.StringIO()) as output:
            self.assertEqual(wait.main(),0)
        observed=json.loads(output.getvalue())
        self.assertEqual(observed['status'],'stable');self.assertEqual(observed['characters'],len('fixture complete'))

    def test_astra_provenance_and_request_survive_call_failure(self):
        astra=module('hardening_astra','scripts/planning-astra.py')
        with tempfile.TemporaryDirectory() as temporary:
            directory=Path(temporary);input_path=directory/'input.md';input_path.write_text('fixture')
            class Transport:
                def build_kwargs(self,*a,**k):return {'model':'gpt-6-astra','reasoning':{'effort':'medium'}}
            class Agent:
                def __init__(self,**kwargs):self.reasoning_config=kwargs['reasoning_config']
                def run_conversation(self,text):
                    before=json.loads((directory/'runtime-observation.json').read_text())
                    self_test.assertEqual(before['status'],'ready');self_test.assertIn('adapterSha256',before['runtime'])
                    Transport().build_kwargs()
                    prepared=json.loads((directory/'runtime-observation.json').read_text())
                    self_test.assertEqual(prepared['status'],'request-prepared');self_test.assertEqual(len(prepared['requests']),1)
                    raise RuntimeError('fixture provider failure; no request sent')
            self_test=self
            fake_modules={
                'hermes_cli.runtime_provider':types.SimpleNamespace(resolve_runtime_provider=lambda **k:{}),
                'hermes_cli.oneshot':types.SimpleNamespace(_create_session_db_for_oneshot=lambda:None,_close_agent=lambda *a:None,_write_usage_file=lambda *a:None),
                'run_agent':types.SimpleNamespace(AIAgent=Agent),
                'agent.transports.codex':types.SimpleNamespace(ResponsesApiTransport=Transport),
            }
            with patch.dict(sys.modules,fake_modules),patch.object(sys,'argv',['astra','--input',str(input_path),'--directory',str(directory)]):
                with self.assertRaisesRegex(RuntimeError,'fixture provider'):astra.main()
            observed=json.loads((directory/'runtime-observation.json').read_text())
            self.assertEqual(observed['status'],'failed');self.assertEqual(len(observed['requests']),1)
            self.assertEqual(observed['effectiveReasoning'],None)
            self.assertEqual(observed['errorType'],'RuntimeError')

if __name__=='__main__':unittest.main()
