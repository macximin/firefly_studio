#!/usr/bin/env python3
"""Manage an isolated, manually started n8n planning replay pilot."""
import argparse
import http.cookiejar
import json
import os
from pathlib import Path
import secrets
import shutil
import signal
import subprocess
import sys
import time
import urllib.error
import urllib.request

HQ = Path(__file__).resolve().parents[1]
RUNTIME = HQ/'.firefly/n8n-pilot'
WORKFLOW_ID = 'ffPlanningReplay1'
CREDENTIAL_ID = 'ffPlanningReplayHeader'
URL = 'http://127.0.0.1:5678'
BRIDGE = 'http://127.0.0.1:5679'


def write_private(path, value):
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w') as f:
        f.write(value if isinstance(value, str) else json.dumps(value, ensure_ascii=False, indent=2))


def environment():
    return {**os.environ, 'N8N_USER_FOLDER': str(RUNTIME/'user'),
            'N8N_LISTEN_ADDRESS': '127.0.0.1', 'N8N_HOST': '127.0.0.1',
            'N8N_PORT': '5678', 'N8N_PROTOCOL': 'http', 'N8N_EDITOR_BASE_URL': URL,
            'N8N_SECURE_COOKIE': 'false', 'N8N_DIAGNOSTICS_ENABLED': 'false',
            'N8N_VERSION_NOTIFICATIONS_ENABLED': 'false', 'N8N_TEMPLATES_ENABLED': 'false',
            'N8N_PERSONALIZATION_ENABLED': 'false', 'N8N_PUBLIC_API_DISABLED': 'true',
            'N8N_RUNNERS_BROKER_PORT': '5680',
            'N8N_COMMUNITY_PACKAGES_ENABLED': 'false', 'N8N_ENFORCE_SETTINGS_FILE_PERMISSIONS': 'true',
            'N8N_BLOCK_ENV_ACCESS_IN_NODE': 'true', 'N8N_LOG_LEVEL': 'warn'}


def workflow():
    nodes = [{'parameters': {}, 'id': 'start', 'name': '직접 실행',
              'type': 'n8n-nodes-base.manualTrigger', 'typeVersion': 1, 'position': [0, 0]}]
    definitions = [
        ('select', '기록 선택', [240, 0], json.dumps({'batchId': 'hardening-canary-20260908-v1', 'route': 'astra'}),
         '완료된 Astra 실행을 선택합니다. 신규 생성 없음.'),
        ('sources', '원문 · 분석 발췌', [480, 0], '={{ JSON.stringify({runId: $json.runId}) }}',
         '당시 실제 입력에 포함된 원문과 분석을 읽습니다.'),
        ('instructions', '기획 양식 · 당시 지침', [720, 0], '={{ JSON.stringify({runId: $json.runId}) }}',
         '지침 포함 여부를 확인합니다. 모델 준수 여부와 구분합니다.'),
        ('feedback', '당시 사용자 의견', [960, 0], '={{ JSON.stringify({runId: $json.runId}) }}',
         '과거 의견과 적용 범위. 신규 HIL을 요청하지 않습니다.'),
        ('assemble', '입력 조립 · 해시 대조', [960, 280],
         "={{ JSON.stringify({runId: $json.runId, instructions: $('기획 양식 · 당시 지침').first().json.text, feedback: $('당시 사용자 의견').first().json.text, sources: $('원문 · 분석 발췌').first().json.text}) }}",
         '앞 노드의 실제 출력으로 입력을 조립합니다. 변조 시 중단.'),
        ('response', '기존 Astra 응답 읽기', [720, 280],
         '={{ JSON.stringify({runId: $json.runId, promptSha256: $json.promptSha256}) }}',
         '원응답과 저장 기획서 대조. 이번 모델 호출은 0회.'),
        ('validate', '기존 형식 검사 실행', [480, 280],
         '={{ JSON.stringify({runId: $json.runId, markdown: $json.markdown}) }}',
         '9절·육하원칙·빈칸 검사. 재미 점수나 채택 판정 없음.'),
        ('receipt', '원본 보존 · 검증 기록', [240, 280],
         '={{ JSON.stringify({runId: $json.runId}) }}',
         '입출력 일치와 원본 보존을 확인합니다. 게시·예약 없음.'),
    ]
    for key, name, position, body, note in definitions:
        nodes.append({'id': key, 'name': name, 'type': 'n8n-nodes-base.httpRequest',
                      'typeVersion': 4.4, 'position': position, 'notes': note, 'notesInFlow': True,
                      'parameters': {'method': 'POST', 'url': f'{BRIDGE}/v1/stages/{key}',
                                     'authentication': 'genericCredentialType', 'genericAuthType': 'httpHeaderAuth',
                                     'sendBody': True, 'specifyBody': 'json', 'jsonBody': body,
                                     'options': {'timeout': 30000}},
                      'credentials': {'httpHeaderAuth': {'id': CREDENTIAL_ID, 'name': 'Firefly local replay adapter'}}})
    connections = {a['name']: {'main': [[{'node': b['name'], 'type': 'main', 'index': 0}]]}
                   for a, b in zip(nodes, nodes[1:])}
    nodes.append({'id': 'readme', 'name': '파일럿 안내', 'type': 'n8n-nodes-base.stickyNote',
                  'typeVersion': 1, 'position': [40, -290],
                  'parameters': {'width': 1140, 'height': 180,
                                 'content': '## Firefly 기획 흐름 · 실제 기록 재현\n**직접 실행 → 노드 더블클릭 → Output의 JSON/Table에서 실제 내용을 확인하세요.**\n\n기존 Astra 기획 「이번 생은 내가 사장」의 입력과 응답입니다. **새 모델 호출 0회 / 신규 게시 0건.**\n초록색은 데이터 처리 성공이며 재미·채택 판정이 아닙니다. 입력을 바꾸면 과거 응답 재사용은 중단됩니다.'}})
    return {'id': WORKFLOW_ID, 'name': 'Firefly · 기획 흐름 살펴보기 (기존 기록)',
            'active': False, 'nodes': nodes, 'connections': connections,
            'settings': {'executionOrder': 'v1', 'saveDataSuccessExecution': 'all',
                         'saveDataErrorExecution': 'all', 'saveManualExecutions': True,
                         'executionTimeout': 120}, 'pinData': {}}


