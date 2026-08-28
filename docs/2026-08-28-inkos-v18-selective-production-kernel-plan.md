# InkOS v1.8 벤치마크 기반 선택 이식·Production Kernel 구현안

- 작성일: 2026-08-28
- 상태: 계획 확정 / Phase 0·1·2·3·4·5·6 완료 / Phase 7 survey 완료·deep-read/자산 승격 대기
- 계획 모델: `gpt-5.6-sol / ultra`
- 구현 모델: `gpt-5.6-sol / max`
- HQ 기준: `3958b37e73362792300cc85311b00dce4a3f31ae`
- InkOS 기준: `44eeaeca508bf3aa6dffb1cf5a6a142e2b2042c8`
- Phase 0 InkOS commit: `6dad71c1` (`master`, origin push 확인)
- Phase 0 HQ commit: `d6d1619a` (`main`, origin push 확인)
- Phase 1 InkOS commit: `06e08d07` (`master`, origin push 확인)
- Phase 2 InkOS commit: `8a923e7e` (`master`, origin push 확인)
- Phase 3 InkOS commit: `d48fde2a` (`master`, origin push 확인)
- Phase 4 InkOS commit: `e685a2ec` (`master`, origin push 확인)
- Phase 5 InkOS commit: `b3a7b3ca` (`master`, origin push 확인)
- Phase 6 InkOS commit: `97deb354` (`master`, origin push 확인)
- Phase 7 Reference Lab commits: `822ec3d`, `a94ab1f`, `1c89819`, `8747f99`, `1d9a19a`, `5c223c7` (`main`, origin push 확인)
- Phase 7 InkOS commits: `a66352fe`, `65936698`, `8ff9d72b`, `889eadc5`, `77591412` (`master`, origin push 확인)
- Phase 7 Storyyard commit: `f1c4e1e` (`main`, origin push 확인)
- Phase 7 HQ commits: `f4130e7`, `92979f6`, `e2dfe51`, `2ebf1d0`, `fe0643a`, `89ea50a`, `542d0f4` (`main`, origin push 확인)
- upstream 기준: `091048383f411eb99948a8764f42b6fd13006f9b`
- upstream 확인: 로컬 `upstream/master`와 원격 `refs/heads/master` 일치
- 범위: InkOS 생산 실행, Soul/Skill 결속, 검색 projection, HQ 호출 경계,
  읽기 전용 계보

`sol/max`는 이 계획을 코드로 옮길 구현 agent의 설정이다. 실제 Hermes·InkOS
창작 호출 기본값은 기존 Soul 계획의 `gpt-5.6-sol / high`를 유지하며, owner가
별도로 바꾸지 않는 한 구현 모델 설정을 production runtime으로 전파하지 않는다.

## 구현 상태

2026-08-28에 Phase 0부터 Phase 6까지 각각 독립 완료선으로 구현했다. Phase 0은
현재 강점과 의도적 upstream 비채택 표면을 machine-readable fixture로 고정했고,
Phase 1은 owner direction provenance와 strict session binding 두 정확성 결손을
수정했다. Phase 2는 기존 Chapter mutation, Reference HIL과 reference bind의
commit correlation·process-death recovery를 보강했다. Phase 3은 기존
`PipelineRunner`를 그대로 둔 채 typed authority, observe-only execution context와
receipt-reference run projection을 추가했다. Phase 4는 production Skill trusted
namespace, append-only BookSoulBinding과 operation-scoped input receipt를 결속했다.
Phase 5는 HQ v2와 Studio·CLI·TUI·Agent 실행 표면을 동일 Core gateway로 수렴하고
bodyless evidence readback을 검증한다. Phase 6은 strict Soul-null baseline에서
legacy·observe·enforce와 CLI-direct·Agent·HQ의 canon/model-call/HIL parity를
독립 canary로 검증한다.

Phase 7의 실행 기반도 구현했다. Reference Lab은 398개 남성향 재고와 32개
로컬 검증본을 source registry로 고정하고, 관리자가 장르별 3개씩 선택한
9개만 survey/deep-read 입력으로 허용한다. 세 장르 9개에 대한 분산 survey와
전체 available 코퍼스 zero-match 누출 검사까지 완료했다. strict study/promotion evidence와
read-only private slice resolver도 제공한다. InkOS는 세 한국어 남성향
genre profile·versioned Soul과 blind Review Packet v2를 소유한다. HQ는 세
격리 Hermes 후보와 60초 Ed25519 grant 기반 loopback-only source gateway를
검증하며, Storyyard는 v1을 보존한 채 v2 blind pair·사람 표면 분류·일회성
source slice UI를 제공한다. survey 완료는 전작 deep-read나 학습·승격 완료가 아니다.

- Phase 0 InkOS: `6dad71c1` — `origin/master` 반영 완료
- Phase 0 HQ: `d6d1619a` — `origin/main` 반영 완료
- Phase 1 InkOS: `06e08d07` — `origin/master` 반영 완료
- Phase 1 회귀: Core 2433, Studio 651, CLI 251 — 총 3335 tests PASS
- Phase 2 InkOS: `8a923e7e` — `origin/master` 반영 완료
- Phase 2 회귀: Core 2441, Studio 651, CLI 251 — 총 3343 tests PASS
- Phase 2 process-death fixture: 실제 child `SIGKILL` 기반 Chapter rollback,
  reference activation rollback, applied HIL resume 3건 PASS
- Phase 3 InkOS: `d48fde2a` — `origin/master` 반영 완료
- Phase 3 회귀: Core 2452, Studio 652, CLI 251 — 총 3355 tests PASS
- Phase 3 process-death fixture: 실제 child `SIGKILL` 뒤 abandoned
  crash-after-commit terminal reconcile, Writer 재호출 0회 PASS
- Phase 4 InkOS: `e685a2ec` — `origin/master` 반영 완료
- Phase 4 회귀: Core 2459, Studio 653, CLI 251 — 총 3363 tests PASS
- Phase 5 InkOS: `b3a7b3ca` — `origin/master` 반영 완료
- Phase 5 회귀: Core 2469, Studio 654, CLI 252 — 총 3375 tests PASS
- Phase 5 HQ: 30 tests, WorkOrder/RunReceipt v2 schema와 actual child evidence PASS
- Phase 6 InkOS: `97deb354` — `origin/master` 반영 완료
- Phase 6 neutral canary: 동일 5-lane fixture 2회 연속 PASS, Core 2471,
  Studio 654, CLI 252 — 총 3377 tests PASS
- Phase 7 InkOS Review Packet v2 회귀: Core 2479, Studio 654, CLI 252 —
  총 3385 tests PASS; typecheck, build, semantic audit, publish manifest PASS
- Phase 7 owner-direction follow-up: `/write` 명령과 exact context-file bytes를
  분리하고 빈/비-write context를 차단. Core 2480, Studio 654, CLI 257 —
  총 3391 tests PASS
- Phase 7 surface selector bridge: story UTF-16 range와 range-less style prose를
  검증된 UTF-8 byte selector로 변환. Core 2483, Studio 654, CLI 257 —
  총 3394 tests PASS; 실제 Doksik pack story/style가 동일 `32..138` byte로 수렴
- Phase 7 Storyyard: build와 21 tests PASS
- Phase 7 Reference Lab: 32 tests, 실제 resolver entrypoint와 manager-selection
  byte readback 검사 PASS. 손상·회차 이상 source를 제외하는 UTF-8/회차 무결성
  gate 뒤 장르별 3개, 총 9개만 Soul 입력 가능
- Phase 7 Reference Lab survey: 격리 Hermes `gpt-5.6-sol/high` 9 runs,
  48 distributed windows, 744,526 tokens, 28 API calls 완료. profile config,
  usage, session trace와 window별 별도 read call을 private receipt로 검증했고,
  tracked survey 3건은 32개 available 원문 대비 누출 0건으로 PASS
- Phase 7 HQ transport 시점: manifest/Hermes profile validate, 39 tests,
  4-child status PASS
- Phase 7 owner authority: strict promotion decision·active adoption registry
  schema/readback을 추가하고 active 0, 세 Hermes candidate/disabled를 검증. HQ
  44 tests PASS. 실제 promotion은 생성하지 않음
- Phase 7 runtime evidence correction: direct `write-next`는 Hermes를 호출하지
  않으므로 InkOS/HQ receipt가 `hermesE2E=false`, `orchestrator.invoked=false`,
  `evidence=work-order-declaration`을 강제. InkOS CLI 257 tests와 typecheck/build,
  HQ false-Hermes fixture PASS
- private source transport canary: 실제 검증 원문 554 bytes를 signed grant,
  HQ packet selector, Reference Lab fd3, 반환 SHA 경로로 1회 통과. raw 영속 0.
  `source-slice-transport-canary/v1`이며 path/promotion/review 증거로 사용하지 않음
- 품질 gate: typecheck, build, semantic audit, publish manifest, diff check PASS
- Phase 5 HQ gate: manifest validate, 30 tests, 4-child status/contract/sync PASS
- P0/P1 감리: 완료 처리된 구현 표면의 잔여 결함 없음. Phase 1의 Studio Core binding 오류 HTTP 409
  projection, Phase 2의 ready transition audit-receipt 재검증, Phase 3의 receipt
  body 중복 제거와 premature Skill activation 차단, Phase 4의 decision ID 단회
  사용과 production Skill identity drift 차단, Phase 5의 actual evidence byte·Soul
  expectation 검증, Phase 6의 actual surface canary와 Soul-null 해석을 감리 중 추가.
  Phase 7 감리에서는 resolver 무기한 대기와 평문 비-loopback 바인딩 두 P1을
  발견해 각각 5초 kill boundary와 explicit loopback guard로 수정. 문서 대조에서
  context를 붙이면 `/write` 판정이 깨지는 P1도 찾아 exact detached lease로 분리
  했다. 이어 direct `write-next`가 Hermes 요청값을 실효 runtime처럼 투영하는 P0를
  찾아 명시적 non-E2E evidence로 수정했다. 문서가 완료로 표기했던
  `agent-operate`는 manifest·Dispatcher에 없음을 확인해 미완료로 재분류했다
- Phase 1은 dependency·Node floor·Soul·production Skill·LengthNormalizer와 HQ
  WorkOrder 계약을 변경하지 않음
