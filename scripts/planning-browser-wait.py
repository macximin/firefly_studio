#!/usr/bin/env python3
"""Compact generation polling; queue contention is pending, not generation failure."""
import argparse
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time

spec = importlib.util.spec_from_file_location('planning_process', Path(__file__).with_name('planning-process.py'))
runtime = importlib.util.module_from_spec(spec);spec.loader.exec_module(runtime)

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--task',type=int,required=True);parser.add_argument('--stop-selector',required=True)
    parser.add_argument('--response-selector',required=True);parser.add_argument('--seconds',type=int,default=900)
    args=parser.parse_args()
    if not 1 <= args.seconds <= 1800:parser.error('--seconds must be between 1 and 1800')
    directory=Path(os.environ['FIREFLY_BROWSER_JOB'])
    previous=None;stable=0;busy_polls=0;deadline=time.monotonic()+args.seconds
    with runtime.interruptible():
        while time.monotonic()<deadline:
            expr='(() => ({busy:[...document.querySelectorAll('+json.dumps(args.stop_selector)+')].some(e=>e.getClientRects().length && getComputedStyle(e).visibility!=="hidden"),text:[...document.querySelectorAll('+json.dumps(args.response_selector)+')].at(-1)?.innerText || ""}))()'
            script='await useOrCreateTaskSpace('+str(args.task)+'); const s=await js('+json.dumps(expr)+'); cliLog("FIREFLY_STATE "+JSON.stringify(s));'
            call_deadline=min(deadline,time.monotonic()+90)
            env={**os.environ,'FIREFLY_BROWSER_DEADLINE_MONOTONIC':str(call_deadline)}
            guard=Path(__file__).with_name('planning-browser-guard.py')
            process=runtime.spawn_owned([sys.executable,str(guard),'nodejs'],directory,'browser-poll',
                                         stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,
                                         text=True,env=env)
            try:
                # Guard shares this deadline. Cleanup gets a separate, bounded grace period.
                stdout,stderr=process.communicate(script,timeout=max(.01,call_deadline-time.monotonic())+6)
            except subprocess.TimeoutExpired:
                runtime.save(directory/'browser-runtime-error.json', {
                    'at':runtime.now(),'kind':'GuardTimeout','reason':'Browser guard exceeded its cleanup deadline.'})
                print('Browser guard timeout',file=sys.stderr);return 124
            finally:runtime.finish_owned(process,directory)
            if process.returncode==75:
                busy_polls+=1
            elif process.returncode:
                print(stderr or stdout,file=sys.stderr);return process.returncode
            else:
                # Ego cliLog currently writes to stderr. Keep ordinary CLI logs
                # out of the model context and parse only our tagged observation.
                match=re.search(r'^FIREFLY_STATE (\{[^\n]+\})\s*$',stdout+'\n'+stderr,re.M)
                if not match:print('Observation unavailable',file=sys.stderr);return 1
                state=json.loads(match[1])
                stable=stable+1 if not state['busy'] and state['text'] and state['text']==previous else 0
                previous=state['text']
                if stable>=1:print(json.dumps({'status':'stable','characters':len(previous),'queueBusyPolls':busy_polls}));return 0
            time.sleep(min(40,max(0,deadline-time.monotonic())))
    print(json.dumps({'status':'pending','characters':len(previous or ''),'queueBusyPolls':busy_polls}));return 0

if __name__=='__main__':sys.exit(main())
