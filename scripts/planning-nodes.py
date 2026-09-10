#!/usr/bin/env python3
"""Local n8n adapter for inspecting one immutable planning execution.

Replay only: no provider invocation, publication, scheduler, or child writes.
Every executable node consumes or produces real data; it does not simulate
separate character/information-gap/reward reasoning steps inside the model.
"""
import argparse
import hashlib
import hmac
import importlib.util
import json
import os
from pathlib import Path
import re
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import uuid

HQ = Path(__file__).resolve().parents[1]
RUNTIME = HQ / '.firefly/n8n-pilot'
FEEDBACK_MARKER = '\n\n# 사람 검토 참고 의견\n'
SOURCE_MARKER = '\n\n# 참고 자료\n'
STAGES = ('select', 'sources', 'instructions', 'feedback', 'assemble', 'response', 'validate', 'receipt')
spec = importlib.util.spec_from_file_location('planning_input', HQ / 'scripts/planning-input.py')
planning_input = importlib.util.module_from_spec(spec)
spec.loader.exec_module(planning_input)


def digest(value):
    return hashlib.sha256(value if isinstance(value, bytes) else value.encode()).hexdigest()


def read_json(path):
    return json.loads(path.read_text())


def private_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w') as f:
        json.dump(value, f, ensure_ascii=False, indent=2)


def require(condition, message):
    if not condition:
        raise ValueError(message)


class Replay:
    def __init__(self, root, runtime):
        self.root = Path(root).resolve()
        self.runtime = Path(runtime)
        self.lock = threading.RLock()

    def load(self, batch_id, route):
        require(isinstance(batch_id, str) and re.fullmatch(r'[A-Za-z0-9_-]{1,120}', batch_id), 'Invalid batch ID')
        require(route == 'astra', 'This pilot supports the recorded Astra route only')
        batch = (self.root / batch_id).resolve()
        require(batch.parent == self.root, 'Batch escapes the registered output root')
        job = (batch / route).resolve()
        require(job.parent == batch, 'Route escapes the batch')
        paths = {
            'batchInput': batch / 'input.md', 'routeInput': job / 'input.md',
            'inputReceipt': batch / 'input-receipt.json',
            'canary': job / 'canary.json', 'response': job / 'assistant-response.json',
        }
        for p in paths.values():
            require(p.is_file() and p.resolve().is_relative_to(batch), 'Missing or redirected snapshot file')
        blobs = {k: p.read_bytes() for k, p in paths.items()}
        prompt = blobs['batchInput'].decode()
        receipt = json.loads(blobs['inputReceipt'])
        canary = json.loads(blobs['canary'])
        response = json.loads(blobs['response'])
        require(canary['state'] == 'complete', 'Recorded plan is incomplete')
        require(digest(blobs['batchInput']) == receipt['promptSha256'] == canary['inputSha256'], 'Input hash mismatch')
        require(blobs['batchInput'] == blobs['routeInput'], 'Batch and route inputs differ')
        require(digest(canary['markdown']) == canary['outputSha256'], 'Recorded output hash mismatch')
        require(digest(response['text']) == response['sha256'], 'Raw assistant response hash mismatch')
        # The production extractor trims response boundaries; no creative repair.
        require(response['text'].strip() == canary['markdown'], 'Assistant response differs from saved plan')
        require(FEEDBACK_MARKER in prompt and SOURCE_MARKER in prompt, 'Snapshot boundaries are missing')
        instructions, tail = prompt.split(FEEDBACK_MARKER, 1)
        feedback, sources = tail.split(SOURCE_MARKER, 1)
        parts = {'instructions': instructions, 'feedback': FEEDBACK_MARKER + feedback,
                 'sources': SOURCE_MARKER + sources}
        require(''.join(parts[k] for k in ('instructions', 'feedback', 'sources')) == prompt, 'Snapshot split is not exact')
        return {
            'batchId': batch_id, 'route': route, 'parts': parts, 'prompt': prompt,
            'inputReceipt': receipt, 'canary': canary,
            'protectedFiles': [{'path': str(paths[k]), 'sha256': digest(blob)} for k, blob in blobs.items()],
        }

    def catalog(self):
        result = []
        for file in sorted(self.root.glob('*/astra/canary.json')):
            try:
                c = read_json(file)
                if c.get('state') == 'complete' and file.with_name('assistant-response.json').is_file():
                    result.append({'batchId': file.parent.parent.name, 'route': 'astra',
                                   'title': c['title'], 'generatedAt': c['generatedAt']})
            except (OSError, ValueError, KeyError):
                continue
        return result

    def stage(self, stage, body):
        require(stage in STAGES and isinstance(body, dict), 'Unknown stage or invalid request')
        with self.lock:
            if stage == 'select':
                context = self.load(body.get('batchId'), body.get('route'))
                run_id = uuid.uuid4().hex
                private_json(self.runtime / 'replays' / run_id / 'context.json', context)
            else:
                run_id = body.get('runId')
                require(isinstance(run_id, str) and re.fullmatch(r'[0-9a-f]{32}', run_id), 'Invalid replay ID')
                context_path = self.runtime / 'replays' / run_id / 'context.json'
                require(context_path.is_file(), 'Unknown replay ID')
                context = read_json(context_path)
                # Replays never silently bind to changed historical files.
                for f in context['protectedFiles']:
                    require(digest(Path(f['path']).read_bytes()) == f['sha256'], 'Historical snapshot changed')
                n = STAGES.index(stage)
                require((context_path.parent / f'{n:02d}-{STAGES[n-1]}.json').exists(), 'Previous node has not completed')
            output = {'runId': run_id, 'batchId': context['batchId'], 'route': context['route'],
                      'mode': 'recorded-replay', 'newModelCalls': 0, 'stage': stage}
            c = context['canary']
            if stage == 'select':
                output.update(title=c['title'], originalGeneratedAt=c['generatedAt'],
                              originalInputSha256=c['inputSha256'], sources=context['inputReceipt']['sources'],
                              note='과거 실행 선택. 오늘의 참고작 재선정이나 새 생성이 아닙니다.')
            elif stage in ('sources', 'instructions', 'feedback'):
                text = context['parts'][stage]
                output.update(text=text, sha256=digest(text), characters=len(text))
                if stage == 'sources':
                    output.update(sources=context['inputReceipt']['sources'],
                                  note='실제 생성 입력에 보존된 발췌·분석. 현재 원문을 새로 읽은 결과가 아닙니다.')
                elif stage == 'instructions':
                    output['note'] = '실제 전달된 양식·지시. 포함 사실이며 모델 준수나 재미의 증명은 아닙니다.'
                else:
                    output['note'] = '당시 전달된 의견과 범위 안내. 새로운 사람 검토나 승인이 아닙니다.'
            elif stage == 'assemble':
                for part in ('instructions', 'feedback', 'sources'):
                    require(body.get(part) == context['parts'][part],
                            'Changed input cannot reuse a recorded answer; create a separate generation experiment')
                prompt = body['instructions'] + body['feedback'] + body['sources']
                require(digest(prompt) == c['inputSha256'], 'Assembled prompt does not match original input')
                output.update(prompt=prompt, promptSha256=digest(prompt), characters=len(prompt),
                              matchesOriginal=True)
            elif stage == 'response':
                require(body.get('promptSha256') == c['inputSha256'], 'Response requested for a different input')
                output.update(markdown=c['markdown'], outputSha256=c['outputSha256'], author=c['author'],
                              historicalUsage=c.get('receipt', {}).get('usage'),
                              note='기존 Astra 응답을 읽었습니다. 표시된 사용량은 과거 생성분이며 이번 호출 비용이 아닙니다.')
            elif stage == 'validate':
                require(body.get('markdown') == c['markdown'], 'Validation input differs from original answer')
                text, issues = planning_input.format_body(body['markdown'], template=context['parts']['instructions'])
                require(text == c['markdown'], 'Validator unexpectedly changed the plan')
                output.update(formatPassed=not issues, issues=issues, outputSha256=digest(text),
                              qualityVerdict='not-assessed',
                              validatorSha256=digest((HQ/'scripts/planning-input.py').read_bytes()),
                              note='현재 기존 형식 검사기를 재실행. 형식 통과는 재미·사람 승인·게시 성공이 아닙니다.')
            elif stage == 'receipt':
                check = read_json(self.runtime/'replays'/run_id/'07-validate.json')
                output.update(verification='passed', formatPassed=check['formatPassed'],
                              qualityVerdict='not-assessed', originalCanaryId=c['id'],
                              inputSha256=c['inputSha256'], outputSha256=c['outputSha256'],
                              protectedFilesUnchanged=True, newPublications=0, schedulerChanges=0,
                              receiptPath=str(self.runtime/'replays'/run_id/'08-receipt.json'),
                              note='실행 재현 검증 완료. 신규 창작·업로드·예약 실행은 없습니다.')
            destination = self.runtime/'replays'/run_id/f'{STAGES.index(stage)+1:02d}-{stage}.json'
            if destination.exists():
                require(read_json(destination) == output, 'Node result is immutable')
            else:
                private_json(destination, output)
            return output