- 다음 재개점: **장르별 strict deep-read**. manager selection과 9개 분산
  survey는 완료됐지만 전작 coverage·작품별 보고서·manager QA가 없어
  격리 Book path canary와 promotion canary는 정직하게 차단되어 있다.
  promotion pair 전에 HQ `agent-operate` adapter와
  adoption dispatch gate, 문서 계약 그대로의 session-less path canary adapter도
  별도 완료해야 한다. Phase 8은 Phase 7 승격 완료 뒤 진행

### Phase 1 구현 영수증

- confirmed Studio·Agent owner 지시는 exact UTF-8 bytes를 ignored local-only
  detached lease에 mode-restricted atomic write로 보관한다. action/result에는
  본문 대신 lease·payload·receipt SHA, byte length와 expiry만 남긴다.
- `sub_agent(writer).instruction`은 owner direction과 분리된 `model-mediated`
  guidance로 단일·batch Writer에 전달한다. Writer prompt에서도 owner 최고 권위
  block과 model subordinate block을 분리한다.
- strict transcript reader는 leading header, schema, session ID, sequence와 전체
  metadata chain을 검증한다. 명시적 null-to-Book 한 번만 허용하고 Book rebinding과
  session kind drift를 cache/model보다 먼저 차단한다.
- concurrent migration은 per-session append queue에서 직렬화되어 한 Book만
  승리한다. Studio는 Core binding 오류를 HTTP 409로 투영하되 불변식은 Core가
  소유한다.
- 상세 검증: InkOS
  `docs/2026-08-28-production-kernel-phase1-direction-session-binding.md`

### Phase 2 구현 영수증

- 모든 Chapter mutation은 Book lock 안에서 한 번 만든 최소
  `ProductionAttemptIdentity`를 fiction invocation·operation manifest와
  `chapter-commit-receipt/v1`까지 전달한다. production ID와 fiction operation
  ID는 분리되며 capability와 실제 operation kind가 일치해야 한다.
- commit receipt는 manuscript/index/current-state hash, operation manifest와 Rail
  truth applicability를 묶는다. Rail evidence가 빠진 commit은 원고 재생성 없이
  `production-evidence-needs-recovery`로 차단하고 evidence-only repair만 허용한다.
- Studio, CLI와 Storyyard approve는 하나의 typed compound HIL action을 사용한다.
  owner-approved 원고는 forward-only이며 resync/audit 실패 또는 process death는
  append-only `needs-attention` 상태로 재개한다.
- `ready` readback도 verified audit commit receipt와 현재 Chapter gate를 다시
  검증한다. Studio는 후속 처리 건수와 apply transition을 표시한다.
- reference bytes는 content-addressed project object로 설치하고 Book config,
  binding, transformation과 Rail activation은 Book-local durable journal로
  복구한다. supporting reference는 계속 `planned`다.
- 상세 검증: InkOS
  `docs/2026-08-28-production-kernel-phase2-mutation-durability.md`

### Phase 3 구현 영수증

- self-hashed `production-command/v1`은 typed button, slash, quick-action의
  `write_next`만 mutation authority로 인정한다. free text는 forged intent가 있어도
  proposal/chat 경로에 남는다.
- `ProductionExecutionContext`는 Book/session/request와 attempt correlation만
  전파하며 권한 우회에 쓰이지 않는다. detached owner direction lease는 Book lock
  안에서 Writer 호출 직전에 다시 검증한다.
- preparing/running snapshot과 immutable `production-run/v1` terminal은 기존
  Chapter commit receipt를 경로·SHA로 참조한다. receipt 본문을 복제하거나 canon
  상태를 소유하지 않는다.
- 동일 idempotency+intent는 terminal을 재사용한다. 다른 intent 충돌, 복수
  receipt, canon fingerprint drift와 symlink projection path는 fail-closed다.
- failure/cancel은 exact no-commit을 증명해야 terminal이 되고, post-commit 오류와
  process death는 receipt로 success를 reconcile해 Writer를 다시 부르지 않는다.
- `kernel=off`가 기본이고 `observe`만 opt-in 가능하다. `enforce`는 Phase 6 neutral
  runtime promotion gate 전까지 명시적으로 차단된다.
- Phase 3 시점에는 production Skill과 Soul 결속을 구현하지 않았으며, 이 경계는
  아래 Phase 4의 별도 receipt와 commit으로만 해제했다.
- 상세 검증: InkOS
  `docs/2026-08-28-production-kernel-phase3-observe-projection.md`

### Phase 4 구현 영수증

- 일반 Agent Skill의 last-write-wins registry와 production trusted namespace를
  분리했다. `write-next-chapter`는 hash-pinned builtin `inkos-long-writing`을
  required로 해석하고 owner overlay는 명시적으로 요청된 ID만 별도 해석한다.
- Soul package는 content-addressed object로 설치·readback한 뒤 Book lock과 기존
  mutation journal 안에서 append-only binding history, active pointer와 owner
  decision receipt를 함께 commit한다.
- Book session은 `{soulId,soulVersion,bindingSha256}`에 고정된다. active Soul이
  바뀐 stale session은 모델 호출 전에 HTTP 409로 거절한다.
- Kernel은 Book lock 안에서 실제 Soul/Skill bytes를 다시 해석하고
  `production-input-receipt/v1`을 만든다. prompt raw bytes는 operation 범위에서만
  사용하며 run projection에는 hash receipt만 남긴다.
- owner-authorized private source의 정확한 prose·rhythm·event arrangement·style
  example은 Writer에 제공할 수 있다. authorized binding 안의 표면 겹침은 자동
  감점·억제·거리두기·재작성 사유가 아니다.
- 같은 Book의 decision ID 재사용, required Skill shadow/missing/disabled/hash
  conflict, requested Skill identity drift, Soul/Skill symlink·path·size·NUL·extension
  위반과 stale session을 fail-closed한다.
- 상세 검증: InkOS
  `docs/2026-08-28-production-kernel-phase4-soul-skill-binding.md`

## 최종 결론

upstream v1.8의 핵심은 그래프 런타임이 아니다. 여러 생산 경로를
`Pi agent loop + typed tool + production skill + retrieval projection + run
observation`으로 수렴시킨 실행 하네스 고도화다. Node 22 전환은 이 구조의
정체성이 아니라 `node:sqlite`와 FTS5를 공통 필수 기반으로 삼은 결과다.

Firefly InkOS에는 v1.8 전체 merge, rebase 또는 대형 commit cherry-pick을
하지 않는다. 현재 fork의 `PipelineRunner`, Book/Arc/A·B Rail, BookRules
provenance, owner-authorized private reference, fiction-content-neutral 계약,
chapter journal, operation manifest와 chapter truth receipt가 upstream보다
강한 생산 정본이다.

채택할 것은 원리와 작은 모듈이다.

1. 기존 실행을 복제하지 않는 얇은 `ProductionKernel` façade
2. 기존 영수증을 참조하는 `production-run/v1` 상관관계 projection
3. Book에 host가 고정하는 Soul·production Skill binding
4. 현재 provider와 내용중립 경계를 보존한 Pi worker 수명주기
5. Markdown·구조화 파일을 권위 원본으로 유지하는 FTS5/BM25 검색 projection
6. surface별 heuristic을 대체하는 Core structured action·authorization predicate
7. 영수증에서 재생성하는 읽기 전용 artifact-lineage index

새 graph runtime, 두 번째 생산 상태 머신, 두 번째 transaction layer는 만들지
않는다. HQ는 계속 지시·권한·집계 경계이고 InkOS가 유일한 생산 실행 주체다.

## 결론 안정성 기록

아래는 내부 추론 전문이 아니라 각 반론 통과 후의 결정 변화만 기록한 것이다.

### 초안 판정

`upstream v1.8 병합 후 Firefly 기능 복원`을 검토했다. 현재 fork는 upstream과
`38 local / 15 upstream commit`으로 갈라져 있고, 공통 조상 이후 양쪽에서
수정된 경로가 넓으며 dry merge에서 다수의 실제 충돌이 확인됐다. 더 중요한
문제는 문법 충돌이 아니라 생산 권위·원자성·레퍼런스 정책의 의미 충돌이다.
전체 병합안은 폐기했다.

### 안정 결론 A

현 `PipelineRunner`를 기획·집필·검수·수정의 유일한 creative pipeline으로
유지하고, 기존 InkOS state service와 함께 얇은 typed façade 뒤에 둔다.
상관관계 영수증, Soul/Skill binding, 검색 projection은 단계별로 붙인다.

### 1차 역감리: Pi-first 반론

“upstream처럼 모든 worker를 먼저 Pi로 통일해야 중복이 줄지 않는가”를
검토했다. 현 `BaseAgent`의 내용중립 invocation evidence, Codex 전용 transport,
provider refusal·abort·truncation fail-closed 경계를 먼저 우회하게 되어 회귀
반경이 더 컸다. Pi는 현재 transport 아래의 worker lifecycle adapter로
후순위 이식하는 것이 맞다. 안정 결론 A는 바뀌지 않았다.

### 2차 역감리: graph-first·운영비 반론

“edge repo가 늘기 전에 그래프를 미리 깔면 미래 비용이 줄지 않는가”와
“새 영수증·HIL이 운영비만 늘리지 않는가”를 함께 검토했다. 현재 production은
InkOS Book lock 아래 대부분 순차적이고 HQ idempotency, session transcript,
operation manifest, chapter journal과 truth receipt가 이미 재개 상태를
소유한다. graph checkpoint를 더하면 상태 소유자가 늘어난다.

새 projection은 기존 영수증 본문을 복제하지 않고 경로·SHA만 참조하며,
Kernel/FTS는 추가 모델 라운드 없이 observe·shadow로 시작한다. Pi는 독립
optional track에서 bounded 추가 call을 별도 비용으로 측정한다.
따라서 미래 교체 비용은 줄이되 현재 인지·실행 비용은 제한할 수 있다.
안정 결론 A는 다시 바뀌지 않았다.

결론은 두 번의 독립 반론 이후 연속으로 유지됐다. 이 문서는 그 안정 결론의
구현 정본이다.

## 벤치마크 판독

