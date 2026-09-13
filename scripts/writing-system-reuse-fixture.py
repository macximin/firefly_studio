#!/usr/bin/env python3
"""Run pinned third-party control paths with deterministic model substitutes.

No source is vendored into the repository. Python definitions are compiled from
verified local research-cache ASTs; application imports/decorators are omitted.
This verifies wiring and failure behavior, never prose quality or a full install.
"""
import argparse
import ast
from copy import deepcopy
import datetime
import hashlib
import json
import logging
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
from types import SimpleNamespace, ModuleType

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / '.firefly/research/ready-made-writing-20260911'
SUPPLEMENT = ROOT / '.firefly/research/writing-system-reuse-20260912'
READS = []


def verified_file(relative):
    receipt = json.loads((CACHE / 'research-receipt.json').read_text())
    entry = next(x for x in receipt['files'] if x['path'] == relative)
    path = CACHE / relative
    data = path.read_bytes()
    assert hashlib.sha256(data).hexdigest() == entry['sha256'], f'Changed cache: {relative}'
    folder, _, local = relative.partition('/')
    repo = next(x for x in receipt['repositories'] if x['full_name'].replace('/', '__') == folder)
    upstream = local.removeprefix('source/')
    tree = json.loads((CACHE / folder / 'tree.json').read_text())
    blob = next(x for x in tree['tree'] if x['path'] == upstream)['sha']
    assert hashlib.sha1(f'blob {len(data)}\0'.encode() + data).hexdigest() == blob
    READS.append({'path': relative, 'sha256': entry['sha256'], 'commit': repo['headSha'], 'gitBlobSha1': blob})
    return path, ast.parse(data.decode('utf-8'))


def compile_definitions(path, tree, names, env, class_name=None):
    """Keep original bodies; omit registration decorators and app-level imports."""
    candidates = tree.body if class_name is None else next(x for x in tree.body if isinstance(x, ast.ClassDef) and x.name == class_name).body
    body = [deepcopy(x) for x in candidates if isinstance(x, (ast.FunctionDef, ast.ClassDef)) and x.name in names]
    assert {x.name for x in body} == set(names)
    for item in body:
        item.decorator_list = []
        if isinstance(item, ast.ClassDef):
            for child in item.body:
                if isinstance(child, ast.FunctionDef):
                    child.decorator_list = []
    module = ast.fix_missing_locations(ast.Module(body=body, type_ignores=[]))
    exec(compile(module, str(path), 'exec'), env)