def handler(replay, token):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_):
            pass

        def send(self, code, value):
            data = json.dumps(value, ensure_ascii=False).encode()
            self.send_response(code)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Content-Length', str(len(data)))
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            self.wfile.write(data)

        def authenticated(self):
            return hmac.compare_digest(self.headers.get('Authorization', ''), 'Bearer ' + token)

        def do_GET(self):
            if self.path == '/health':
                return self.send(200, {'service': 'firefly-planning-nodes', 'mode': 'recorded-replay'})
            if not self.authenticated():
                return self.send(401, {'error': 'Authentication required'})
            if self.path == '/v1/catalog':
                return self.send(200, {'records': replay.catalog()})
            self.send(404, {'error': 'Not found'})

        def do_POST(self):
            if not self.authenticated():
                return self.send(401, {'error': 'Authentication required'})
            try:
                require(self.path.startswith('/v1/stages/'), 'Unknown endpoint')
                length = int(self.headers.get('Content-Length', '0'))
                require(0 < length <= 2_000_000, 'Invalid request size')
                body = json.loads(self.rfile.read(length))
                self.send(200, replay.stage(self.path.removeprefix('/v1/stages/'), body))
            except (ValueError, KeyError, OSError) as exc:
                self.send(409, {'error': str(exc), 'newModelCalls': 0})
    return Handler


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=5679)
    args = parser.parse_args()
    config = read_json(HQ/'config/daily-planning.json')
    token = (RUNTIME/'bridge-token').read_text().strip()
    server = ThreadingHTTPServer(('127.0.0.1', args.port), handler(Replay(HQ/config['outputRoot'], RUNTIME), token))
    print(f'Planning replay adapter: http://127.0.0.1:{args.port}', flush=True)
    server.serve_forever()