| upstream v1.8 변화 | 실제 목적 | Firefly 판정 |
| --- | --- | --- |
| Pi agent loop와 typed result tool | worker별 모델 호출·구조화 결과·취소·관측 통일 | 원리 채택, 현재 transport 아래 수동 이식 |
| production mode별 Skill binding | 작업별 지침·resource 주입 표준화 | host-bound Soul과 함께 채택 |
| ProductionRun snapshot | 진행·단계·artifact·observation 공통 표면 | 기존 영수증을 참조하는 projection으로만 채택 |
| FTS5/BM25 local search | 파일 원본은 유지하면서 공통 검색과 source trace 제공 | dual-shadow 후 조건부 승격 |
| Studio/TUI structured action | 자유입력과 실제 mutation 권한 분리, bounded quick-action 예외 | surface 규칙을 복사하지 않고 Core 정책으로 수렴하며 HQ용 인증 source 추가 |
| Node 22 | `node:sqlite` 기반을 필수화 | FTS가 필수일 때 독립 변경으로 채택 |
| creation workflow 수렴 | 서로 다른 제작 entrypoint 감소 | 기존 PipelineRunner capability를 gateway 뒤로 연결 |
| graph engine | upstream에 해당 구조 없음 | 도입하지 않음 |

### 그대로 들이지 않는 항목

- `c56586ec`, `35bb2efd`, `d1d6d8ec`, `e7c04465` 같은 대형 결합 commit
- upstream `BaseAgent`, `AgentSession`, `PipelineRunner`, Writer 전체 교체
- 현재 durable chapter journal보다 약한 snapshot·atomic helper
- LengthNormalizer 일괄 삭제
- 원문 wording, scene order, signature combination 재현을 절대 금지하는
  upstream long-writing Skill 문구
- stale hook을 무조건 advance·resolve·defer하게 하는 규칙
- BM25 순위로 BookRules, canon, Arc/Rail 또는 권한을 결정하는 구조
- run snapshot을 완료 정본이나 두 번째 SSOT로 취급하는 구조
- LangGraph, Temporal, 범용 큐 또는 범용 DAG runtime

upstream v1.8 이전 공통 기반인 chapter workspace(`7a0b1a70`), atomic chapter
state(`efe44dfd`), Book-bound reference(`2e0e22ac`), trajectory metadata
(`4e25bb6f`)는 이미 현 fork가 보유하거나 더 강하게 확장했다. 새 채택 항목으로
중복 구현하지 않는다.

`e7c04465`의 long-form completion adapter는 LengthNormalizer 삭제와 별개로
분리 벤치마크한다. 현재 한국어 length governance, 이어쓰기 경계, 중복 문장과
비용 회귀를 통과하기 전에는 채택하지 않는다. `52075bb9`의 Windows path
assertion은 이미 수동 이식됐다. 남은 persisted-path production hunk는 새
Skill/run projection에서 실제 OS drift가 재현될 때만 작은 함수 단위 후보로
다시 본다.

## 현재 fork에서 보존할 강점

다음은 교체 대상이 아니라 새 경계가 감싸고 증명해야 하는 정본이다.

| 현재 기능 | 소유자 | 보존 이유 |
| --- | --- | --- |
| HQ WorkOrder·idempotency·target reservation·write readback | HQ Dispatcher | HQ가 쓰지 않고 실행 주체를 분리하는 경계 |
| Pi 기반 주 대화 AgentSession | InkOS AgentSession | 세션·확인·도구 권한·transcript의 현재 정본 |
| Architect→Planner→Writer→Auditor→Reviser | PipelineRunner | 결정론적 creative pipeline의 실제 실행 중심 |
| Book·active Arc·A/B Rail | InkOS Book | 작품 정본과 현재 제작 방향 |
| BookRules provenance | InkOS host | 모델 제안을 owner hard rule로 세탁하지 않는 권위 경계 |
| `fiction-content-neutral-ko/v1` | InkOS host | 허구를 도덕 교과서로 자동 교정하지 않는 불변 계약 |
| private reference·style binding | Reference Lab→InkOS | 실제 원문 표면을 hash-bound input으로 쓰는 상업 제작 경로 |
| chapter journal·operation manifest·truth receipt | InkOS state | crash recovery와 false-complete 방지 |
| Storyyard review packet·decision | Storyyard→InkOS | 사람 검토와 canon 적용 주체 분리 |
| Korean deslop·장르 규칙 | InkOS production | 현 한국 웹소설 출력 품질 경계 |

## 확인된 실제 결손

### P0 정확성 결손

1. `sub_agent(writer)`의 `instruction`이 단일·배치 Writer의 최종
   `externalContext`에 전달되지 않는다. 다만 이 값은 main model이 만든 tool
   arg이지 owner 원문 자체가 아니다. 그대로 버리지 않되 `model-mediated`
   context로 provenance를 남기며, owner 방향으로 쓸 값은 typed action payload의
   exact bytes·selector·decision receipt에서 별도로 가져와야 한다.
2. persisted transcript의 effective Book/session binding을 restore 전에 엄격히
   검증하지 않는다. 단순히 첫 `session_created`와 새 요청을 비교하면 합법적인
   null→Book `session_metadata_updated` 전이도 깨진다. 전체 event chain에서
   허용된 binding 전이와 receipt를 계산한 뒤 cache·model보다 먼저 대조해야 한다.

이 둘은 새 architecture의 전제가 아니라 현재 기능의 정합성 결손이므로
가장 먼저 고친다.

### P1 관측·권위 결손

1. HQ WorkOrder, session request, fiction invocation, operation manifest,
   chapter truth receipt와 HQ RunReceipt를 한 실행으로 잇는 child-level
   correlation envelope가 없다.
2. production capability별 기본 Skill과 Soul이 host에서 결정적으로 결속되지
   않고 실제 주입 byte·resource hash 증거가 없다.
3. 구조화 Markdown·Book truth와 SQLite memory는 있지만 공통 FTS5/BM25
   retrieval trace가 없다.
4. Storyyard/HIL `apply → resync → audit`가 하나의 typed compound operation과
   하나의 상태 판정으로 묶여 있지 않다.
5. reference bind는 잡힌 예외를 복원하지만 process death 중간 상태를 기존
   durable journal과 같은 수준으로 회복하지 못한다.
6. `supportingReferences`는 schema에는 있으나 Writer runtime spine 외
   reference 소비가 증명되지 않았다.

## 목표 구조

```text
HQ Dispatcher / Hermes / Studio / CLI / TUI
                    |
                    v
       typed InkOS ProductionCommand
                    |
                    v
           ProductionKernel facade
  - command, source, binding, idempotency 검증
  - 기존 Book lock과 transaction 재사용
  - Soul, Skill, source, BookRules hash resolve
  - ProductionExecutionContext 전파
  - 기존 영수증 readback과 run projection 집계
                    |
                    v
 기존 PipelineRunner·state service·전문 agent
                    |
                    v
 Book / Arc / Rail / Chapter + 기존 truth receipts

옆면 projection
  - FTS5/BM25: 삭제·재생성 가능한 검색 인덱스
  - artifact-lineage: 영수증에서 재생성하는 읽기 전용 인덱스
  - Storyyard: 불변 후보와 pending human decision
```

`ProductionKernel`은 작품 내용을 결정하거나 새 pipeline stage를 발명하지
않는다. command 검증, 기존 capability 호출, 실행 context 전파, 실제 파일
readback과 영수증 집계만 담당한다. “하나의 Kernel”은 “하나의 장기 생존
agent instance”를 뜻하지 않는다. AgentSession은 대화 상태를 유지하고,
worker는 operation-bound로 실행된다.

### 단일 상태 소유 원칙

- canon 내용 진실: 기존 Book/Arc/Rail/Chapter artifact bytes
- mutation→최종 bytes 상관관계: `chapter-commit-receipt/v1`
- 모델 호출·stage 완전성: content invocation/outcome + operation manifest
- continuity/Rail 파생 진실: 기존 chapter truth receipt
- crash recovery: 기존 atomic file set + chapter journal
- 대화 상태: 기존 session transcript
- HQ 중복 방지·외부 관측: WorkOrder + HQ RunReceipt
- 새 `production-run/v1`: 위 사실을 참조하는 상관관계 projection

새 projection에 canon 본문, 기존 receipt 본문 또는 별도 completion truth를
복사하지 않는다. projection write가 canon commit 뒤 실패하면 production을
재실행하지 않고 reconciler가 commit receipt와 실제 artifact hash를 읽어
projection만 복구한다.

## 권위와 품질을 분리한다

### 실행 권위 계층

1. 인증된 owner 지시와 명시적으로 채택된 hard BookRule
2. Book canon, current Arc, A/B Rail과 확정된 현재 상태
3. 검증된 reference binding, transformation map과 private source selector
4. immutable `BookSoulBinding`
5. capability별 production Skill
6. provider·model 기본값

`fiction-content-neutral-ko/v1`, 실제 repository 권한, private source 접근,
provider 제한은 창작 취향이 아니라 host invariant다. Soul, Skill, 모델은
mutation 권한이나 hard BookRule 권위를 만들 수 없다.

### 창작 품질 우선순위

`도파민·재미·상업성 > 감정적 정합성 > 선택한 레퍼런스 엔진·문체 실행 >
비핵심 세부 정합성`

돈, 권한, 생존, 정보 보유, 현재 Arc처럼 작품을 깨는 hard contradiction은
별도 불변식으로 0건이어야 한다. 감정적 정합성은 도덕적 정당성이 아니라
욕망·모욕·선택·목격·보상의 독자 체감 인과다. 표면 거리나 원작과의 차이는
상업성 점수로 쓰지 않는다.

## 제안 계약

### `production-command/v1`

모든 mutation surface는 같은 typed command를 만든다. 자유입력은 제안일 수
있지만 typed confirmation 또는 인증된 orchestrator WorkOrder 없이 mutation
command가 되지 않는다.

```json
{
  "schemaVersion": "production-command/v1",
  "commandId": "uuid",
  "idempotencyKey": "stable-key",
  "source": "hq-dispatcher",
  "actionSource": "authenticated-orchestrator",
  "capability": "write-next",
  "bookId": "book-id",
  "sessionId": "book-stable-session",
  "authorization": {
    "kind": "work-order-v2",
    "workOrderId": "work-order-id",
    "workOrderSha256": "sha256",
    "ownerDecisionReceiptId": "decision-id",
    "ownerDecisionReceiptSha256": "sha256",
    "argsSha256": "sha256"
  },
  "args": {
    "chapterCount": 1,
    "targetLength": { "count": 3000, "unit": "ko-chars" },
    "ownerDirection": {
      "receiptId": "decision-id",
      "sourceRef": {
        "kind": "detached-payload-lease",
        "leaseId": "owner-direction-1",
        "payloadSha256": "sha256",
        "byteLength": 128,
        "expiresAt": "ISO-8601",
        "leaseReceiptSha256": "sha256"
      },
      "textSha256": "sha256"
    },
    "taskGuidance": {
      "source": "model-mediated",
      "transcriptRef": { "sessionId": "session-id", "seq": 42 },
      "textSha256": "sha256"
    }
  },
  "contextRefs": [
    {
      "repo": "inkos",
      "role": "external-context",
      "path": "repo-relative-path",
      "sha256": "sha256"
    }
  ],
  "requestedAt": "ISO-8601"
}
```

