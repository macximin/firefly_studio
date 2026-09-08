import importlib.util,json,os,subprocess,sys,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[1]
def module(name,path):
 s=importlib.util.spec_from_file_location(name,ROOT/path);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
class Reliability(unittest.TestCase):
 def test_handoff_latches_and_rejects_takeover(self):
  with tempfile.TemporaryDirectory() as t:
   d=Path(t);fake=d/'ego';fake.write_text('#!/bin/sh\ncat >/dev/null\nprintf "Error: The user has taken control of this task space\\n"\n');fake.chmod(0o700)
   env={**os.environ,'FIREFLY_BROWSER_JOB':str(d),'FIREFLY_EGO_BINARY':str(fake)}
   cmd=[sys.executable,str(ROOT/'scripts/planning-browser-guard.py'),'nodejs']
   r=subprocess.run(cmd,input='await snapshotText()',text=True,capture_output=True,env=env);self.assertEqual(r.returncode,73);self.assertTrue((d/'browser-blocked.json').exists())
   fake.write_text('#!/bin/sh\ntouch "'+str(d/'unexpected')+'"\n')
   r=subprocess.run(cmd,input='await takeOverTaskSpace(3)',text=True,capture_output=True,env=env);self.assertEqual(r.returncode,73);self.assertFalse((d/'unexpected').exists())
 def test_fixed_worker_terminates_on_handoff_marker(self):
  m=module('worker','scripts/planning-process.py')
  with tempfile.TemporaryDirectory() as t:
   d=Path(t);(d/'work').mkdir();(d/'job.json').write_text('{"route":"grok-web"}')
   code="from pathlib import Path;import time;Path('../browser-blocked.json').write_text('{}');time.sleep(30)"
   r=m.execute(d,[sys.executable,'-c',code],10)
   self.assertEqual(r['status'],'blocked');self.assertLess(r['elapsedSeconds'],5)
 def test_unblocked_takeover_also_rejected(self):
  m=module('guard','scripts/planning-browser-guard.py');self.assertIsNotNone(m.rejection('await takeOverTaskSpace(3)',False))
 def test_plain_headers_do_not_mean_missing_six_ws(self):
  answers='\n'.join(w+': 인물의 구체적인 행동과 이득을 설명한다.' for w in ['WHO','WHAT','HOW','WHERE','WHEN','WHY'])
  m=module('daily','scripts/daily-planning.py');text='\n'.join(str(i)+'. 항목\n'+(answers if i==2 else '인물과 사건의 구체적인 실행을 설명한다.') for i in range(1,10))
  self.assertEqual(m.format_body(text)[1],['합의한 1~9절 확인 필요'])
  f=module('fmt','scripts/planning-format.py');fixed=f.normalize_document(text);self.assertFalse(m.format_body(fixed)[1]);self.assertEqual(f.content_tokens(text),f.content_tokens(fixed))
 def test_missing_hil_coverage_blocks_prepare(self):
  m=module('daily_hil','scripts/daily-planning.py')
  with tempfile.TemporaryDirectory() as t,patch.object(m,'site',return_value={'decisions':[]}):
   with self.assertRaisesRegex(RuntimeError,'HIL coverage'):m.prepare(Path(t),'2026-09-08')
if __name__=='__main__':unittest.main()
