# HQ Dispatcher v1

## 결론

Firefly Studio HQ는 계속 단일 지시 창구로 남는다. 다만 HQ가 자식의
제작 파일을 직접 쓰지 않고, manifest에 등록된 실행 주체에 버전된
`WorkOrder`를 전달한 뒤 `RunReceipt`를 집계한다.

v1은 그래프 런타임이 아니다. 나중에 계보 그래프로 승격할 수 있도록
작업 ID, 멱등성 키, 승인된 입력 참조, 자식·기능, 상태와 영수증 해시를
먼저 고정한 최소 실행 경계다.

## 계획 안정성 감리

### 1차 반례 감리

초안은 모든 자식을 같은 Worker로 다루려 했다. 실제 레포는 성격이
다르다.

- InkOS는 제작 엔진이며 JSON 실행 인터페이스가 있다.
- Market Radar는 명령형 수집 도구지만 공통 작업 영수증은 없다.
- Reference Lab은 분석 자산·검증기·handoff를 보관하는 연구
  라이브러리다.

따라서 `worker | tool | library`를 분리했다. v1에서 실행 가능한 것은
InkOS의 `status`, `interact`, `reference-bind`, `pitch-slate`다. 자식이 보고하지 않은
artifact를 HQ가 추정해서 영수증에 넣지 않는다. `reference-bind`는 예외적으로
Book config, reference binding, transformation, Rail plan 네 역할을 자식이
반드시 보고해야 하며, HQ가 파일 바이트와 SHA-256을 다시 확인하지 못하면
완료 영수증을 내지 않는다.

### 2차 반례 감리

단순히 HQ가 subprocess를 띄우는 것만으로 실행 주체가 분리됐다고 할
수 있는지 다시 검토했다. 다음 경계가 없으면 HQ가 여전히 우회적으로
저작할 수 있다.

- manifest에 없는 명령 실행 금지
- instruction을 process argument가 아닌 stdin으로 전달
- 변경 작업은 clean child에서만 실행
- 같은 작업의 중복 실행 방지
- 작품 단위 동시 변경 잠금
- 성공한 창작 결과도 사람 승인 전에는 `pending`

이 항목을 v1에 포함한 뒤 결론이 바뀌지 않았다. LangGraph, Temporal,
스케줄러, 범용 큐, 자동 재시도는 아직 필요하지 않다.

## 저장 계약

- `contracts/work-order-v1.schema.json`
- `contracts/run-receipt-v1.schema.json`
- 로컬 실행 영수증: `.firefly/runs/*.json` (Git ignored)
- 로컬 변경 잠금: `.firefly/locks/*.lock` (Git ignored)

`approvedInputs`는 계보 참조다. Dispatcher는 지정한 자식 Git 커밋의
파일 바이트와 현재 working-tree 바이트를 읽기 전용으로 확인하고 둘 다
SHA-256이 일치해야 실행한다. `privateInputs`는 tracked 승인 입력이 선언한
SHA, 같은 레포 경계, 실제 파일 경로, symlink 부재를 모두 검증한다. 원문
본문은 WorkOrder나 RunReceipt에 복사하지 않고 경로·역할·SHA만 남긴다.

자식이 산출물을 보고하면 Dispatcher는 경로와 해시 형식만 믿지 않고
실제 자식 파일 바이트의 SHA-256을 다시 확인한다. 변경 작업의 새 경로가
manifest의 `writeScopes`를 벗어나면 영수증을 `needs-attention`으로 남긴다.

## Manifest 실행 종류

| 종류 | 의미 | v1 실행 |
| --- | --- | --- |
| `worker` | 자체 실행·상태를 가진 엔진 | 가능 |
| `tool` | 제한된 명령형 도구 | 어댑터 도입 전까지 불가 |
| `library` | 조회·채택 대상 자산 | 실행 불가 |

기본 제작 엔진은 반드시 `worker`여야 한다. 변경 기능은 `writeAllowed`,
clean worktree, bounded `writeScopes`, `human` approval을 모두 요구한다.

## InkOS Adapter v1

### 읽기 전용 상태

```json
{
  "schemaVersion": 1,
  "workOrderId": "wo-status-example",
  "idempotencyKey": "status-example-001",
  "repo": "inkos",
  "capability": "status",
  "bookId": "book-id",
  "approvalMode": "none",
  "approvedInputs": [],
  "requestedAt": "2026-08-25T00:00:00.000Z"
}
```

### 작품 작업

```json
{
  "schemaVersion": 1,
  "workOrderId": "wo-interact-example",
  "idempotencyKey": "interact-example-001",
  "repo": "inkos",
  "capability": "interact",
  "bookId": "book-id",
  "instruction": "다음 Arc를 기획하되 사람 승인 전에는 캐논으로 승인하지 마.",
  "approvalMode": "human",
  "approvedInputs": [],
  "requestedAt": "2026-08-25T00:00:00.000Z"
}
```

