#!/usr/bin/env python3
"""Dedicated Hermes document adapter with durable pre-call provenance."""
import argparse
import contextlib
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys

spec=importlib.util.spec_from_file_location('planning_process',Path(__file__).with_name('planning-process.py'))
runtime_helpers=importlib.util.module_from_spec(spec);spec.loader.exec_module(runtime_helpers)

def provenance(hermes_root):
    try:
        commit=subprocess.check_output(['git','-C',str(hermes_root),'rev-parse','HEAD'],text=True,stderr=subprocess.DEVNULL,timeout=5).strip()
    except (OSError,subprocess.SubprocessError):commit=None
    dependencies={}
    for relative in ['hermes_cli/runtime_provider.py','hermes_cli/oneshot.py','run_agent.py','agent/transports/codex.py']:
        path=hermes_root/relative
        dependencies[relative]=hashlib.sha256(path.read_bytes()).hexdigest() if path.exists() else None
    return {'pythonVersion':sys.version.split()[0], 'hermesCommit':commit,
            'hermesDependencySha256':dependencies,
            'adapterSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--input',required=True);parser.add_argument('--directory',required=True)
    args=parser.parse_args();directory=Path(args.directory).resolve();directory.mkdir(parents=True,exist_ok=True)
    hermes_root=Path.home()/'.hermes/hermes-agent'
    observation={'requestedModel':'gpt-6-astra','requestedReasoning':'medium','resolvedReasoning':None,
                 'requests':[],'effectiveReasoning':None,'status':'preparing','createdAt':runtime_helpers.now(),
                 'source':'Hermes ResponsesApiTransport.build_kwargs','reasoningEvidence':'constructed-request',
                 'runtime':provenance(hermes_root)}
    observation_path=directory/'runtime-observation.json'
    runtime_helpers.save(observation_path,observation)
    db=None;agent=None;close_agent=None;transport=None;original=None
    try:
        sys.path.insert(0,str(hermes_root));os.environ['HERMES_INTERACTIVE']='0'
        from hermes_cli.runtime_provider import resolve_runtime_provider
        from hermes_cli.oneshot import _create_session_db_for_oneshot, _close_agent, _write_usage_file
        from run_agent import AIAgent
        from agent.transports.codex import ResponsesApiTransport
        close_agent=_close_agent;transport=ResponsesApiTransport;original=transport.build_kwargs
        def observe(self,*values,**kwargs):
            result=original(self,*values,**kwargs)
            observation['requests'].append({'model':result.get('model'),'reasoning':result.get('reasoning'),
                                            'reasoning_effort':result.get('reasoning_effort'),'preparedAt':runtime_helpers.now()})
            observation['status']='request-prepared'
            # Save before handing the request back to the transport for transmission.
            runtime_helpers.save(observation_path,observation)
            return result
        transport.build_kwargs=observe
        runtime=resolve_runtime_provider(requested='openai-codex',target_model='gpt-6-astra')
        db=_create_session_db_for_oneshot()
        with contextlib.redirect_stdout(sys.stderr):
            agent=AIAgent(api_key=runtime.get('api_key'),base_url=runtime.get('base_url'),provider=runtime.get('provider'),requested_provider=runtime.get('requested_provider'),api_mode=runtime.get('api_mode'),credential_pool=runtime.get('credential_pool'),model='gpt-6-astra',reasoning_config={'enabled':True,'effort':'medium'},enabled_toolsets=[],max_iterations=1,quiet_mode=True,platform=None,skip_context_files=True,skip_memory=True,skip_background_review=True,session_db=db,ephemeral_system_prompt='You produce document artifacts, not terminal chat. Follow the supplied Markdown template exactly, including headings and tables. Return only the requested document. Do not write new content if the request is only a formatting test.')
            observation['resolvedReasoning']=agent.reasoning_config
            observation['status']='ready';runtime_helpers.save(observation_path,observation)
            result=agent.run_conversation(Path(args.input).read_text())
        text=result.get('final_response') or ''
        _write_usage_file(str(directory/'usage.json'),result)
        last=observation['requests'][-1] if observation['requests'] else {}
        if last.get('model')=='gpt-6-astra' and isinstance(last.get('reasoning'),dict) and last['reasoning'].get('effort')=='medium':
            observation['effectiveReasoning']='medium'
        observation.update(status='completed' if text.strip() and not result.get('failed') else 'failed',finishedAt=runtime_helpers.now())
        runtime_helpers.save(observation_path,observation)
        runtime_helpers.save(directory/'assistant-response.json',{'text':text,'sha256':hashlib.sha256(text.encode()).hexdigest(),'sessionId':result.get('session_id')})
        print(text)
        return 0 if text.strip() and not result.get('failed') else 1
    except BaseException as error:
        observation.update(status='failed',errorType=type(error).__name__,finishedAt=runtime_helpers.now())
        runtime_helpers.save(observation_path,observation)
        raise
    finally:
        if transport is not None and original is not None:transport.build_kwargs=original
        if close_agent is not None:close_agent(agent,db)

if __name__=='__main__':sys.exit(main())