초기 `write-next/v1`은 `chapterCount=1`만 허용한다. batch는 single-Chapter
operation이 안정된 뒤 parent command가 Chapter별 child
`productionOperationId/attemptId`
를 참조하는 별도 `write-batch/v1`로 설계한다. 하나의 manifest·truth receipt로
1~20장 전체를 성공 처리하지 않는다.

`ownerDirection`과 `taskGuidance`는 동시에 존재할 수 있는 별도 필드다.
ownerDirection은 decision receipt와 실제 byte를 다시 찾을 수 있는 immutable
sourceRef가 필요하다. tracked file이면 repo-relative path·UTF-8 byte range·full
source SHA를 쓴다. HQ stdin/fd로 받은 bytes는 adapter가 decision과 SHA를
검증한 뒤 child의 ignored local-only detached payload store에 mode-restricted
temp→fsync→rename으로 보관하고 durable lease receipt를 만든다. command는
lease ID·payload SHA·byte length·expiry만 참조하며 command/receipt에는 private
본문을 복사하지 않는다.

lease는 attempt terminal과 bounded retention이 끝날 때까지 resolver로 다시
읽을 수 있어야 한다. retry는 같은 lease를 쓰거나 caller가 동일 SHA bytes를
재전송해 lease를 갱신할 때만 허용한다. lease가 만료·유실됐으면
`source-unavailable`로 fail-closed하고 모델을 재호출하지 않는다. 진짜
transient-only 호출을 별도 허용한다면 `retryPolicy=never`를 강제하고 crash 뒤
자동 재개를 주장하지 않는다.

Agent가 만든 `sub_agent.instruction`은 transcript event와 exact text hash를
가리키는 `taskGuidance.source=model-mediated`다. owner hard direction, BookRule
또는 canon divergence 권위를 얻지 않으며 ownerDirection을 덮어쓰지 않는다.

분량은 언어별 단위를 가진 `targetLength`로만 받는다. 허용 단위는
`ko-chars | zh-chars | words`이며 무단 `wordCount:number` 폴백을 만들지 않는다.

이후 `audit`, `revise`, `resync`,
`hil-apply`, `reference-bind`를 한 개씩 추가한다. capability별 schema는 strict
variant로 닫고 모르는 필드는 거절한다. HQ v1을 즉시 깨지 않고 additive v2
adapter가 v1 WorkOrder를 이 command로 변환한다.

`source + actionSource + authorization.kind`는 discriminated union으로
검증한다.

| action source | 필수 host 증거 |
| --- | --- |
| `confirmed-ui` | persisted action envelope, owner confirmation receipt, exact args SHA |
| `confirmed-cli` | typed command preview, local confirmation receipt, exact args SHA |
| `confirmed-agent-tool` | session request ID, persisted proposal/confirmation, tool args SHA |
| `authenticated-orchestrator` | manifest 허용 capability, strict WorkOrder v2 byte SHA, per-operation owner decision receipt, exact args SHA |

`authenticated-orchestrator`는 버튼 우회용 문자열이 아니다. 위 증거와 child
readback이 모두 일치할 때만 host가 부여한다. mutation command에서
`authorization=null`은 허용하지 않는다. 읽기 전용 capability는 별도 strict
variant로 `authorization.kind=read-only`를 쓴다.

v2에서 mutating capability의 per-operation human decision을 완화하지 않는다.
사전 승인 policy가 필요해지면 별도 manifest version과 ADR로 연다.
`authenticated-orchestrator`는 외부 JSON이 제출하는 신뢰 값이 아니라 adapter가
검증을 모두 마친 뒤 내부에서 파생하는 값이다.

### `ProductionExecutionContext`

Phase 2의 commit correlation에는 먼저 다음 최소 identity만 도입한다.

```ts
interface ProductionAttemptIdentity {
  productionOperationId: string;
  attemptId: string;
}
```

legacy Runner entrypoint는 Book lock 안에서 이를 한 번 만들고, Kernel 경로는
검증된 외부 identity를 주입한다. 각 BaseAgent content call의
`fictionOperationId`는 별도이며 `beginFictionContentOperation()`이 상위
production identity를 correlation input으로 받는다.

```ts
interface ProductionExecutionContext {
  commandId: string;
  commandSha256: string;
  productionOperationId: string;
  attemptId: string;
  intentDigest: string;
  capability: ProductionCapability;
  bookId: string;
  sessionId?: string;
  requestId?: string;
  workOrderId?: string;
  source: "hq-dispatcher" | "studio" | "cli" | "tui" | "agent-tool";
  actionSource?: "confirmed-ui" | "confirmed-cli" | "confirmed-agent-tool" | "authenticated-orchestrator";
  soulBinding?: {
    soulId: string;
    version: string;
    sha256: string;
  };
  activatedSkills: Array<{
    id: string;
    version: string;
    manifestSha256: string;
    resources: Array<{ path: string; sha256: string }>;
  }>;
  startedAt: string;
}
```

Core 내부 전파는 `AsyncLocalStorage` 또는 동등한 operation scope를 사용하되
명시적 함수 인자를 숨겨 권위 검증을 건너뛰는 전역으로 쓰지 않는다. host가
만든 context만 유효하며 모델 출력에서 값을 받아 채우지 않는다.

### `production-run/v1`

```json
{
  "schemaVersion": "production-run/v1",
  "commandId": "uuid",
  "commandSha256": "sha256",
  "productionOperationId": "stable-operation-id",
  "attemptId": "unique-attempt-id",
  "fictionOperationIds": ["fiction-operation-id"],
  "intentDigest": "sha256",
  "bookId": "book-id",
  "capability": "write-next",
  "executionStatus": "succeeded",
  "approvalStatus": "pending",
  "completionHealth": "verified",
  "projectionHealth": "verified",
  "projectionOrigin": "direct",
  "bindings": {
    "sessionId": "book-stable-session",
    "soul": { "id": "soul-id", "version": "v1", "sha256": "sha256" },
    "skills": [],
    "bookRules": {
      "rulesPath": "story/book_rules.md",
      "rulesFileSha256": "sha256",
      "provenancePath": "story/book_rules.provenance.json",
      "provenanceSha256": "sha256",
      "receiptSelfHash": "sha256"
    },
    "arc": {
      "activePointerPath": "story/arcs/active.json",
      "activePointerSha256": "sha256",
      "packetPath": "story/arcs/arc-001.json",
      "packetSha256": "sha256"
    },
    "rail": {
      "kind": "active",
      "path": "story/story_rails.json",
      "sha256": "sha256"
    },
    "contentContract": {
      "id": "fiction-content-neutral-ko/v1",
      "sha256": "sha256"
    },
    "referenceBinding": { "path": "path", "sha256": "sha256" },
    "transformationMap": { "path": "path", "sha256": "sha256" },
    "sourceSelectors": [
      {
        "sourceId": "source-id",
        "startByte": 0,
        "endByte": 1024,
        "sourceSha256": "sha256",
        "sliceSha256": "sha256"
      }
    ]
  },
  "references": {
    "workOrder": { "id": "work-order-id", "sha256": "sha256" }
  },
  "mutationOutcome": {
    "kind": "verified-commit",
    "validator": "write-next/v1",
    "operationManifest": { "path": "path", "sha256": "sha256" },
    "chapterCommitReceipt": { "path": "path", "sha256": "sha256" },
    "chapterArtifact": { "path": "path", "sha256": "sha256" },
    "railTruth": {
      "applicability": "required",
      "receipt": { "path": "path", "sha256": "sha256" }
    }
  },
  "artifacts": [
    { "role": "chapter", "path": "path", "sha256": "sha256" }
  ],
  "modelCalls": [
    {
      "agent": "writer",
      "callIndex": 0,
      "fictionOperationId": "fiction-operation-id",
      "model": "gpt-5.6-sol",
      "reasoning": "high",
      "provider": "provider-id",
      "transport": "codex-or-api-transport",
      "usage": { "inputTokens": 0, "outputTokens": 0 },
      "boundedReminderUsed": false,
      "requestSha256": "sha256",
      "contentInvocationReceiptPath": "path",
      "contentInvocationReceiptSha256": "sha256",
      "outcomeReceiptPath": "path",
      "outcomeReceiptSha256": "sha256"
    }
  ],
  "startedAt": "ISO-8601",
  "terminalAt": "ISO-8601"
}
```

세 축을 섞지 않는다.

- `executionStatus`: `preparing | running | succeeded | failed | cancelled`
- `approvalStatus`: `not-required | pending | held | approved | rejected`
- `completionHealth`: `verified | needs-recovery`
- `projectionHealth`: `verified | stale | invalid`
- `projectionOrigin`: `direct | reconciled`

`needs-review`는 별도 실행 상태가 아니라 `executionStatus=succeeded`와
`approvalStatus=pending`의 UI 파생값이다. 출력 승인이 나중에 바뀌어도 terminal
run을 backpatch하지 않는다. 현재 승인 상태는 immutable HIL decision receipt와
join한 read model이 보여 준다.

Arc binding은 mutable active pointer와 실제 immutable packet의 path·SHA를
분리한다. Rail은 위 `kind=active` 또는
`{ "kind": "none", "reason": "no-active-rail" }` strict variant다. null·빈
hash로 상태를 추측하지 않는다.

`mutationOutcome`은 capability와 commit 결과별 discriminated union이다.

| kind | execution | 필수 증거 |
| --- | --- | --- |
| `verified-commit` | `succeeded` | operation manifest, chapter commit receipt, 실제 Chapter/index/state readback, Rail truth required 또는 explicit not-applicable |
| `no-commit` | `failed|cancelled` | failure/cancel outcome receipt, journal recovery/absence 증거, pre-state와 현재 state hash 동등성; commit receipt와 새 Chapter artifact는 없어야 함 |
| `committed-needs-recovery` | `succeeded` | chapter commit receipt와 실제 canon artifact, expected-vs-observed evidence 상태, missing/error ref, recovery blocker; approval은 `held` |