Dispatcher는 instruction을 명령행에 노출하지 않고 stdin으로 InkOS
`interact --json`에 전달한다. 프로세스 성공은 작품 승인과 다르다.
`interact` 영수증은 성공 후에도 `approval.status=pending`이다.
`sessionId`를 생략하면 Dispatcher가 Book ID에서 안정적인 세션 ID를 만들어
같은 작품의 다음 지시에도 재사용한다. Arc 종료나 의도적 분기처럼 새 세션이
필요한 경우에만 안전한 `sessionId`를 명시한다.

InkOS의 `books/`와 `.inkos/`는 Git 무시 여부와 무관하게 Dispatcher가 실행
전후 SHA-256을 비교한다. 실제 변경은 `observedWrites`에 남고, 자식이 artifact를
보고하지 않아도 영수증은 `dispatcher-observed` 또는
`dispatcher-observed-no-change`로 사실을 구분한다.

### 장편 Reference bind

`reference-bind`는 Reference Lab의 tracked pack 하나와 그 팩이 SHA로 선언한
세 private 입력(`raw-source`, `story-index`, `style-examples`)을 InkOS Book에
결속한다. HQ는 입력만 검증·라우팅하고 Book 파일을 직접 쓰지 않는다.
InkOS가 활성 Arc를 기준으로 source→target 변형 지도와 6-anchor Story Rail을
보완한다. 실행 성공 후에도 `approval.status=pending`이며, 1화 후보를 현재
원고에 적용하는 HIL과는 별개다.

```json
{
  "schemaVersion": 1,
  "workOrderId": "wo-reference-bind-example",
  "idempotencyKey": "reference-bind-example-001",
  "repo": "inkos",
  "capability": "reference-bind",
  "bookId": "book-id",
  "approvalMode": "human",
  "approvedInputs": [{
    "repo": "firefly_reference_lab",
    "commit": "0000000000000000000000000000000000000000",
    "path": "inkos_handoffs/example/v1/reference-pack.json",
    "sha256": "0000000000000000000000000000000000000000000000000000000000000000",
    "role": "reference-pack"
  }],
  "privateInputs": [
    { "repo": "firefly_reference_lab", "path": "private_sources/source.txt", "sha256": "0000000000000000000000000000000000000000000000000000000000000000", "role": "raw-source", "declaredByRole": "reference-pack" },
    { "repo": "firefly_reference_lab", "path": "exports/reference-packs/example/story-index.jsonl", "sha256": "0000000000000000000000000000000000000000000000000000000000000000", "role": "story-index", "declaredByRole": "reference-pack" },
    { "repo": "firefly_reference_lab", "path": "exports/reference-packs/example/style-examples.jsonl", "sha256": "0000000000000000000000000000000000000000000000000000000000000000", "role": "style-examples", "declaredByRole": "reference-pack" }
  ],
  "requestedAt": "2026-08-26T00:00:00.000Z"
}
```

### Book 생성 전 N개 피치 슬레이트

`pitch-slate`는 후보를 작품으로 만들기 전에 죽이고 살리는 비정본 제작
경로다. `candidateCount`는 1~20이며 10은 운영 예시일 뿐 고정값이 아니다.
InkOS는 검증된 `pitch-reference-pack`을 읽고 후보를 한 개씩 생성·검증한
뒤, 전 후보가 유효할 때만 다음 두 파일을 원자적으로 공개한다.

```text
.inkos/pitch-slates/<slateId>/slate.json
.inkos/pitch-slates/<slateId>/review.md
```

후보는 제목·상업 약속, 주축 골격, 주인공의 반복 동사와 첫 자산, 1~4화
지급, A/B Rail, 6개 Arc, 보조 레퍼런스 라우팅, 장기 위험과 상업성 점수를
같은 형식으로 가진다. 독창성·원작과의 거리·표면 유사성은 점수에 넣지
않는다.

HQ는 두 파일의 경로와 SHA-256뿐 아니라 `canonStatus=non-canonical`,
`reviewStatus=pending`, 요청한 N과 실제 배열 길이, `p01..pNN` 순서,
후보별 `decision=pending`, 리뷰 문서의 후보 포함 여부를 다시 읽어
확인한다. 후보 생성은 Book, Rail, Arc, 원고를 만들지 않는다.

