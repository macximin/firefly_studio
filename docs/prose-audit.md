# 한국어 문체 관찰 연결

`epoko77-ai/im-not-ai`의 한국어 분류 체계와 원시 통계 함수를 고정 버전으로 연결했다. 기본 동작은 문제 후보의 위치를 별도 파일에 적는 것이다. 원작 조합, 주인공의 목적, 상업적 보상, 승인 여부를 대신 판단하지 않는다. 현재 여섯 기획서의 입력·본문·영수증과 일일 실행기는 변경하지 않는다.

원본은 [im-not-ai](https://github.com/epoko77-ai/im-not-ai)다. 현재 고정 commit은 `9747f036cdc28a1a8aea4dc71fef1f7846eb96f7`이며, [MIT 고지](https://github.com/epoko77-ai/im-not-ai/blob/9747f036cdc28a1a8aea4dc71fef1f7846eb96f7/LICENSE)와 선택한 원본 파일 10개를 `.firefly/vendor/im-not-ai/<commit>/`에 보관한다. 각 파일은 읽기 전용이며 실행마다 정책의 manifest·파일 해시를 확인한다. 로컬 수정이나 불완전한 복원은 분석 전에 실패한다. Git에는 정책과 해시를 남기고 원본 snapshot은 로컬 의존성으로 둔다.

통계 코드는 해시를 확인한 동일한 소스 bytes를 메모리에서 컴파일하여 실행한다. 검증 후 파일을 다시 읽거나 기존 `.pyc` 캐시를 실행하지 않는다.

## 연결 위치

`기획서/원고 후보 → 문체 관찰 JSON → 사람이 필요한 수정 범위 선택 → 기존 InkOS Reviser/Polisher → HIL` 순서다. 기본 관찰에는 모델 호출·외부 API·새 구독 비용이 없다. 원고를 나중에 윤문하는 경우에는 선택한 작성 모델의 사용량이 발생한다.

이 연결은 전역 스킬 설치가 아니다. 일반 Codex 스킬 설치만으로 현재 Hermes Astra, Grok CLI, Antigravity `agy`, 웹 ChatGPT/Grok/Gemini에 지시가 전달되지는 않는다. 명시적인 실행 어댑터에서 사용해야 한다. 기존 `inkos-story-deslop`의 장르·정본 보호 계약을 유지한다. 같은 글에 humanizer, avoid-ai-writing, deslop을 연속으로 돌리지 않는다.

## 실행

```sh
python3 scripts/prose-audit.py --verify-vendor
python3 scripts/prose-audit.py --input /absolute/path/plan.md --output /absolute/path/plan.prose-observation.json --scope planning
python3 scripts/prose-audit.py --input /absolute/path/chapter.md --output /absolute/path/chapter.prose-observation.json --scope manuscript
python3 tests/test_prose_audit.py
```

입력은 `.md` 또는 `.txt`다. 출력은 새 파일이어야 하며 기존 파일을 덮어쓰지 않는다. 입력 해시와 관찰 정책·원본 버전을 영수증에 남긴다. `start`/`end`는 원본 문자열의 Unicode 문자 인덱스이며 끝 인덱스는 포함하지 않는다. HTML 주석이나 수정 설명을 기획서 본문에 붙이지 않는다.

## 보호 범위와 한계

- 9절의 제목·표, 코드, 인용, 원문·참고 자료, HIL·영수증은 분석에서 가린다. 8절 참고작 분석 전체도 제외한다. 따라서 기획서에서 표 안에 들어간 서술은 이번 통계의 대상이 아니다. 이 범위를 포함한 전체 문체 평가로 읽으면 안 된다.
- A-3, A-8, D-1의 일부 명시적 표현만 정확한 위치와 원문 표면으로 기록한다. 원본 taxonomy의 S1 등급을 오류 확정이나 삭제 명령으로 옮기지 않는다. 자연스러운 표현·의도된 반복도 후보에 잡힐 수 있다.
- 돈·권한·접근권 같은 단어를 금지하지 않는다. 자기 이익, 인물의 말투, 빠른 단문, 고유 표면, 보상·모욕·반전·훅은 자동으로 고치지 않는다. 원작 재설계의 문제는 원작·사건·목적을 읽는 별도 검토에서 해결한다.
- 통계는 어절 다양성, 일부 피동 표면, 이중 조사 개수뿐이다. 높고 낮음의 좋고 나쁨을 정의하지 않으며, 문장 길이 할당량이나 전체 점수를 계산하지 않는다.
- [upstream v2 baseline](https://github.com/epoko77-ai/im-not-ai/blob/9747f036cdc28a1a8aea4dc71fef1f7846eb96f7/skills/humanize-korean/references/baseline_v2.json)은 미보정 placeholder를 명시한다. baseline·z-score·essay fallback·route hint는 호출하지 않는다. 웹소설 적합성이 검증됐다는 뜻도 아니다.
- upstream [Codex 스킬](https://github.com/epoko77-ai/im-not-ai/blob/9747f036cdc28a1a8aea4dc71fef1f7846eb96f7/codex/skills/humanize-korean/SKILL.md)은 일반 한국어 윤문용이며 웹소설 전용 계약이 없다. 기획서의 WHAT/HOW·9절 형식과 원고의 상업적 보상을 보존하는 어댑터를 별도로 유지하는 이유다.

## 갱신과 해제

자동 업데이트하지 않는다. 새 commit의 변경·라이선스를 읽고 별도 snapshot과 해시를 만든 뒤 같은 테스트 및 작품별 오탐 비교를 통과한 경우에만 정책의 pin을 바꾼다. 이전 pin은 유지하므로 정책을 되돌릴 수 있다. 연결을 해제하려면 이 독립 CLI 호출을 중단하면 된다. 현재 일일 기획 실행에 자동 삽입하지 않았다.

## 전체 분류 체계로 별도 모델 진단

`scripts/prose-review.py`는 정규식 세 종류를 넘어 문맥을 읽는 진단을 준비하고, 돌아온 결과를 검증한다. 이 스크립트 자체는 모델을 호출하지 않는다. 고정 taxonomy 전체에서 보류 A-17의 본문을 제외한 내용과 기존 `inkos-story-deslop/SKILL.md`, `semantic-cleanup.md`, `korean-fiction-signals.md`를 명시적으로 입력한다. 각 파일·입력·프롬프트·어댑터 해시를 `request.json`에 기록한다.

원본 README의 70개 안내는 현재 파일과 수량이 다르다. 고정 taxonomy에는 고유 ID **85개**, 보류 A-17을 제외한 활성 ID **84개**가 있다. J-1은 다른 항목과 달리 `##` 제목이라 `###`만 세면 누락된다. 전체 taxonomy 원본은 123,564 bytes / 66,717자이며 실제 토큰·비용은 모델 응답의 사용량을 별도로 확인한다.

```sh
python3 scripts/prose-review.py prepare --input /absolute/path/plan.md --directory /absolute/path/prose-review/job-001

# 별도 진단 작업. 기존 일일 실행 요약용 grok-supervisor 디렉터리와 구분한다.
python3 scripts/planning-process.py start --route grok-supervisor --input /absolute/path/prose-review/job-001/prompt.md --directory /absolute/path/prose-review/job-001/grok-diagnostic --timeout 600

# 실행 영수증에서 process_completed / exitCode=0을 확인한 뒤 검증한다.
python3 scripts/prose-review.py validate --request /absolute/path/prose-review/job-001/request.json --response /absolute/path/prose-review/job-001/grok-diagnostic/stdout.raw --execution-receipt /absolute/path/prose-review/job-001/grok-diagnostic/receipt.json --output /absolute/path/prose-review/job-001/observation.json
python3 tests/test_prose_review.py
```

준비는 새 디렉터리만 사용한다. `masked-input.txt`는 보호 구역을 공백으로 가리되 원본 문자 위치와 줄 수를 유지한다. 모델에는 줄 번호를 붙여 전달한다. 기존 기획서와 여섯 작성 경로의 입력은 수정하지 않는다. 원본·프롬프트·사용한 스킬·어댑터가 준비 이후 바뀌면 검증을 통과하지 않는다.

모델 결과에는 패턴 ID, 원문의 정확한 구절, 줄 번호, 기능상의 의심 이유, 유지할 이유 또는 불확실성이 있어야 한다. 검증기는 원문에 없는 인용·잘못된 위치·보호 구역·보류/미등록 ID·중복·점수·수정문 필드를 거절한다. 같은 구절이 한 줄에서 반복되면 원문 기준 열 번호도 필요하다. 아무 후보가 없다는 결과도 유효하다. 결과 파일을 덮어쓰지 않으며 stdout 원본과 사용량을 따로 보존한다.

실행 영수증을 제공하면 원래 진단 프롬프트 해시, stdout 해시, 정상 프로세스 종료, 실행 중 코드 변동 여부를 함께 검증한다. 모델 진단도 검토 후보일 뿐이다. 기획서 표 안의 설명이나 인용 등 가린 구역에 대한 전체 평가라고 보고하지 않는다. 자동 품질 판정이나 윤문을 연결하려면 좋은 원문·새 초안 양쪽에서 작품별 오탐을 사람이 먼저 확인해야 한다.