`write-next/v1`의 정상 성공은 active Rail이 있으면 current chapter truth receipt를
필수로 하고, Rail이 없으면 host가 검증한
`railTruth.applicability=not-applicable` 근거를 남긴다. pre-commit failure에
존재하지 않는 manifest·commit receipt·Chapter를 요구하지 않는다. 다른
capability가 단일 Chapter truth receipt를 억지로 재사용하지 않는다.

현재 operation manifest는 Chapter write 전에 seal되고 journal committed marker는
정상 cleanup되므로 둘만으로는 나중의 artifact가 같은 attempt에서 나온 것인지
증명하기 어렵다. `chapter-commit-receipt/v1`은 productionOperationId,
fictionOperationId 집합, attemptId, Chapter, index/current-state와 관련 truth
artifact SHA, expected-vs-observed Rail truth/evidence 상태를 담아 Book-local
durable journal의 commit set 안에서 원자적으로 설치한다. 이것이 write attempt와 최종 bytes의
보편 상관관계 증거이며 production-run은 이를 참조만 한다.

journal은 mutation 전에 expected evidence 집합을 고정하고 각 evidence write의
성공·오류를 관측한다. commit receipt를 committed marker 직전 commit set의
마지막 파일로 설치하므로 active-Rail truth 실패가 단순 warning으로 사라지지
않고 `committed-needs-recovery`의 observed error가 된다.

canon은 commit됐지만 기대한 truth/evidence write가 실패했다면 재실행하지
않는다. 정확히 기록된 projection에 `executionStatus=succeeded`,
`approvalStatus=held`, `completionHealth=needs-recovery`,
`projectionHealth=verified`를 남기고 사람 적용·다음 mutation을 막는다.
projection 자체의 hash/readback이 틀린 경우에만 `projectionHealth=invalid`다.
복구 후에는 기존 terminal을 덮지 않고 linked
`production-run-repair/v1`을 append하며 read model이 두 영수증을 join한다.

running 동안에는 `production-run-snapshot/v1`을 atomic replace하는 관측
projection만 쓴다. 해당 `mutationOutcome` variant의 validator가 증거의 존재와
금지된 증거의 부재까지 확인한 뒤 immutable `production-run/v1` terminal
파일을 쓴다. `terminalAt`은 snapshot에서만 `null`이고 terminal 파일에서는
필수다. abandoned snapshot은 기존
journal·manifest·artifact를 읽는 reconciler가 실제 execution 결과로 terminal
파일을 만들며 `projectionOrigin=reconciled`를 기록한다. 기존 terminal 파일이
stale·invalid이면 덮어쓰지 않고 fail-closed하여 증거를 보존한다.

`production-run-snapshot/v1`은 terminal schema의 identity·binding 축에 다음
관측 필드만 더한다.

```text
stage
stageStatus
observations[] = { code, severity, evidenceRef }
error = { category, evidenceRef } | null
cancel = { requestedAt, acknowledgedAt, evidenceRef } | null
updatedAt
resumeAuthorityRef = { kind, path, sha256 }
```

`resumeAuthorityRef`는 새 resume cursor가 아니다. capability에 따라 기존
chapter journal, operation manifest 또는 session transcript를 가리키며,
재개 전에 host가 실제 바이트와 현재 Book lock 아래의 복구 가능성을 다시
검증한다. snapshot에 원고·prompt·private source 본문은 넣지 않는다.

child projection은 아직 존재하지 않는 HQ RunReceipt를 나중에 backpatch하지
않는다. child는 WorkOrder ID·hash를 기록하고, HQ RunReceipt가 완료된 child
`production-run/v1`의 path·SHA를 단방향 참조한다. lineage index가 두 ID를
조인한다.

### Book lock과 idempotency

HQ와 InkOS의 lock은 같은 것이 아니다.

- HQ reservation lock은 같은 외부 target에 대한 WorkOrder 중복 dispatch만
  막는다. canon transaction이나 crash recovery를 소유하지 않는다.
- InkOS Book `.write.lock`만 production mutation serializer다.
- lock 순서는 항상 `HQ reservation → InkOS Book lock`이며 역순은 금지한다.
- Kernel은 InkOS 내부에 새 mutex를 중첩하지 않는다. 기존 capability가 Book
  lock을 소유하면 그 scope 안에 execution context와 projection hook를 넣는다.
  lock이 없는 capability만 현재 공용 lock helper를 통해 정확히 한 번 획득한다.

HQ idempotency는 WorkOrder replay를, InkOS operation idempotency는 canon
mutation을 소유한다. `canonical-json/v1`은 UTF-8, 재귀 key 정렬, JSON
number/string canonicalization과 insignificant whitespace 제거를 고정한다.
`intentDigest`는 capability, Book/session/Soul binding, authorization receipt,
typed args와 context refs의 canonical bytes SHA-256이며 requested time과 attempt
identity는 제외한다. `commandSha256`은 전체 canonical command SHA-256이다.

`commandId + intentDigest`는 논리 작업과 재시도 사이에서 안정적이고
`attemptId`는 실제 실행 시도마다 새로 만든다. 동일
`idempotencyKey + intentDigest`의 terminal operation은 재사용하고 같은 key에
다른 digest가 오면 fail-closed한다.

HQ 재시도는 같은 child `commandId`, `productionOperationId`와 `intentDigest`를 전달한다.
stale-running snapshot이 있으면 먼저 child readback으로 reconcile한다. canon
commit 후 terminal projection만 누락된 경우에는 새 모델·PipelineRunner 호출
없이 기존 attempt의 `projectionOrigin=reconciled` terminal 파일만 만든다.

## Soul-as-Skill 고도화

Soul은 Skill과 호환되는 지침·resource package로 저장할 수 있지만 production
identity는 모델이 선택한 `use_skill`이 아니라 host가 Book에 고정한
`BookSoulBinding`이다.

```json
{
  "schemaVersion": "book-soul-binding/v1",
  "bookId": "book-id",
  "soulId": "male-modern-fantasy-ko",
  "version": "v1",
  "manifestSha256": "sha256",
  "resources": [{ "path": "resources/genre.md", "sha256": "sha256" }],
  "sourceRegistryReceiptSha256": "sha256",
  "status": "candidate",
  "boundByDecisionReceipt": "receipt-id",
  "boundAt": "ISO-8601"
}
```

- immutable history는 `story/soul-bindings/vNNNN.json`에 둔다.
- mutable pointer는 현재 binding만 가리킨다.
- persisted session은 `bookId + sessionKind + soulId + soulVersion`에 결속한다.
- Soul 변경은 owner rebind와 새 session을 요구한다.
- production mode→Skill 기본값은 host table이 결정한다.
- capability가 required로 선언한 production Skill이 없거나 hash 검증에 실패하면
  빈 배열로 계속하지 않고 모델 호출 전에 fail-closed한다.
- required production Skill은 trusted builtin namespace와 pinned manifest hash로
  해석한다. project/user owner overlay는 별도 namespace와 낮은 authority layer로
  두며 같은 ID로 required builtin을 shadow하지 못한다.
- owner-added Skill은 병합·중복 제거 후 실제 manifest/resource SHA를 남긴다.
  같은 ID에 다른 hash가 둘 이상이면 last-wins하지 않고 충돌로 거절한다.
- Skill resource는 allowlisted extension·크기 상한·UTF-8 text를 검증하고 NUL,
  symlink, path traversal과 readScope 이탈을 거절한다.
- 모델이 한 turn에서 선택한 `use_skill`은 그 turn 종료와 함께 만료한다.
  host-bound Soul과 required production Skill은 매 operation마다 다시 해석·주입한다.
- Soul/Skill은 hard rule, 수위, mutation 권한, canon 승격을 자기 선언하지 못한다.
- 실제 Writer request에 들어간 Soul·Skill·externalContext의 byte hash를 각각
  기록한다. system prompt에 있다고 가정하지 않는다.

현재 `inkos-long-writing`의 일반적인 절대 복사 회피 문구는 production binding
전에 Firefly 계약과 정렬한다. owner-authorized private reference의 실제 문장,
호흡, 사건 배열과 style example을 분석·입력에서 제거하거나 요약하지 않는다.
raw input 접근 권한과 canon 채택 권한은 분리한다. Book reference binding과
transformation map은 사용할 source·slice·role·event·surface 범위를 선언한다.
결속되지 않은 source 고유명·사실·설정이 Book canon으로 넘어오면 host 정본
오류다. 문장·호흡·사건 배열·signature surface의 겹침은 binding 범위 안에서
HIL 비교 정보이며 자동 penalty·rewrite·reject 근거가 아니다. binding 밖의
source-specific 표현을 사람 채택 없이 hard canon fact로 승격하지 않는다.

Soul 자산 제작의 상세 corpus inventory, survey, deep-read, genre profile,
Review Packet과 승격 조건은 기존
[Hermes 남성향 장르 Soul 원문 학습 계획](./2026-08-27-hermes-male-genre-soul-learning-plan.md)이
계속 소유한다. 이 문서는 그 자산을 실제 production runtime에 안전하게 넣는
실행 기반만 소유한다.

## FTS5/BM25 검색 projection

FTS는 검색 속도와 trace를 위한 삭제 가능한 projection이다. Markdown,
Book/Arc/Rail, BookRules sidecar, reference binding과 private source file은
계속 권위 원본이다.

### 항상 포함할 컨텍스트

다음은 검색 순위와 무관하게 deterministic must-hit set으로 조립한다.

- Book premise와 verified hard BookRules
- current Arc와 A/B Rail
- 현재 Chapter 직전 상태와 필수 character/canon fact
- active Soul binding과 capability production Skill
- owner-selected reference binding과 현재 Chapter용 source selector
- `fiction-content-neutral-ko/v1`

FTS는 나머지 관련 기억·material·supporting reference 후보를 순위화할 뿐이다.

### 인덱스 경계

- 일반 Book DB, private reference DB, user Skill DB를 authority scope별로 분리한다.
- cross-Book 및 cross-owner query는 기본 거절한다.
- private source 본문은 Git tracked DB나 HQ receipt에 넣지 않는다.
- receipt에는 source ID, UTF-8 byte range, 원문 SHA, slice SHA와 index version만
  남긴다.
- private DB는 local-only 경로, owner-only file mode, bounded retention과
  WAL/checkpoint cleanup 정책을 config와 receipt에 고정한다.
- selector 좌표는 JavaScript character offset이 아니라 `utf8-byte`로 고정한다.
- 현재 reference pack v1의 JavaScript character offset을 같은 숫자의 byte
  offset으로 재해석하지 않는다. `coordinateSystem`과 source encoding을 가진
  additive v2를 만들고 v1/v2 dual-reader와 explicit converter receipt로 이행한다.