def novelwriter_fixture():
    prefix = 'tuxiangxianzhe__NovelWriter_public/source/'
    path, tree = verified_file(prefix + 'web_server.py')
    owner = next(x.name for x in tree.body if isinstance(x, ast.ClassDef) and any(isinstance(y, ast.FunctionDef) and y.name == 'analyze_narrative_dna' for y in x.body))
    prompt_path, prompt_tree = verified_file(prefix + 'prompt_definitions.py')
    templates = {}
    for item in prompt_tree.body:
        if isinstance(item, ast.Assign):
            for target in item.targets:
                if isinstance(target, ast.Subscript) and isinstance(target.value, ast.Name) and target.value.id == '_DEFAULT_PROMPTS':
                    key = ast.literal_eval(target.slice)
                    if key in ('narrative_dna_analysis_prompt', 'first_chapter_draft_prompt'):
                        templates[key] = ast.literal_eval(item.value)
    calls = []
    scripted = '[叙事DNA分析报告]\n독립 fixture 분석\n[架构指令]\n목적과 저항\n[蓝图指令]\n정보 공개 순서\n[章节指令]\n결정 전 망설임의 근거를 남긴다.'
    def invoke(adapter, prompt, **kwargs):
        calls.append(prompt)
        return scripted
    common = ModuleType('novel_generator.common')
    common.invoke_with_cleaning = invoke
    sys.modules['novel_generator.common'] = common
    with tempfile.TemporaryDirectory(prefix='firefly-novelwriter-fixture-') as tmp:
        style = Path(tmp) / 'fixture.json'
        style.write_text(json.dumps({'style_name': 'fixture', 'untouched': 'preserved'}))
        env = {'os': os, 'json': json, 'logging': logging, 'gr': SimpleNamespace(Progress=lambda: lambda *a, **k: None),
               'prompt_definitions': SimpleNamespace(**templates), 'create_llm_adapter': lambda **kw: object(),
               'atomic_write_json': lambda data, file, **kw: Path(file).write_text(json.dumps(data, ensure_ascii=False))}
        compile_definitions(path, tree, ['analyze_narrative_dna', 'get_narrative_instructions'], env, owner)
        conf = {key: 'fixture' for key in ['interface_format', 'base_url', 'model_name', 'api_key', 'temperature', 'max_tokens', 'timeout']}
        app = SimpleNamespace(config={'llm_configs': {'fixture': conf}}, get_styles_dir=lambda: tmp)
        sample = '시작' + '가' * 4998 + 'TAIL_SHOULD_BE_EXCLUDED'
        result = env['analyze_narrative_dna'](app, 'fixture', sample, 'fixture')
        assert result[0] == scripted and len(calls) == 1
        assert sample[:5000] in calls[0] and 'TAIL_SHOULD_BE_EXCLUDED' not in calls[0]
        instructions = env['get_narrative_instructions'](app, 'fixture')
        assert instructions == {'for_architecture': '목적과 저항', 'for_blueprint': '정보 공개 순서', 'for_chapter': '결정 전 망설임의 근거를 남긴다.'}
        assert json.loads(style.read_text())['untouched'] == 'preserved'
        chapter_path, chapter_tree = verified_file(prefix + 'novel_generator/chapter.py')
        chapter_info = {k: 'fixture' for k in ['chapter_title', 'chapter_role', 'chapter_purpose', 'suspense_level', 'foreshadowing', 'plot_twist_level', 'chapter_summary']}
        env.update(build_full_architecture=lambda p: '독립 창작 설정', read_file=lambda p: '', get_chapter_info_from_blueprint=lambda t, n: chapter_info)
        compile_definitions(chapter_path, chapter_tree, ['build_chapter_prompt'], env)
        prompt = env['build_chapter_prompt'](api_key='', base_url='', model_name='', filepath=tmp, novel_number=1, word_number=500,
            temperature=0, user_guidance='fixture', characters_involved='지훈', key_items='', scene_location='식당', time_constraint='',
            embedding_api_key='', embedding_url='', embedding_interface_format='', embedding_model_name='',
            narrative_instruction=instructions['for_chapter'], enable_author_reference=False)
        assert instructions['for_chapter'] in prompt and '독립 창작 설정' in prompt
        scripted = '마커 없는 모델 응답'
        env['analyze_narrative_dna'](app, 'fixture', sample, 'fixture')
        markerless = env['get_narrative_instructions'](app, 'fixture')
        assert set(markerless.values()) == {''}
        return {'system': 'NovelWriter', 'checksPassed': 6, 'mockModelCalls': len(calls), 'liveModelCalls': 0,
                'executed': ['analyze_narrative_dna', 'get_narrative_instructions', 'build_chapter_prompt(first chapter)'],
                'observed': {'sampleLimitCharacters': 5000, 'stageInstructionsRoundTrip': True, 'chapterPromptReceivesInstruction': True,
                             'markerlessResponseSilentlyProducesEmptyInstructions': True},
                'notExecuted': ['full application startup', 'real narrative analysis', 'embedding retrieval', 'chapter generation', 'later chapter path']}