def fetch(path, body=None, opener=None):
    request = urllib.request.Request(URL+path,
        data=None if body is None else json.dumps(body).encode(),
        headers={'Content-Type': 'application/json'})
    with (opener or urllib.request.build_opener()).open(request, timeout=10) as response:
        return json.load(response)


def health(url):
    try:
        with urllib.request.urlopen(url, timeout=2) as response:
            return response.status == 200
    except (OSError, urllib.error.URLError):
        return False


def cli(*args):
    executable = shutil.which('n8n')
    if not executable:
        raise RuntimeError('n8n is not installed; install a supported local n8n runtime first')
    RUNTIME.mkdir(parents=True, exist_ok=True, mode=0o700)
    with (RUNTIME/'setup.log').open('a') as log:
        subprocess.run([executable, *args], cwd=HQ, env=environment(), stdout=log,
                       stderr=subprocess.STDOUT, check=True)


def initialize():
    RUNTIME.mkdir(parents=True, exist_ok=True, mode=0o700)
    token_file = RUNTIME/'bridge-token'
    if not token_file.exists():
        write_private(token_file, secrets.token_urlsafe(40))
    login = RUNTIME/'owner-login.json'
    if not login.exists():
        write_private(login, {'email': 'owner@firefly.local', 'firstName': 'Firefly',
                              'lastName': 'Local', 'password': 'Ff9!'+secrets.token_urlsafe(28)})
    imported = RUNTIME/'imported.json'
    if not imported.exists():
        credentials = RUNTIME/'import-credentials.json'
        if not credentials.exists():
            write_private(credentials, [{'id': CREDENTIAL_ID, 'name': 'Firefly local replay adapter',
                                         'type': 'httpHeaderAuth', 'data': {'name': 'Authorization',
                                         'value': 'Bearer '+token_file.read_text().strip()}}])
        export = RUNTIME/'workflow.json'
        if not export.exists():
            write_private(export, workflow())
        cli('import:credentials', '--input='+str(credentials))
        cli('import:workflow', '--input='+str(export))
        write_private(imported, {'workflowId': WORKFLOW_ID, 'active': False})


def start():
    initialize()
    services = [('bridge', BRIDGE+'/health', [sys.executable, str(HQ/'scripts/planning-nodes.py')]),
                ('n8n', URL+'/healthz', [shutil.which('n8n'), 'start'])]
    for name, url, command in services:
        pidfile = RUNTIME/(name+'.pid')
        if health(url):
            if not pidfile.exists():
                raise RuntimeError(f'{name} port is occupied by another service')
            continue
        with (RUNTIME/(name+'.log')).open('a') as log:
            proc = subprocess.Popen(command, cwd=HQ, env=environment(), stdin=subprocess.DEVNULL,
                                    stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
        pidfile.write_text(str(proc.pid))
        for _ in range(100):
            if health(url):
                break
            if proc.poll() is not None:
                raise RuntimeError(f'{name} exited; inspect its local log')
            time.sleep(.3)
        else:
            raise RuntimeError(f'{name} did not become ready')
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    login = json.loads((RUNTIME/'owner-login.json').read_text())
    # /healthz becomes available before the editor REST routes are registered.
    for attempt in range(50):
        try:
            settings = fetch('/rest/settings')['data']
            break
        except urllib.error.HTTPError as exc:
            code = exc.code
            exc.close()
            if code not in (404, 503) or attempt == 49:
                raise
            time.sleep(.3)
    if settings.get('userManagement', {}).get('showSetupOnFirstLoad'):
        fetch('/rest/owner/setup', login, opener)
    else:
        fetch('/rest/login', {'emailOrLdapLoginId': login['email'], 'password': login['password']}, opener)
    print(json.dumps({'url': URL+'/workflow/'+WORKFLOW_ID, 'mode': 'recorded-replay',
                      'credentialsFile': str(RUNTIME/'owner-login.json'), 'newModelCalls': 0}))


def stop():
    for name in ('n8n', 'bridge'):
        path = RUNTIME/(name+'.pid')
        if not path.exists():
            continue
        pid = int(path.read_text())
        observed = subprocess.run(['ps', '-p', str(pid), '-o', 'command='], text=True, capture_output=True).stdout
        marker = 'planning-nodes.py' if name == 'bridge' else '/n8n'
        if marker in observed:
            os.kill(pid, signal.SIGTERM)
        path.unlink()
    print('Local pilot stopped. Files and execution history retained.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['start', 'stop', 'status', 'export'])
    args = parser.parse_args()
    if args.action == 'start':
        start()
    elif args.action == 'stop':
        stop()
    elif args.action == 'export':
        print(json.dumps(workflow(), ensure_ascii=False, indent=2))
    else:
        print(json.dumps({'n8n': health(URL+'/healthz'), 'bridge': health(BRIDGE+'/health'),
                          'url': URL+'/workflow/'+WORKFLOW_ID, 'mode': 'recorded-replay'}))