- symlink·realpath·readScope·full source SHA를 기존 private-input 규칙대로
  검증한다.
- index는 원본 hash가 바뀌면 stale로 처리하고 전부 재생성할 수 있어야 한다.

### 한국어 승격 방식

처음부터 tokenizer를 고정하지 않는다. legacy heuristic과 FTS5 `unicode61`,
host-normalized term/bigram 후보를 같은 고정 corpus에서 dual-run한다. Writer에는
legacy 결과만 전달하고 FTS 결과는 shadow receipt로 비교한다. 형태소 분석을
위한 별도 LLM call이나 semantic reranker는 v1 범위에 넣지 않는다.

각 shadow 후보는 `tokenizerId/tokenizerVersion`, locale, normalization version,
Node·ICU version, SQLite/FTS version과 index schema version을 retrieval trace에
고정한다. 승격할 한 후보를 선택한 뒤에는 이 환경 digest가 다른 결과를 같은
indexVersion으로 보고하지 못하게 한다.

FTS 승격 조건은 다음과 같다.

- deterministic must-hit context assembly coverage 100% — FTS와 독립 검증
- optional retrieval labeled recall@K와 ranking threshold — Phase 0 golden set에서
  수치 고정, legacy보다 낮아지지 않음
- cross-Book·cross-scope leakage 0건
- source ID·UTF-8 byte selector·SHA 일치 100%
- 한국어 띄어쓰기·조사·고유명·부정 지시 fixture 통과
- 동일 원본과 index version에서 deterministic ranking
- DB 삭제 후 rebuild 결과 동등
- legacy 대비 누락·token·latency 회귀가 승인 범위 안

### Node 22

현재 host는 Node 22이지만 package 계약은 `node >=20`과 SQLite fallback을
유지한다. upstream local-search의 static `node:sqlite` import를 먼저 복사하면
Node 20 CI가 module load 시점에 깨질 수 있다. dual-shadow 동안에는
`node:sqlite`를 dynamic import하고 runtime capability probe가 실패하면 legacy
retrieval로 fail closed한다. Node 20 CI는 fallback을, Node 22 CI는 FTS shadow를
각각 검증한다.

FTS를 필수 production path로 승격할 때만 다음을 하나의 독립 선행 commit으로
바꾼 뒤 static import 전환 여부를 결정한다.

- root/package engines와 runtime doctor
- CI Node 22/24 matrix
- package publish manifest와 설치 smoke test
- fallback 제거 여부
- macOS 배포 환경 readback

static import를 선택하면 순서는 반드시 `Node 22 contract → FTS shadow`다.
Node 숫자만 아무 기능 없이 먼저 올리거나 graph node와 혼동하지 않는다.

## Pi worker 선택 이식

Pi worker는 ProductionKernel 자체가 아니다. 기존 `BaseAgent.runChat()` 안쪽의
governed lifecycle adapter다.

현재 공통 `LLMResponse`와 Codex transport는 text 중심이며 Codex 경로는 native
tool result를 지원하지 않는다. 따라서 이식은 `A1 text lifecycle`과 `A2 typed
result`로 분리한다. A1은 현 provider/Codex 전부에서 취소·관측·receipt만
통일한다. A2는 native tool 지원 provider allowlist에서 시작하고, Codex는
provider interface와 tool-result parity가 별도 구현·검증되기 전까지 제외한다.

호출 순서는 고정한다.

1. host가 capability, Book, Soul과 활성 Skill을 확정한다.
2. verified BookRules·Arc/Rail·reference context를 조립한다.
3. 최종 logical payload에 content-neutral contract를 정확히 한 번 적용하고
   byte hash를 만든다.
4. 현재 provider/Codex transport를 backend로 Pi worker를 실행한다.
5. structured worker는 host가 terminal result tool call 수를 세어 정확히
   1개일 때만 채택한다. 0개나 2개 이상은 실패다.
6. prose worker는 `tools=[]`인 별도 path를 사용하며 억지로 typed result
   tool을 요구하지 않는다.
7. 기존 invocation outcome과 production-run correlation을 기록한다.

보존할 동작은 cancellation, provider refusal, token-length truncation,
content-filter, malformed tool use, usage, retry, streaming과 Codex tool
authorization이다. 모델이 성공이라고 쓴 텍스트는 완료 증거가 아니다.

Architect·Planner·Auditor처럼 structured result가 큰 worker부터 하나씩
feature flag 뒤에 옮긴다. Writer와 Reviser text path는 마지막이다. 초기
canary에서는 기존 대비 사전 planning model round를 추가하지 않는다.
upstream의 “result tool을 호출하라” reminder는 host 보장이 아니므로 그대로
믿지 않는다. structured path에서만 최대 1회의 bounded reminder를 허용하고,
추가 call·token·latency를 receipt와 비용 gate에 기록한다. Writer prose path는
reminder를 사용하지 않는다.

## HIL·reference 내구성 보강

### HIL compound operation

Storyyard는 계속 immutable review packet과 pending decision만 만든다.
InkOS에 `hil-apply` typed capability를 추가해 다음을 하나의 Book lock과
operation receipt 아래에서 수행한다.

```text
decision receipt 검증
  -> candidate 원자 적용
  -> applied-needs-resync
  -> chapter truth resync
  -> applied-needs-audit
  -> host deterministic checks + LLM creative audit
  -> ready 또는 needs-attention 판정
```

decision·candidate·Book preflight가 실패하면 적용 전 중단한다. owner가 승인한
원고가 원자 적용된 뒤에는 resync나 LLM audit 실패를 이유로 그 원고를
되돌리지 않는다. `applied-needs-resync | applied-needs-audit |
applied-needs-attention`의 forward recovery 상태를 남기고 continuation과
`ready` 표시는 막는다. UI는 “원고 적용됨”과 “제작 계속 가능”을 한 성공으로
축약하지 않는다.

### reference bind

reference pack은 project `.inkos`와 Book root를 함께 건드리므로 하나의
Book-local journal로 cross-root atomicity를 가장하지 않는다.

1. pack bytes를 project `.inkos`의 content-addressed 경로에 temp→fsync→rename으로
   원자 설치하고 full manifest SHA를 검증한다. 이 단계는 Book canon을 바꾸지
   않는다.
2. Book-local durable journal 안에서 installed pack SHA를 가리키는 binding,
   transformation map과 Rail activation을 한 commit set으로 설치한다.
3. activation 실패 시 unreferenced pack은 무해하게 남기고 별도 refcount/readback
   뒤에만 GC한다. 불완전 Book pointer는 남기지 않는다.

crash injection 후 Book은 이전 activation 또는 새 activation 둘 중 하나여야
한다. `supportingReferences`는 runtime 소비와 receipt가 구현되기 전까지
`planned`만 허용한다.

## HQ·Hermes·표면 수렴

HQ Dispatcher는 계속 manifest에 등록된 child capability만 호출하고 작품을
직접 쓰지 않는다. additive `WorkOrder/RunReceipt v2`는 다음만 추가한다.

- `write-next`, `agent-operate`와 이후 typed capability
- Hermes profile, effective model, reasoning
- BookSoulBinding과 control/external/reference context SHA
- child `production-run/v1` path와 SHA
- capability별 strict output variant
- 실제 호출 agent 전부의 model·reasoning·count readback

Hermes는 장르 Soul의 host profile이자 조율자일 수 있지만 canon이나 실행
정본은 아니다. 같은 InkOS repo에서도 Book ID, session binding, Soul version,
reference binding이 다르면 현대판타지·판타지·무협 세 실행을 격리할 수 있다.

Studio, CLI, TUI와 Agent tool은 같은 Core action policy를 사용한다. upstream은
확인된 structured action을 중심으로 두되 bounded `write-next` quick-action
예외도 갖고 있다. 그 surface-specific predicate를 그대로 가져오지 않는다.
사람 표면은 확인된 typed action을, HQ/Hermes는 검증된
`authenticated-orchestrator` action을 사용한다.

## 구현 단계와 commit 경계

번호가 붙은 단계는 직전 단계가 green일 때만 시작한다. Optional Track A/B는
Phase 5 뒤 독립 실행할 수 있고 Phase 6·7의 선행조건이 아니다. InkOS child와
HQ parent는 독립 Git root이므로 절대 같은 commit으로 묶지 않는다.

### Phase 0 — 기준선 고정

목적: 선택 이식이 현재 강점을 삭제하지 못하게 한다.

- 현재 Book/Arc/Rail, BookRules provenance, reference/HIL, 내용중립, chapter
  journal과 truth receipt characterization fixture 고정
- upstream prompt·Skill·LengthNormalizer 변화의 비채택 fixture 추가
- HQ↔InkOS 기존 WorkOrder/RunReceipt v1 회귀 고정
- capability별 현재 completion evidence와 Rail 유무별 truth receipt applicability
  characterization
- persisted action/session metadata 전이와 batch write 기준선 고정
- current full test, typecheck, build, semantic audit와 package manifest 기준선 기록

완료선: 코드 동작 변화 없이 모든 기준선 green.

### Phase 1 — 두 정확성 결손 수정

1. confirmed action payload에 typed `ownerDirection` exact selector·receipt를
   추가하고 transient input용 detached payload lease를 구현한다.
   `sub_agent.instruction`은 단일·batch Writer 최종 context에
   `model-mediated` provenance와 exact byte SHA로 전달하되 owner authority로
   승격하지 않는다.
2. strict transcript reader가 `session_created`와 모든
   `session_metadata_updated`를 읽어 허용된 null→Book 전이와 불법 Book↔Book,
   sessionKind drift를 구분한다. effective binding을 cache restore와 모델 호출
   전에 검증한다. Soul 도입 후 binding tuple 전체로 확장한다.

완료선: direct와 Agent 경로에서 owner direction과 model-mediated instruction이
권위·SHA별로 분리되고 session migration fixture가 통과한다. HQ parity는 strict
WorkOrder v2가 생기는 Phase 5 완료선에서 검증한다.

### Phase 2 — 기존 mutation 내구성 선행 보강 (완료: `8a923e7e`)

새 선택 기능보다 현재 쓰기 경로의 partial-state 위험을 먼저 닫는다.

- 최소 `ProductionAttemptIdentity`를 도입하고 legacy Runner가 Book lock 안에서
  한 번만 생성
