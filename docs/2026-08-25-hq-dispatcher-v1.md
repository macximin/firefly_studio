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
InkOS의 `status`, `interact`, `reference-bind`다. 자식이 보고하지 않은
artifact를 HQ가 추정해서 영수증에 넣지 않는다.

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
  "sessionId": "hq-book-id",
  "instruction": "다음 Arc를 기획하되 사람 승인 전에는 캐논으로 승인하지 마.",
  "approvalMode": "human",
  "approvedInputs": [],
  "requestedAt": "2026-08-25T00:00:00.000Z"
}
```

Dispatcher는 instruction을 명령행에 노출하지 않고 stdin으로 InkOS
`interact --json`에 전달한다. 프로세스 성공은 작품 승인과 다르다.
`interact` 영수증은 성공 후에도 `approval.status=pending`이다.

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

## v1 비범위

- HQ의 임의 파일 편집을 운영체제 권한으로 차단하는 sandbox
- Market Radar 자동 실행
- Reference Lab 자동 분석
- 자식 간 자동 writeback
- 자식이 보고하지 않은 artifact 추정
- 그래프 실행·스케줄·분산 큐
- 창작 결과 자동 승인

## 승격 조건

두 번째 실행형 자식이 안정된 `WorkOrder/RunReceipt`를 제공하거나,
재시작·stale 전파·동시 실행이 반복적인 실제 비용으로 확인될 때
Dispatcher 위에 얇은 artifact-lineage graph를 추가한다.

## 검증 영수증

- manifest v2 검증: PASS, 3개 자식 등록
- HQ 단위·통합 테스트: 15/15 PASS
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