def writehere_fixture():
    prefix = 'principia-ai__WriteHERE/source/'
    path, tree = verified_file(prefix + 'recursive/agent/agents/regular.py')
    pp, pt = verified_file(prefix + 'recursive/agent/prompts/story_writing_wo_search_nl_version_english/write_combine_atom_and_update.py')
    class Template:
        def __init__(self, system, content): self.system, self.content = system, content
        def construct_system_message(self, **kwargs): return self.system
        def construct_prompt(self, **kwargs): return self.content.format(**kwargs)
    env = {'PromptTemplate': Template}
    compile_definitions(pp, pt, ['StoryWritingNLWriteAtomWithUpdateEN'], env)
    prompt_name = 'StoryWritingNLWriteAtomWithUpdateEN'
    expected_errors = []
    fixture_logger = SimpleNamespace(info=lambda *a, **kw: None, error=lambda message: expected_errors.append(message))
    env.update(Dict=dict, deepcopy=deepcopy, json=json, Agent=object, prompt_register=SimpleNamespace(module_dict={prompt_name: env[prompt_name]}), logger=fixture_logger)
    compile_definitions(path, tree, ['get_llm_output', 'UpdateAtomPlanningAgent'], env)
    config = {'language': 'en', 'WRITING': {'atom': {'prompt_version': prompt_name, 'atom_result_flag': 'atomic', 'parse_arg_dict': {}}, 'planning': {}}}
    def node():
        return SimpleNamespace(task_type_tag='WRITING', task_info={'task_type': 'WRITING', 'goal': '거액의 계약금을 제안한다.'}, config=deepcopy(config),
            node_graph_info={'outer_node': None, 'parent_nodes': ['previous'], 'layer': 1}, get_all_layer_plan=lambda: '요리사를 영입한다.', get_all_previous_writing_plan=lambda: '')
    memory = SimpleNamespace(article='요리사가 돈보다 딸과 보낼 저녁을 원한다고 말했다.', root_node=SimpleNamespace(task_info={'goal': '식당을 지킨다.'}),
        collect_node_run_info=lambda n: {'upper_graph_precedents': [], 'same_graph_precedents': []})
    calls = []
    agent = env['UpdateAtomPlanningAgent']()
    def reply(**kw):
        calls.append(kw)
        assert memory.article in kw['prompt']
        return {'original': 'scripted fixture response', 'atom_result': 'atomic', 'atom_think': 'fixture-only rationale', 'update_result': '저녁 근무를 없애겠다고 제안한다.\n퇴근 시간을 계약서에 적는다.'}
    agent.call_llm = reply
    current = node()
    result = agent.forward(current, memory)
    assert current.task_info['goal'] == '저녁 근무를 없애겠다고 제안한다.; 퇴근 시간을 계약서에 적는다.' and result['result'] == [] and len(calls) == 1
    retries = []
    def invalid(**kw):
        retries.append(kw)
        return {'original': 'invalid', 'atom_result': 'invalid', 'atom_think': 'fixture', 'update_result': ''}
    agent.call_llm = invalid
    # Invalid classification exhausts 10 attempts, then reaches planning without
    # a successful atomic/complex judgement; stop there instead of another loop.
    broken = node()
    broken.config['WRITING']['planning'] = {'prompt_version': prompt_name, 'parse_arg_dict': {}}
    agent.call_llm = lambda **kw: invalid(**kw) if len(retries) < 10 else (_ for _ in ()).throw(RuntimeError('fixture planning boundary'))
    try: agent.forward(broken, memory)
    except RuntimeError as exc: assert str(exc) == 'fixture planning boundary'
    assert len(retries) == len(expected_errors) == 10
    return {'system': 'WriteHERE', 'checksPassed': 4, 'mockModelCalls': len(calls) + len(retries), 'liveModelCalls': 0,
            'executed': ['StoryWritingNLWriteAtomWithUpdateEN prompt construction', 'get_llm_output', 'UpdateAtomPlanningAgent.forward atomic update and invalid-output branch'],
            'observed': {'writtenTextIncluded': True, 'scriptedGoalAppliedToNode': True, 'invalidAtomicOutputAttemptsBeforePlanning': 10,
                         'updatedGoalAppliedWithoutCanonComparison': True},
            'notExecuted': ['recursive graph scheduling', 'real goal judgement', 'writing', 'search', 'full application startup']}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    # Deny Python socket creation throughout fixture execution. Node counterpart
    # separately denies network and subprocess creation before loading sources.
    socket.socket = lambda *a, **kw: (_ for _ in ()).throw(RuntimeError('fixture network denied'))
    results = [novelwriter_fixture(), writehere_fixture()]
    node_result = subprocess.run(['node', str(ROOT / 'scripts/writing-system-reuse-fixture.mjs')], check=True, capture_output=True, text=True, timeout=30)
    author = json.loads(node_result.stdout)
    results.append(author['result'])
    receipt = {'schemaVersion': 'writing-system-reuse-validation/v1', 'checkedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'scope': 'Pinned selected functions with scripted model boundaries; not full-app installation or prose-quality evaluation',
        'liveModelCalls': 0, 'humanReviewRequested': False, 'canonWrites': False, 'existingResearchCacheModified': False,
        'sources': READS + author['sources'], 'results': results, 'checksPassed': sum(x['checksPassed'] for x in results)}
    rendered = json.dumps(receipt, ensure_ascii=False, indent=2) + '\n'
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        with args.output.open('x') as handle: handle.write(rendered)
    print(rendered)


if __name__ == '__main__': main()