```json
{
  "schemaVersion": 1,
  "workOrderId": "wo-pitch-slate-example",
  "idempotencyKey": "pitch-slate-example-001",
  "repo": "inkos",
  "capability": "pitch-slate",
  "slateId": "chaebol-modern-fantasy-001",
  "candidateCount": 10,
  "instruction": "현대판타지 재벌물 후보를 상업성 최우선으로 설계한다.",
  "approvalMode": "human",
  "approvedInputs": [{
    "repo": "firefly_reference_lab",
    "commit": "0000000000000000000000000000000000000000",
    "path": "analyses/doksik-chaebol3/gold_reference_card.md",
    "sha256": "0000000000000000000000000000000000000000000000000000000000000000",
    "role": "pitch-reference-pack"
  }],
  "requestedAt": "2026-08-26T00:00:00.000Z"
}
```

### 독립 피치 생존심사

`pitch-review`는 기존 슬레이트의 생성자 자기점수와 `decision`을 모델
입력에서 제거하고, 별도 생존심사 스킬과 감리표로 전 후보를 한 번에
비교한다. 바로 제작할 후보가 있더라도 `SURVIVE` 추천은 최대 하나이며,
추천 결과는 사람 결정과 Book 승격을 대신하지 않는다.

```text
.inkos/pitch-slates/<slateId>/survival-review/review.json
.inkos/pitch-slates/<slateId>/survival-review/review.md
```

```json
{
  "schemaVersion": 1,
  "workOrderId": "wo-pitch-review-example",
  "idempotencyKey": "pitch-review-example-001",
  "repo": "inkos",
  "capability": "pitch-review",
  "slateId": "chaebol-modern-fantasy-001",
  "approvalMode": "human",
  "approvedInputs": [],
  "requestedAt": "2026-08-27T00:00:00.000Z"
}
```

HQ는 두 결과 파일의 정확한 경로와 해시, 원본 슬레이트 해시, 후보 전체가
한 번씩 포함된 순위, 최대 한 개의 `SURVIVE`, `humanDecision=pending`을
다시 읽어 검증한다.

### 인간 판정과 기획 승격

`pitch-decision`은 `select | hold | reject` 가운데 하나를 한 번만 불변
영수증으로 기록한다. 독립심사의 추천과 다른 후보를 고를 수 있으며,
원본 슬레이트와 심사 파일은 계속 그대로 둔다. `hold`와 `reject`에는
근거 메모가 필수다.

`pitch-promote`는 `select` 판정의 원본 슬레이트·심사·판정 SHA-256을 모두
재검증한 뒤 선택 후보만 표준 InkOS Book의 기획 기반으로 승격한다.
Book은 `outlining`, 수동 검토 모드로 시작하며 `story/pitch-selection.*`에
선택 근거를 남긴다. 이 명령은 회차 원고를 만들거나 자동 연재를 시작하지
않는다.

승격 영수증에는 `selects`, `promotes_to` 계보 간선만 기록한다. 이는 기존
파일·영수증을 읽는 얇은 계보 근거이며 별도 그래프 DB나 실행 런타임이
아니다.

## v1 비범위

- HQ의 임의 파일 편집을 운영체제 권한으로 차단하는 sandbox
- Market Radar 자동 실행
- Reference Lab 자동 분석
- 자식 간 자동 writeback
- 자식이 보고하지 않은 artifact 추정
- 그래프 실행·스케줄·분산 큐와 별도 그래프 SSOT
- 창작 결과 자동 승인

## 승격 조건

현재 피치 판정·승격 영수증은 필요한 계보 간선만 생산한다. 여러 전이에서
stale·다음 행동 조회가 실제 비용이 되면 이 영수증을 읽는 read-only
artifact-lineage index를 추가한다. 두 번째 실행형 자식이 안정된 계약을
제공하거나 재시작·동시 실행 비용이 반복되기 전에는 실행 그래프 런타임을
도입하지 않는다.

## 검증 영수증

- manifest v2 검증: PASS, 4개 자식 등록
- HQ 단위·통합 테스트: 26/26 PASS
- `npm run validate`: PASS
- `git diff --check`: PASS
- InkOS 읽기 전용 실제 호출: `status=succeeded`
- 실행 cwd: `edge_repos/inkos`
- InkOS HEAD 전후: `609d93e0` 동일
- 추적 worktree 전후: 변경 없음
- 영수증: `rr-86c8579b140dffda4ec22e80`
- 같은 idempotency key 재호출: 동일 영수증, `replayed=true`
- InkOS `interact` 변경 작업: dry-run PASS, instruction은 stdin 전달,
  `human` approval 필수

읽기 전용 카나리는 InkOS의 작품 3개를 반환했다. 그중 기존 `IMF 직전,
장인 회사를 인수했다`는 3화, 승인 0, 검수 대기 3 상태였다. 원고·캐논·
자식 Git에는 변경이 없었다.
