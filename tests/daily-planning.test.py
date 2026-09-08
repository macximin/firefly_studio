import importlib.util
import datetime as dt
import json
import io
from pathlib import Path
import sys
import tempfile
import unittest
import urllib.error
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]
def module(name,path):
    spec=importlib.util.spec_from_file_location(name,path)
    value=importlib.util.module_from_spec(spec);spec.loader.exec_module(value);return value
daily=module('daily',ROOT/'scripts/daily-planning.py')
worker=module('worker',ROOT/'scripts/planning-process.py')
WORDS=['WHO','WHAT','HOW','WHERE','WHEN','WHY']
def valid_plan():
    return '\n'.join(f'## {i}. Section\n'+('\n'.join(w+': 구체적인 주인공의 실행과 목표를 설명한다.' for w in WORDS) if i==2 else '구체적인 사건과 인물의 이득을 기록한다.') for i in range(1,10))

class Clock(dt.datetime):
    current=dt.datetime(2026,9,8,2,0,tzinfo=dt.timezone(dt.timedelta(hours=9)))
    @classmethod
    def now(cls,tz=None):return cls.current.astimezone(tz) if tz else cls.current.replace(tzinfo=None)

class DailyTests(unittest.TestCase):
    def test_terminal_receipts_keep_failure_and_partial_output(self):
        for code,limit,state in [('print("body")',3,'process_completed'),('print("partial",flush=True);raise SystemExit(3)',3,'failed'),('import time;print("partial",flush=True);time.sleep(10)',0.2,'timed_out')]:
            with tempfile.TemporaryDirectory() as t:
                d=Path(t);(d/'work').mkdir();(d/'job.json').write_text('{"route":"test"}')
                result=worker.execute(d,[sys.executable,'-c',code],limit)
                self.assertEqual(result['status'],state)
                self.assertTrue((d/'stdout.raw').read_text().strip())
                self.assertEqual(json.loads((d/'receipt.json').read_text())['rawFiles'],result['rawFiles'])

    def test_zero_exit_is_not_a_complete_plan(self):
        self.assertTrue(daily.format_body('Process complete.')[1])
        body=valid_plan()
        self.assertEqual(daily.format_body(body)[1],[])
        self.assertIn('HOW 확인 필요',daily.format_body(body.replace('HOW',''))[1])

    def test_mismatched_publication_does_not_get_verified_receipt(self):
        with tempfile.TemporaryDirectory() as t:
            with patch.object(daily,'site',side_effect=[{}, {'canary':{'outputSha256':'wrong'}}]):
                with self.assertRaises(RuntimeError):daily.publish(Path(t),[{'id':'x','outputSha256':'expected'}])
            self.assertFalse((Path(t)/'publication-receipt.json').exists())

    def test_existing_directory_cannot_submit_twice(self):
        import subprocess
        with tempfile.TemporaryDirectory() as t:
            p=Path(t);input_file=p/'input.md';input_file.write_text('Never call a model during this test.')
            result=subprocess.run([sys.executable,str(ROOT/'scripts/planning-process.py'),'start','--route','grok-cli','--input',str(input_file),'--directory',str(p)],capture_output=True)
            self.assertNotEqual(result.returncode,0)
            self.assertFalse((p/'job.json').exists())

    def test_cached_packet_is_immutable_while_late_operational_marker_wins_separately(self):
        with tempfile.TemporaryDirectory() as t:
            batch=Path(t);directory=batch/'grok-web';directory.mkdir()
            body=valid_plan();out=daily.sha(body)
            c={'id':'immutable','state':'complete','markdown':body,'inputSha256':'a'*64,'outputSha256':out,
               'author':{'model':'old model'},'receipt':{'inputSha256':'a'*64,'outputSha256':out}}
            cached=directory/'canary.json';cached.write_text(json.dumps(c));before=cached.read_bytes()
            (directory/'browser-runtime-error.json').write_text('{"error":"timed out"}')
            with patch.object(daily,'extract',side_effect=AssertionError('Must reuse immutable packet')):
                result=daily.collect(batch,'grok-web')
            self.assertEqual(result,c);self.assertEqual(cached.read_bytes(),before)
            status=daily.read(directory/'operational-status.json')
            self.assertEqual(status['operationalState'],'failed');self.assertTrue(status['immutablePacketUnchanged'])

    def test_new_web_packet_cannot_be_complete_after_stop_marker(self):
        with tempfile.TemporaryDirectory() as t:
            batch=Path(t);directory=batch/'grok-web';directory.mkdir()
            inp={'promptSha256':'a'*64};daily.save(batch/'input-receipt.json',inp)
            body=valid_plan();daily.save(directory/'receipt.json',{'inputSha256':'a'*64,'status':'process_completed','finishedAt':'2026-09-08T00:00:00Z','modelRequested':'web-observed'})
            daily.save(directory/'web-receipt.json',{'inputSha256':'a'*64,'outputSha256':daily.sha(body),'status':'complete','observedMode':'전문가'})
            (directory/'plan.md').write_text(body);(directory/'browser-blocked.json').write_text('{}')
            result=daily.collect(batch,'grok-web')
            self.assertEqual(result['state'],'failed');self.assertTrue(daily.operational_events(batch))

    def test_author_uses_recorded_requests_and_provider_observation_not_current_defaults(self):
        with tempfile.TemporaryDirectory() as t:
            directory=Path(t)
            (directory/'stdout.raw').write_text('{"modelUsage":{"actual-model":{"modelCalls":1}}}')
            evidence=daily.author_evidence(directory,'grok-cli',{'modelRequested':'old-request','reasoningRequested':'high'},{},{})
            self.assertEqual(evidence['requestedModel'],'old-request')
            self.assertEqual(evidence['observedModel'],'actual-model')
            self.assertIsNone(evidence['observedReasoning'])
            (directory/'stdout.raw').unlink()
            unknown=daily.author_evidence(directory,'astra',{}, {},{})
            self.assertEqual(unknown['model'],'미확인');self.assertIsNone(unknown['requestedReasoning'])

    def test_publication_readback_checks_metadata_not_only_body_hash(self):
        c={'id':'same','state':'complete','outputSha256':'expected','author':{'model':'recorded'}}
        with tempfile.TemporaryDirectory() as t,patch.object(daily,'site',side_effect=[{}, {'canary':{**c,'author':{'model':'wrong'}}}]):
            with self.assertRaisesRegex(RuntimeError,'readback'):daily.publish(Path(t),[c])

    def test_web_mode_and_request_placeholder_do_not_become_model_identity(self):
        receipt={'modelRequested':'web-observed','requestedWebMode':'highest-available'}
        cases=[{'observedMode':'전문가','observedModelLabel':'전문가','observedModeDescription':'깊게 생각 · Grok4.6'},
               {'observedMode':'전문가','model':'전문가'},
               {'observedMode':'Pro Extended','observedModeDetails':{'modelLabel':'Pro Extended'}}]
        with tempfile.TemporaryDirectory() as t:
            for web in cases:
                with self.subTest(web=web):
                    evidence=daily.author_evidence(Path(t),'grok-web',receipt,web,{})
                    self.assertEqual(evidence['model'],'미확인')
                    self.assertIsNone(evidence['requestedModel']);self.assertIsNone(evidence['observedModel'])
                    self.assertEqual(evidence['observedMode'],web['observedMode'])
                    self.assertEqual(evidence['modelEvidence'],'unknown')
            actual=daily.author_evidence(Path(t),'grok-web',receipt,{'model':'Grok 4.6','observedMode':'전문가'},{})
            self.assertEqual(actual['model'],'Grok 4.6');self.assertEqual(actual['modelEvidence'],'web-observed')

    def test_recovery_records_missing_route_without_any_model_call(self):
        with tempfile.TemporaryDirectory() as t:
            root=Path(t);batch=root/'batch';batch.mkdir();state=root/'state';state.mkdir()
            daily.save(batch/'batch.json',{'batchId':'batch','date':'2026-09-08','routes':['grok-cli']})
            (batch/'input.md').write_text('prepared');daily.save(batch/'input-receipt.json',{'promptSha256':daily.sha('prepared')})
            daily.save(batch/'notion-detail-receipt.json',{'done':True})
            with patch.object(daily,'STATE',state),patch.object(daily,'record',return_value='page'),patch.object(daily,'publish',return_value=[]),patch.object(daily,'summary',return_value={'summary':'ok','nextAction':'read'}) as summary,patch.object(daily.subprocess,'run',side_effect=AssertionError('No new model during recovery')):
                result=daily.cycle(batch,'2026-09-08',allow_writer_start=False)
            self.assertEqual(result['counts']['응답 미회수'],1)
            self.assertEqual(daily.read(batch/'grok-cli'/'receipt.json')['status'],'not_submitted')
            self.assertFalse(summary.call_args.kwargs['allow_model_start'])

    def test_main_recovers_old_then_submits_today_once_and_skips_later_network_calls(self):
        with tempfile.TemporaryDirectory() as t:
            root=Path(t);batches=root/'batches';batches.mkdir();state=root/'state'
            old=batches/'old';old.mkdir();daily.save(old/'batch.json',{'batchId':'old','date':'2026-09-07'})
            called=[]
            def recover(batch,date):called.append(('recover',date));daily.save(batch/'cycle-receipt.json',{'status':'finished'});return {'status':'finished'}
            def cycle(batch,date,**kwargs):
                called.append(('start',date));batch.mkdir();daily.save(batch/'batch.json',{'batchId':batch.name,'date':date})
                daily.save(batch/'cycle-receipt.json',{'status':'finished'});return {'status':'finished'}
            Clock.current=dt.datetime(2026,9,8,2,0,tzinfo=dt.timezone(dt.timedelta(hours=9)))
            with patch.object(daily,'ROOT',batches),patch.object(daily,'STATE',state),patch.object(daily.dt,'datetime',Clock),patch.object(daily,'query_notion_executions',return_value=[]) as query,patch.object(daily,'recover_batch',side_effect=recover),patch.object(daily,'cycle',side_effect=cycle):
                self.assertEqual(daily.main(['--tick']),0)
                self.assertEqual(daily.main(['--tick']),0)
                self.assertEqual(query.call_count,1)
            self.assertEqual(called,[('recover','2026-09-07'),('start','2026-09-08')])
            self.assertTrue(daily.read(state/'last-trigger.json')['noSubmission'])

    def test_explicit_canary_does_not_count_as_a_duplicate_daily_batch(self):
        with tempfile.TemporaryDirectory() as t:
            root=Path(t);state=root/'state';batches=root/'batches';batches.mkdir()
            for name,kind in [('daily','daily'),('extra','canary')]:
                batch=batches/name;batch.mkdir();daily.save(batch/'batch.json',{'batchId':name,'date':'2026-09-08','kind':kind});daily.save(batch/'cycle-receipt.json',{'status':'finished'})
            Clock.current=dt.datetime(2026,9,8,2,0,tzinfo=dt.timezone(dt.timedelta(hours=9)))
            with patch.object(daily,'ROOT',batches),patch.object(daily,'STATE',state),patch.object(daily.dt,'datetime',Clock),patch.object(daily,'query_notion_executions',side_effect=AssertionError('Finished day needs no network')),patch.object(daily,'cycle',side_effect=AssertionError('No model')):
                self.assertEqual(daily.main(['--tick']),0)

    def test_explicit_canary_can_start_missing_routes_with_existing_prepared_directory(self):
        with tempfile.TemporaryDirectory() as t:
            root=Path(t);state=root/'state';batches=root/'batches';batches.mkdir();(batches/'extra').mkdir()
            with patch.object(daily,'ROOT',batches),patch.object(daily,'STATE',state),patch.object(daily,'query_notion_executions',return_value=[]) as query,patch.object(daily,'cycle',return_value={'status':'finished'}) as cycle:
                self.assertEqual(daily.main(['--canary','extra']),0)
            self.assertEqual(query.call_args.kwargs,{'batch_id':'extra'})
            self.assertTrue(cycle.call_args.kwargs['allow_writer_start']);self.assertEqual(cycle.call_args.kwargs['kind'],'canary')

    def test_preflight_retries_are_bounded_reset_by_date_and_never_submit(self):
        with tempfile.TemporaryDirectory() as t:
            state=Path(t)
            with patch.object(daily,'STATE',state),patch.object(daily.dt,'datetime',Clock),patch.object(daily,'query_notion_executions',side_effect=TimeoutError()) as query:
                for minute in [0,0,5,10,15,20]:
                    Clock.current=dt.datetime(2026,9,8,2,minute,tzinfo=dt.timezone(dt.timedelta(hours=9)))
                    ids,reason=daily.preflight('2026-09-08',[]);self.assertIsNone(ids)
                self.assertEqual(query.call_count,3)
                self.assertEqual(daily.read(state/'preflight-2026-09-08.json')['attempts'],3)
                Clock.current=dt.datetime(2026,9,9,2,0,tzinfo=dt.timezone(dt.timedelta(hours=9)))
                daily.preflight('2026-09-09',[]);self.assertEqual(query.call_count,4)

    def test_live_jobs_do_not_spend_recovery_retry_budget(self):
        with tempfile.TemporaryDirectory() as t:
            state=Path(t);batch=state/'batch'
            with patch.object(daily,'STATE',state),patch.object(daily,'live_jobs',return_value=['grok-web']),patch.object(daily,'cycle',side_effect=AssertionError('Job still alive')):
                for _ in range(6):self.assertEqual(daily.recover_batch(batch,'2026-09-08')['status'],'waiting_for_existing_jobs')
            self.assertFalse((state/'reconcile-batch.json').exists())

    def test_daily_notion_query_excludes_canary_kind(self):
        with patch.object(daily,'request',return_value={'results':[]}) as request,patch.object(daily,'notion_headers',return_value={}):
            self.assertEqual(daily.query_notion_executions(date='2026-09-08'),[])
        condition=request.call_args.args[1]['filter']['and']
        self.assertIn({'property':'구분','select':{'equals':'기획 생성'}},condition)

    def test_transport_retries_get_but_never_repeats_post_or_patch(self):
        for method in ['GET','POST','PATCH']:
            calls=[]
            def transport(req,timeout=None):
                calls.append(req.get_method())
                if len(calls)==1:raise urllib.error.HTTPError(req.full_url,502,'lost reply',{},None)
                return io.BytesIO(b'{}')
            with self.subTest(method=method),patch.object(daily.urllib.request,'urlopen',side_effect=transport),patch.object(daily.time,'sleep'):
                if method=='GET':self.assertEqual(daily.request('https://example.invalid/resource',method=method),{})
                else:
                    with self.assertRaisesRegex(RuntimeError,'HTTP 502'):daily.request('https://example.invalid/resource',{},method=method)
            self.assertEqual(len(calls),2 if method=='GET' else 1)

    def test_notion_creation_lost_reply_is_resolved_by_identity_without_second_create(self):
        with tempfile.TemporaryDirectory() as t:
            batch=Path(t)/'test';batch.mkdir();daily.save(batch/'batch.json',{'batchId':'test','date':'2026-09-08','kind':'canary'})
            pages=[];creates=[]
            def api(url,body=None,headers=None,method=None):
                if url.endswith('/query'):return {'results':list(pages)}
                if url.endswith('/v1/pages'):
                    creates.append(body);pages.append({'id':'one','url':'https://example.invalid/one','properties':body['properties']})
                    raise TimeoutError('The server applied the synthetic write but reply was lost')
                if method=='PATCH':pages[0]['properties']=body['properties']
                return pages[0]
            with patch.object(daily,'request',side_effect=api),patch.object(daily,'notion_headers',return_value={}):
                self.assertEqual(daily.record(batch,'실행 중',{},'started','read'),'one')
                self.assertEqual(daily.record(batch,'완료',{},'done','read'),'one')
            self.assertEqual(len(creates),1)
            self.assertEqual(daily.read(batch/'notion-create-effect.json')['state'],'confirmed')

    def test_uncertain_notion_creation_does_not_create_again_on_reconcile(self):
        with tempfile.TemporaryDirectory() as t:
            batch=Path(t)/'test';batch.mkdir();daily.save(batch/'batch.json',{'batchId':'test','date':'2026-09-08'})
            creates=[]
            def api(url,body=None,headers=None,method=None):
                if url.endswith('/query'):return {'results':[]}
                creates.append(body);raise TimeoutError('Unknown server result')
            with patch.object(daily,'request',side_effect=api),patch.object(daily,'notion_headers',return_value={}):
                for _ in range(2):
                    with self.assertRaises(daily.NotionEffectUnknown):daily.record(batch,'실행 중',{},'started','read')
            self.assertEqual(len(creates),1)

    def test_notion_detail_lost_reply_is_read_back_using_completion_marker(self):
        for applied in [True,False]:
            with self.subTest(applied=applied),tempfile.TemporaryDirectory() as t:
                batch=Path(t)/'test';batch.mkdir();blocks=[];appends=[]
                children=[{'object':'block','type':'paragraph','paragraph':{'rich_text':daily.rich('검증된 실행 요약')}}]
                def api(url,body=None,headers=None,method=None):
                    if method=='PATCH':
                        appends.append(body)
                        if applied:blocks.extend(body['children'])
                        raise TimeoutError('Unknown append reply')
                    return {'results':blocks,'has_more':False}
                with patch.object(daily,'request',side_effect=api),patch.object(daily,'notion_headers',return_value={}):
                    for _ in range(2):
                        if applied:daily.append_notion_detail(batch,'page',children)
                        else:
                            with self.assertRaises(daily.NotionEffectUnknown):daily.append_notion_detail(batch,'page',children)
                self.assertEqual(len(appends),1)
                self.assertEqual((batch/'notion-detail-receipt.json').exists(),applied)

    def test_explicit_manual_resume_renews_one_epoch_without_resetting_auto_budget(self):
        with tempfile.TemporaryDirectory() as t:
            state=Path(t);batch=state/'batch'
            automatic=state/'reconcile-batch.json';daily.save(automatic,{'state':'exhausted','attempts':3,'retryable':True})
            before=automatic.read_bytes()
            with patch.object(daily,'STATE',state),patch.object(daily,'live_jobs',return_value=[]),patch.object(daily,'cycle',side_effect=TimeoutError()) as cycle:
                result=daily.recover_batch(batch,'2026-09-08',manual=True)
                self.assertEqual(result['status'],'exhausted')
                self.assertFalse(cycle.call_args.kwargs['allow_writer_start'])
                held=daily.recover_batch(batch,'2026-09-08')
                self.assertEqual(held['status'],'held');self.assertEqual(cycle.call_count,1)
            self.assertEqual(automatic.read_bytes(),before)
            epochs=list(state.glob('manual-reconcile-batch-*.json'));self.assertEqual(len(epochs),1)
            receipt=daily.read(epochs[0]);self.assertEqual(receipt['maxAttempts'],1)
            self.assertEqual(receipt['automaticRetryReceiptSha256'],daily.sha(before.decode()))
            self.assertTrue(receipt['noAutomaticBudgetRenewal'])

    def test_manual_resume_with_no_prior_budget_does_not_open_automatic_retries(self):
        with tempfile.TemporaryDirectory() as t:
            state=Path(t);batch=state/'batch'
            with patch.object(daily,'STATE',state),patch.object(daily,'live_jobs',return_value=[]),patch.object(daily,'cycle',side_effect=TimeoutError()) as cycle:
                daily.recover_batch(batch,'2026-09-08',manual=True)
                self.assertEqual(daily.recover_batch(batch,'2026-09-08')['status'],'held')
                self.assertEqual(cycle.call_count,1)

    def test_resume_cli_explicitly_selects_manual_epoch(self):
        with tempfile.TemporaryDirectory() as t:
            root=Path(t);batch=root/'batch';batch.mkdir();daily.save(batch/'batch.json',{'batchId':'batch','date':'2026-09-08'})
            with patch.object(daily,'ROOT',root),patch.object(daily,'STATE',root/'state'),patch.object(daily,'recover_batch',return_value={'status':'finished'}) as recover:
                self.assertEqual(daily.main(['--resume',str(batch)]),0)
            self.assertEqual(recover.call_args.kwargs,{'manual':True})

if __name__=='__main__':unittest.main()