- `beginFictionContentOperation()`에 상위 production correlation을 전달하되
  production·fiction operation ID는 구분
- `hil-apply`를 기존 InkOS state service의 typed compound operation으로 추가
- Chapter journal commit set에 universal `chapter-commit-receipt/v1` 추가
- reference-bind를 content-addressed project pack install + Book-local journaled
  activation으로 분리
- fault injection과 restart recovery
- supporting reference는 소비·receipt 구현 전 계속 fail-closed `planned`
- Storyyard packet/decision 하위 호환

완료선: 모든 fault injection에서 완전한 이전/새 상태 또는 명시적 recovery
state만 남고 UI false-ready가 0. commit receipt와 terminal readback은 같은
InkOS Book lock 안에서 끝나며 모든 child fiction operation과 attempt가 일치한다.

### Phase 3 — observe-only Kernel과 run projection (완료: `d48fde2a`)

- `ProductionExecutionContext`
- `production-command/v1`
- `production-run-snapshot/v1`
- `production-run/v1`
- `write-next` adapter 하나
- terminal projection reconciler
- free-text는 proposal만 만들고 Core authorization predicate를 통과한 typed
  action만 ProductionCommand를 만들도록 새 gateway authority 고정
- `/confirm` 또는 동등 실행 직전에 persisted payload를 strict schema로 다시
  parse하고 current Book/session/Soul binding, decision receipt와 args SHA freshness
  재검증
- feature flag `kernel=off|observe|enforce`

`observe`에서는 기존 PipelineRunner 결과와 canon byte가 baseline과 같아야
한다. 새 projection 외의 추가 write가 있으면 승격하지 않는다.

완료선: 성공·실패·취소·crash-after-commit 모두 false-complete와 중복 실행 0.

완료 판정: Core/Studio/CLI 3,355 tests, 실제 child `SIGKILL`, build·typecheck와
projection/canon parity를 통과했다. 감리 중 receipt body 중복과 premature Skill
activation을 제거한 뒤 잔여 P0/P1 0으로 닫았다.

### Phase 4 — production Skill과 BookSoulBinding

- capability→default Skill host table
- 현 last-write-wins registry와 production trusted namespace 분리
- immutable Soul binding history와 active pointer
- session binding 확장
- 실제 manifest/resource/input byte hash receipt
- required Skill missing·disabled·hash conflict fail-closed
- resource symlink/path/size/NUL/extension과 turn-expiry fixture
- current long-writing Skill의 Firefly reference 정책 정렬
- `neutral|candidate|promoted` Book binding lifecycle

이 단계는 빈 candidate Soul로 runtime plumbing만 검증할 수 있다. corpus 학습
완료나 Soul 상업 품질 승격을 주장하지 않는다.

완료 판정: Core/Studio/CLI 3,363 tests, build·typecheck, semantic audit, publish
manifest와 diff check를 통과했다. 감리 중 decision receipt overwrite 가능성을
막고 Skill identity drift를 보강한 뒤 잔여 P0/P1 0으로 닫았다.

### Phase 5 — HQ v2와 실행 표면 수렴

- capability별 strict WorkOrder/RunReceipt v2
- action-source별 discriminated authorization
- effective Hermes/InkOS model·reasoning readback
- Studio/CLI/TUI/Agent tool을 같은 ProductionCommand gateway에 연결
- legacy v1 adapter와 dual-read/write 호환 기간
- pending confirmation을 재사용할 때 현재 binding·args가 바뀌면 실행 전 거절

완료선: HQ는 receipt와 hash만 집계하며 Book 파일 직접 write 0.

완료 판정: Core/Studio/CLI 3,375 tests와 HQ 30 tests, typecheck, build,
semantic-pattern audit, publish manifest, v2 JSON Schema, actual child evidence tamper
fixture와 diff check를 통과했다. 감리 중 evidence 실제 byte 재검증, filesystem 접근
전 Book ID 차단, effective Writer model readback과 미구현 v2 input fail-closed를
보강한 뒤 잔여 P0/P1 0으로 닫았다. 기본값은 계속 `kernel=off`,
`surfaceGateway=legacy`이며 enforce canary는 실행하지 않았다.

상세 검증: InkOS
`docs/2026-08-28-production-kernel-phase5-hq-v2-surface-gateway.md`

### Optional Track A — Pi worker parity

Kernel·Soul·HQ 경계와 독립적인 선택 branch다. Soul promotion의 전제조건이
아니다.

- current provider/Codex transport 아래 worker adapter 추가
- A1 text lifecycle을 provider/Codex에 먼저 적용
- A2 structured worker는 native-tool provider allowlist에서 한 개씩 전환
- structured terminal tool count host 검증
- prose `tools=[]` path 분리
- abort/refusal/truncation/tool/usage/receipt parity
- `pi-worker=off|candidate|on`과 agent/capability/provider allowlist digest
- Writer·Reviser는 parity가 입증된 뒤 마지막 전환
- Codex typed result는 provider interface 확장과 별도 matrix 뒤에만 허용

완료선: 동일 fixture에서 canon과 host evidence invariant가 유지된다.
Writer가 아직 legacy인 동안 write-next 모델 호출 수는 baseline보다 늘지 않고,
structured reminder retry는 별도 비용으로 측정된다.

### Optional Track B — FTS dual-shadow와 Node 정책

Pi와 독립적인 선택 branch다. Soul promotion 동안 Writer prompt를 바꾸지 않는다.

- authority scope별 rebuildable index
- Korean fixed corpus와 retrieval trace
- `retrieval=legacy|dual-shadow|fts`
- Node 20 유지 중에는 dynamic import와 capability probe
- static import 선택 시 Node 22 contract를 FTS 코드보다 먼저 독립 변경

완료선: must-hit·leakage·selector·rebuild·determinism gate 모두 green.
FTS infrastructure canary는 `kernel=enforce`, neutral binding, Pi off를 고정하고
`retrieval=legacy → dual-shadow` 한 변수만 바꾼다. 실제 `fts` reader 승격도
별도 canary로 분리한다.

### Phase 6 — neutral runtime canary

Soul 효과를 보기 전에 새 실행 기반만 따로 검증한다.

1. `kernel=observe`, neutral binding, Pi off, `retrieval=legacy`, FTS off
2. 같은 fixture에서 `kernel=enforce`, 나머지 설정 동일
3. direct/Agent/HQ ingress의 command·attempt·receipt 동등성 확인

canon byte, 모델 호출 수와 HIL 결과가 baseline을 벗어나면 Soul canary로
넘어가지 않는다. Optional Pi/FTS의 실제 prompt 전환은 이 canary와 별도다.

완료 판정: strict Soul `null`, Pi off, retrieval legacy, FTS off와 manual review를
고정한 동일 fixture에서 legacy baseline, observe-direct, enforce-direct,
enforce-Agent, enforce-HQ 다섯 lane을 실행했다. canon 파일 3종 raw bytes, Writer
호출 1회와 `ready-for-review/pending` projection이 모두 같았다. v2 command,
execution context, attempt와 verified commit receipt correlation도 통과했고 canary를
2회 연속 재실행했다. 기본값은 계속 off/legacy다.

상세 검증: InkOS
`docs/2026-08-28-production-kernel-phase6-neutral-runtime-canary.md`

### Phase 7 — Soul 자산 트랙과 promotion canary 결합

별도 Soul 계획에서 source registry, manager-led deep-read, genre profile,
Review Packet이 준비된 뒤에만 runtime track과 결합한다.

- 먼저 격리 Book 1개·1~3장 Arc·concurrency 1의 path canary
- 그 뒤 Soul 계획의 동일 시작 상태 promotion pair 3개
- Soul lane과 neutral lane 모두 `kernel=enforce`
- 양 lane 모두 Pi worker `off` 또는 같은 고정 version
- 양 lane retrieval은 `legacy`, FTS는 off
- 모든 runtime flag·schema·model·reasoning을 per-run receipt에 고정
- Storyyard blind review와 사람 결정

Soul promotion 실험에서는 runtime 기능을 동시에 바꾸지 않는다. Pi와 FTS의
효과는 별도 infrastructure canary에서 한 변수씩 본다. 최소 두 번의 연속
runtime canary와 Soul 문서의 paired commercial gate가 유지된 뒤 각각을
독립 승격한다.

현재 판정(2026-08-28): source inventory/registry, manager selection, promotion validator, 세
genre profile·Soul, 세 Hermes candidate profile, Review Packet/Decision v2,
Storyyard blind HIL, private source resolver와 HQ gateway는 구현·푸시됐다.
story/style provenance converter와 실제 source pack canary, transport canary도
통과했다. registry의 `eligibleForSoulInput`은 장르별 3개, 총 9개다. 그러나
장르별 survey는 완료됐지만 strict full-work deep-read와 manager QA가 없다.
따라서 위 path canary와 세 pair promotion canary는 아직 실행하지 않는다. transport canary를 창작 품질이나
Soul 승격 증거로 재분류해서는 안 된다.

### Phase 8 — 읽기 전용 lineage

`write`, `review`, `revise` 세 capability가 안정된 뒤 receipt에서 다음 edge만
투영한다.

```text
consumes | produces | reviews | approves | supersedes
```

lineage는 삭제·재생성 가능하고 source/Soul 변화만으로 승인 원고를 자동
폐기·재작성하지 않는다. HQ dashboard를 새로 만드는 것이 아니라 기존 상태
집계와 디버깅을 돕는 read model이다.

## 예상 파일 범위

정확한 파일명은 Phase 0 조사 후 확정하되 소유권은 다음처럼 제한한다.

### InkOS child

신규 후보:

- `packages/core/src/production/execution-context.ts`
- `packages/core/src/production/production-kernel.ts`
- `packages/core/src/production/run-projection.ts`
- `packages/core/src/agent/worker-agent.ts`
- `packages/core/src/agent/pi-stream.ts`
- `packages/core/src/skills/production-bindings.ts`
- `packages/core/src/retrieval/local-search.ts`
- production command/run schema와 tests

수정 후보:

- `packages/core/src/agents/base.ts`
- `packages/core/src/agent/agent-session.ts`
- `packages/core/src/agent/agent-tools.ts`
- `packages/core/src/agent/skill-tool.ts`
- `packages/core/src/interaction/action-envelope.ts`
- `packages/core/src/interaction/book-session-store.ts`
- `packages/core/src/interaction/session-transcript.ts`
- `packages/core/src/interaction/session-transcript-*.ts`
- `packages/core/src/pipeline/runner.ts`
- `packages/core/src/production/fiction-content-contract.ts`
- `packages/core/src/llm/agent-trajectory.ts`
- `packages/core/src/llm/provider.ts`
- `packages/core/src/llm/codex-cli.ts`
- `packages/core/src/state/chapter-persistence-journal.ts`
- `packages/core/src/state/chapter-truth-receipt.ts`
- `packages/core/src/state/manager.ts`
- `packages/core/src/state/chapter-approval.ts`
- `packages/core/src/models/chapter.ts`
- `packages/core/src/reference/hil-store.ts`
- `packages/core/src/reference/store.ts`
- `packages/core/src/reference/schema.ts`
- `packages/core/src/reference/firefly-preflight.ts`
- `packages/core/src/utils/memory-retrieval.ts`
- `packages/core/src/materials/retrieve.ts`
- `packages/core/src/skills/types.ts`
- `packages/core/src/skills/registry.ts`
- `packages/core/src/skills/builtin-loader.ts`
- `packages/core/src/skills/external-loader.ts`
- CLI·Studio의 command adapter

Arc/Rail schema, BookRules 권위 모델, chapter journal 내부와 content-neutral
판단 로직은 correlation hook 외에는 건드리지 않는다.

### HQ parent

- `config/edge-repos.json` capability 확장
- `scripts/dispatch-lib.mjs` additive v2 adapter
- `scripts/edge-lib.mjs` manifest/approval validation
- WorkOrder/RunReceipt v2 strict schema와 tests
- `tests/dispatch.test.mjs`, `tests/manifest.test.mjs`
- 이 문서와 Dispatcher 계약 연결

### Reference Lab

- private source registry와 tracked receipt
- corpus inventory, survey, deep-read와 genre Soul artifact
- leak scanner, manager QA와 promotion receipt

### Storyyard

- 기존 review packet·decision contract 소비
- 새 canon writer 없음
- `hil-apply` 결과의 ready/recovery 상태 표시

## feature flag와 rollback

| 기능 | 상태 | rollback |
| --- | --- | --- |
| Kernel | `off|observe|enforce` | legacy route, projection만 보존 |
| Pi worker | `off|candidate|on` + allowlist digest | 지정 agent/capability/provider만 기존 transport로 복귀 |
| Retrieval | `legacy|dual-shadow|fts` | reader를 legacy로 먼저 전환하고 안전 확인 뒤 projection 격리·재생성 |
| HQ contract | `v1|dual|v2` | dual reader를 유지한 채 새 dispatch만 v1로 전환 |
| Surface gateway | `legacy|dual|kernel` | single canon call을 유지하고 새 command ingress만 이전 단계로 전환 |
| HIL apply | `disabled|journaled` | journaled 경로가 불안정하면 capability를 fail-closed 비활성화 |
| Reference bind | `disabled|journaled` | journaled 경로가 불안정하면 capability를 fail-closed 비활성화 |
| Lineage | `off|observe|warn` | index 비활성화 후 receipt에서 재생성 |

`neutral|candidate|promoted`는 feature flag가 아니라 BookSoulBinding lifecycle다.
Soul rollback은 active pointer를 과거로 조용히 되감지 않는다. owner decision으로
이전 Soul content를 가리키는 새 append-only binding version을 만들고 새
session을 시작한다.

모든 flag, schema version, config SHA와 Soul binding은 InkOS Book lock 진입
시점에 해당 attempt의 `ProductionExecutionContext`로 고정하고 실행 중 다시
읽지 않는다. rollback은 새 attempt에만 적용한다. in-flight attempt는 고정
설정으로 끝내거나 명시적으로 cancel한다.

HQ·surface `dual`은 두 production write를 뜻하지 않는다. canon mutation은
항상 한 번만 호출하고 v1/v2 receipt reader·projection만 호환한다. 새 artifact를
이전 reader가 이해하지 못하면 silent legacy fallback 대신 mutation을
fail-closed한다. Retrieval rollback도 active run이 FTS reader를 더는 사용하지
않는다는 readback 뒤에만 DB를 격리하거나 재생성한다.

canonical write 실패는 기존 Book lock과 journal이 복구한다. canon commit 뒤
projection만 실패하면 모델을 재호출하지 않고 reconciler만 실행한다. rollback을
위해 Book canon을 Git reset, stash 또는 overwrite하지 않는다.

## 검증 게이트

### 정확성

- 동일 session·effective Book·kind·Soul은 restart 후 복원
- 합법적 null→Book metadata 전이는 허용하고 다른 Book·kind·Soul drift는 모델
  호출 전에 거절
- malformed/duplicate transcript header와 불법 Book A→B 전이 fail-closed
- 단일·batch Writer가 owner-confirmed direction과 model-mediated instruction을
  서로 다른 provenance·SHA로 받음
- `write-next/v1`의 `chapterCount != 1`은 실행 전 거절
- hard contradiction 0, active Arc/Rail binding 일치

### 권위·보안

- Skill/Soul이 mutation 또는 hard BookRule 권위를 만들지 못함
- required Skill 누락·hash conflict, resource symlink/path traversal/size/NUL/
  extension 위반 fail-closed, turn-local `use_skill` expiry
- Skill read-after-hash 변조와 동일 ID shadow 공격 fail-closed
- stale `/confirm` payload, Book/session/Soul binding 또는 args hash 불일치는
  ProductionCommand 생성 전 거절
- private raw source가 tracked HQ/InkOS/Storyyard artifact와 log에 없음
- detached owner-direction lease의 byte/SHA/expiry/retry readback과 terminal 후
  retention cleanup, missing lease fail-closed
- cross-Book·cross-scope retrieval 0
- HQ/Storyyard가 InkOS canon을 직접 write한 횟수 0

### 실행·복구

- terminal run은 capability별 completion validator와 실제 artifact readback 뒤에만 생성
- `verified-commit|no-commit|committed-needs-recovery` 각 variant의 필수·금지
  증거 schema fixture
- no-Rail `write-next`는 explicit not-applicable evidence, active Rail은 current truth
  receipt 필수
- canon commit 뒤 evidence 누락은 `succeeded+held+needs-recovery`이며 projection
  자체는 verified다. 모델 재호출과
  다음 mutation 0, repair receipt로만 복구
- cancel/refusal/truncation/malformed tool은 fail-closed
- same idempotency key와 다른 intent digest 조합은 모델 호출 전 거절
- crash-before-commit, crash-after-commit-before-projection, projection corruption
  모두 중복 원고 생성과 false-complete 0
- HIL·reference fault injection에서 partial ready 0
- owner-approved candidate 적용 뒤 resync/audit 실패는 원고 rollback 없이 정확한
  forward recovery state, continuation 0
- reference pack install crash와 Book activation crash를 분리 주입하고 dangling
  Book pointer 0
- in-process 예외뿐 아니라 실제 child process kill 기반 journal/reference/HIL
  restart recovery fixture

### 비용·품질

- recorded provider·fixed clock·fixed UUID fixture에서 observe mode canon byte는
  legacy baseline과 동등
- live canary는 prose byte equality가 아니라 authority, receipt, artifact SHA
  관계와 품질 HIL을 비교
- 초기 write-next 모델 호출 수 증가 0
- FTS shadow는 Writer prompt를 바꾸지 않음
- deterministic must-hit coverage 100%와 optional retrieval recall/ranking을
  별도 측정하고 tokenizer/locale/ICU/SQLite/index digest를 고정
- commercial score에 원작 거리·표면 중복 penalty를 자동 합산하지 않음
- 도파민·상업성, 감정적 정합성과 선택한 문체 실행은 사람 HIL에서 비교
- Pi provider/Codex matrix와 capability별 최대 모델 호출 수 gate

### repository closeout

- Core/CLI/Studio focused test와 full test
- typecheck, build, semantic audit, publish manifest 검증
- `git diff --check`
- InkOS child 독립 commit·push·clean readback
- HQ parent 독립 commit·push·clean readback
- Reference Lab과 Storyyard를 수정했다면 각각 독립 검증·commit·push

## graph runtime 재검토 조건

지금은 도입하지 않는다. 다음 중 두 가지 이상이 실제 production에서 반복되거나,
두 번째 독립 production child가 등장할 때만 새 ADR을 연다.

1. 독립 작업의 실질적 fan-out/fan-in
2. process restart를 넘는 임의 중간 단계 재개
3. 장시간 timer, retry, compensation을 host가 지속 관리해야 함
4. 서로 독립적인 다중 승인 분기
5. Book journal 바깥의 cross-repo saga가 반복적으로 부분 실패함

그때도 graph는 HQ에서 child capability와 receipt를 조율하는 계층이어야 한다.
Book, Arc, Rail, Chapter 또는 canon을 소유하지 않는다. 그 전까지 필요한
“그래프 엔지니어링”은 `production-run`과 artifact-lineage read model로 충분하다.

## Sol Max 실행 지침

다음 구현 세션은 아래 계약으로 시작한다.

> `gpt-5.6-sol / max`로 이 문서의 다음 미완료 Phase 하나만 구현한다.
> 시작 전에 HQ와 모든 영향 child의 `AGENTS.md`, Git root, branch, status,
> HEAD와 관련 정본을 다시 읽는다. dirty child를 reset, stash, overwrite 또는
> auto-commit하지 않는다. upstream 대형 commit은 cherry-pick하지 않는다.
> 현재 PipelineRunner, Book/Arc/Rail, BookRules provenance, content-neutral
> contract, reference/HIL, chapter journal과 truth receipt를 보존한다. 단계별
> feature flag와 rollback을 구현하고 해당 gate가 모두 green일 때만 그 Git
> root를 명시적으로 stage·commit·push한다. 실패한 gate가 있으면 다음 Phase로
> 넘어가지 않는다. 일반 graph runtime은 구현하지 않는다.

## 이번 계획의 완료선

- upstream 최신 master와 현 fork의 의미 차이를 고정 SHA로 벤치마크했다.
- 전체 병합, Pi-first, graph-first 반론 뒤 같은 선택 이식 결론이 두 번 연속
  유지됐다.
- 기존 Soul 문서와 이 문서의 정본 소유 범위를 분리했다.
- 구현 단계, contract, file boundary, feature flag, rollback, test gate와
  Sol Max handoff를 명시했다.
- 계획 작성 단계에서는 production code, dependency와 manifest를 변경하지
  않았다. 이후 Phase 0 기준선 변경과 독립 commit·push 결과는 위 구현 상태에
  별도 기록했다.
