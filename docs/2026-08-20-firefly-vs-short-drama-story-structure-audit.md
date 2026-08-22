# Firefly Studio × short-drama-story-structure 비교 감리

- 작성일: 2026-08-20
- 성격: 정적 조사·설계 감리. 구현, 외부 저장소 write, issue, PR, push 없음
- Firefly 기준: 부모 `380c59e`, InkOS `c669d5f2`, Reference Lab `9e10a3f`
- 비교 저장소: [`Kidaristudio-AI-Content-Planning-Team/short-drama-story-structure`](https://github.com/Kidaristudio-AI-Content-Planning-Team/short-drama-story-structure) `d591e3d`

## 결론

Firefly의 방향을 바꿀 이유는 없다. 두 시스템은 같은 InkOS 계보의 작업 방식을 일부 공유하더라도 제품 목적과 정본이 다르다.

- Firefly Studio: 오리지널 웹소설의 기획 → 자연 NarrativeArc → 1~3화 제작 패킷 → InkOS 집필·감리·연속 집행
- 비교 저장소: 보유한 원문 전문 → 원작 구조 보존 → M:N 숏드라마 각색 → 대본 근거·상태 검증

비교 저장소를 Firefly 하위 레포로 넣거나 코드를 가져오는 안은 권하지 않는다. 대신 아래 세 가지 설계 원리는 Firefly에 실익이 있다.

1. **Gold·레퍼런스가 어느 승인본에서 왔는지 해시로 결속한다.**
2. **자연 NarrativeArc와 InkOS의 1~3화 ArcPacket 사이에 기계가 검증할 수 있는 배정층을 둔다.**
3. **기획서·참고자료·Rail·Arc·회차가 현재 서로 맞는지 한 번에 읽는 read-only baseline을 둔다.**

이 셋은 새 창작 이론이 아니다. 현재 Firefly가 이미 문서로 정한 `Series Contract → 자연 NarrativeArc → Chapter Packet → 지급 영수증`을 실제 InkOS 정본과 끊기지 않게 만드는 보강이다.

## 1. 조사 경계와 사실

### 외부 저장소 접근

- private 저장소
- default branch: `main`
- 확인 커밋: `d591e3d chore: exclude external reference materials`
- GitHub `viewerPermission`: `READ`
- GitHub `licenseInfo`: `null`
- 현재 트리에서 LICENSE, CI workflow, Python 패키징·개발 의존성 설정을 찾지 못함
- 현재 트리에서 `InkOS`, `Narcooo`, TypeScript·pnpm 직접 의존 또는 연동 코드를 찾지 못함
- authenticated `gh`로만 읽었다. 비로그인 웹 요청은 private 저장소라 404였다.

GitHub의 공식 역할표에서 Read는 pull·열람·자기 fork PR은 가능하지만 원 저장소 push는 불가능하다. 현재 권한과 사용자의 `push할 생각 없음`은 일치한다. [GitHub repository roles](https://docs.github.com/en/organizations/managing-user-access-to-your-organizations-repositories/managing-repository-roles/repository-roles-for-an-organization)

따라서 여기서 `둘 다 InkOS 기반`은 **현재 코드 의존성이 같다**는 뜻보다는, 에이전트 기반 창작 작업을 계약·상태·검증으로 다루는 계보가 비슷하다는 뜻으로 해석한다.

### 외부 저장소 검증

```text
python3 -m pytest 스토리구조/tests -q -rs
232 passed, 5 skipped
```

- PDF 관련 4개는 로컬에 `pypdf`가 없어 skip
- 구형 DOC Word COM 1개는 macOS라 skip
- `python3 -m compileall -q 스토리구조`: PASS
- `git diff --check`: PASS

코드 규모는 구현 Python 약 11,338줄, 테스트 약 6,310줄이다. 테스트 수만으로 제품 완성도를 비교하지는 않는다.

### 현재 외부 구현의 정확한 위치

외부 저장소는 현 시점에 대본 자동 생성기라기보다 **결정론적 원문·각색·대본 검증 프레임**이다.

구현됨:

- TXT·MD·DOCX·PDF·구형 DOC 수집과 source ledger
- 원문 coverage와 source mapping
- 사건 후보·원작 구조·M:N 각색 배정 검증
- 상태 원장과 대본 manifest 검증
- 상류 변경의 stale 전파
- 현재 상태 baseline snapshot·검증·사람용 렌더

미구현이라고 저장소 스스로 명시한 것:

- 사건·사건 묶음 내용 자동 확정
- 각색 판단 자동 생성
- 상태 내용 자동 생성
- 대본 자동 집필·저장
- episode blueprint와 화별 work packet
- 체크포인트 자동 생성·재개

즉 외부 저장소의 강점은 `무엇을 쓸 것인가`보다 `무엇을 근거로 썼고, 빠진 것이 없고, 승인 뒤 바뀌지 않았는가`에 있다.

## 2. 제품 비교

| 축 | Firefly Studio | short-drama-story-structure |
| --- | --- | --- |
| 목적 | 신규 오리지널 웹소설 창작·연재 | 기존 IP의 숏드라마 각색·대본 검증 |
| 최상위 권위 | 사용자 의도·작품 규칙·현재 정본 | 원문 전문·승인된 원작 mapping |
| 구조 단위 | Series / 자연 NarrativeArc / A·B Rail / 1~3화 ArcPacket / Chapter | source / event / event group / rhythm beat / M:N adaptation episode / scene |
| 생성 | Architect·Forecast·Planner·Writer·Auditor·Reviser 실제 동작 | 현재 사람·별도 에이전트가 내용을 작성하고 Python이 검증 |
| 정본 | InkOS book state, chapter snapshot, truth receipt, 승인 장부 | source ledger, mapping, state/script manifest, stage manifest |
| UI | InkOS Studio 기획서·Arc 지도·작품 대화·감리 | CLI와 Markdown/HTML review 중심 |
| 강점 | 실제 창작 루프, 한국어 네이티브, 재미·보상·연속 집필 | 원문 완전성, 변경 추적, 승인 해시, M:N 각색 근거 |

## 3. Firefly가 이미 더 잘하고 있는 것

### 실제 창작 실행

InkOS는 기획·Forecast·Arc·Writer·Auditor·Reviser·Settler를 실제로 연결한다. 비교 저장소는 이 내용 생성을 아직 외부 사람·에이전트에 맡긴다. Firefly가 생성 구조를 그쪽으로 갈아탈 이유가 없다.

### 런타임 정본과 복구

InkOS에는 이미 다음이 있다.

- Forecast `contextFingerprint`와 stale 상태
- Story Rail의 target chapter stale 검사
- 회차 원고·Arc provenance·state snapshot을 묶는 `ChapterTruthReceipt`
- snapshot·restore·rollback·delete
- 승인된 미래 선점 move만 올리는 작품 장부

따라서 외부의 `stage manifest`를 작품 전체에 그대로 한 벌 더 얹으면 정본이 중복된다.

### 자연 NarrativeArc 개념

Reference Lab은 이미 Arc 길이를 고정하지 않는다. `NarrativeArc v2`와 `Chapter Packet`을 분리하고, `다음 1~3화만 제작하되 NarrativeArc 전체를 패킷 길이에 맞춰 자르지 않는다`고 명시한다.

외부의 M:N 각색 배정이 알려 준 것은 새 Arc 이론이 아니라, **이 분리를 문서가 아닌 기계 계약으로 연결해야 한다는 점**이다.

### 부모·자식 권한 경계

Firefly 부모는 manifest·라우팅·adoption만 소유하고, Reference Lab은 Gold 증거, InkOS는 제작 정본을 소유한다. advisory repo의 자동 writeback도 금지돼 있다. 이 경계는 외부 저장소보다 현재 Firefly 쪽이 더 명확하다.

## 4. 실제로 받을 만한 훈수

### P0. Reference Asset Integrity + Gold Route Receipt

현재 InkOS `MaterialAsset`은 `id`, source, 경로, 글자 수, excerpt를 기록하지만 원본 바이트 해시·추출 본문 해시·추출기 버전·완전성 상태가 없다. `BookReferenceBinding`도 material ID·용도·메모·시각만 기록한다.

따라서 연결 뒤 `.inkos/materials/<id>.md`가 바뀌어도 같은 레퍼런스로 조용히 사용될 수 있다. Project Pitch도 현재 `원본 있음/없음`만 보여 주고 `fresh/stale`을 구분하지 않는다.

권장 최소 계약:

```text
MaterialAsset v2
  sourceSha256
  extractedTextSha256
  extractorId / extractorVersion
  extractionStatus: complete | partial | unsupported

BookReferenceBinding v2
  approvedMaterialSha256
  status: current | stale | missing
```

Gold 라우팅에는 별도 receipt를 둔다.

```text
GoldRouteReceipt v1
  origin repo / commit / artifact path / artifact sha256
  Gold QA receipt path / sha256
  role: spine | engine | payoff | hook | wildcard
  allowed uses
  selected Arc·event·reward IDs
  forbidden source surfaces
  transformation rationale
  target NarrativeArc / B-Rail / ArcPacket IDs
  human approval + approved receipt sha256
```

효과:

- 여러 Gold의 사건·보상을 어디에 썼는지 역추적 가능
- Gold 카드가 재감리·수정되면 기존 라우팅을 stale로 표시
- `레퍼런스 연결`과 `그 레퍼런스 조언을 실제 채택`을 구분
- advisory Reference Lab이 InkOS에 직접 write하는 일 없이 사람이 승인한 receipt만 전달

### P1. NarrativeArc Allocation

현재 InkOS `ArcPacket`은 의도적으로 1~3화이고, Story Rail B entry는 Arc ID 하나에 결속된다. 반면 Reference Lab의 자연 NarrativeArc는 5화 이상일 수 있으며 Chapter Packet은 그 일부 1~3화다.

ArcPacket 상한을 늘리면 안 된다. 대신 중간 배정층을 둔다.

```text
NarrativeArcAllocation v1
  narrativeArcId
  entryState / exitState / irreversibleChange
  source GoldRouteReceipt IDs
  ordered packet IDs
  packet별 담당 사건·압력·소지급·관계 변화
  deferred / retired obligations and reason
  allocation sha256 / review status
```

관계는 다음처럼 된다.

```text
자연 NarrativeArc 1개
  → InkOS 1~3화 ArcPacket 여러 개
  → 각 회차 truth receipt
```

외부 각색 시스템처럼 모든 창작 아이디어를 `정확히 한 번` 강제하면 안 된다. Firefly에서는 **사람이 채택한 사건·보상·관계 의무만** 실현·유예·폐기 중 하나로 설명하게 한다. 창작의 빈칸까지 coverage FAIL로 만들지 않는다.

### P2. Book Production Baseline

InkOS의 hash·stale·truth 장치는 각각 강하지만, 운영자가 한 번에 보는 현재 작품 기준선은 없다. 기존 Book Detail 또는 CLI에 read-only 집계를 추가할 가치가 있다.

표시 대상:

- `project_pitch.md`와 `book_rules.md` 현재 해시
- 연결 레퍼런스의 current/stale/missing
- 승인된 GoldRouteReceipt와 미결 owner lock
- Story Rail 해시·target chapter freshness
- 활성 NarrativeArcAllocation과 ArcPacket
- 최신 chapter truth receipt와 감리 상태
- 열린 research·creative 문제

외부 v0.3에서 가져올 가장 중요한 원칙은 이것이다.

> **현재 현황을 확인했다는 사실은 내용 승인과 다르다.**

baseline은 작품을 승인하거나 수정하지 않는다. 무엇이 current·stale·pending인지 관찰하고 사람에게 보여 주기만 한다. 새 대시보드는 만들지 않고 기존 작품 상세 또는 CLI 표면을 사용한다.

### P3. 원문 완전성 ingest는 조건부

Reference Lab이 직접 DOCX·PDF 원문을 받아 Gold 후보를 만드는 공정이 늘어날 때만 외부의 source ledger·coverage 아이디어를 별도 intake validator로 검토한다.

오리지널 작품 전체에는 적용하지 않는다. 신규 창작에 `모든 source item을 정확히 한 번 사용`하는 규칙을 넣으면 창작을 각색처럼 오해하게 된다.

## 5. 가져오지 말아야 할 것

- 외부 저장소를 Firefly manifest 하위 레포로 편입
- 외부 Python 코드나 데이터 계약의 직접 복사
- 원작 source coverage를 오리지널 작품의 재미·정합성 기준으로 사용
- 자연 NarrativeArc를 1~3화로 자르거나 반대로 InkOS ArcPacket 상한을 늘림
- 가상 시청자 자문을 실제 독자 데이터나 자동 PASS/FAIL로 승격
- 외부 Git 운영 지시를 복사

외부 저장소는 현재 LICENSE가 없고 제작자도 다르다. 읽기 초대는 코드 재사용 허가와 동일하게 취급하지 않는다. 필요하면 원 저작자와 별도 사용 범위를 합의한 뒤 다시 판단한다.

또한 외부 `AGENTS.md`는 `feat/story-structure` 로컬 작업·remote push 금지·main 변경 금지를 적고 있지만 실제 remote에는 해당 브랜치가 없고 `main`에 최신 이력이 올라와 있다. 이 문서·운영 불일치는 Firefly가 따라 배울 부분이 아니다.

## 6. 반복 감리 기록

### 감리 1 — 외부 장치 전체 도입 가설

초기 판단:

- source ledger, coverage, M:N allocation, stage manifest, baseline을 한 묶음으로 도입할 가치가 있다.

반례:

- 외부는 보유 IP 각색이고 Firefly는 신규 창작이다.
- 원문 보존 coverage를 창작에 적용하면 아직 쓰지 않은 선택지를 누락으로 오판한다.

결과:

- **실질 변경.** 전체 도입을 폐기하고 레퍼런스·Gold 경계로 범위를 축소했다.

### 감리 2 — InkOS에 추적 장치가 부족하다는 가설

반례:

- Forecast fingerprint, stale, Story Rail eligibility, chapter truth receipt, snapshot·rollback이 이미 있다.
- Reference Lab에도 자연 NarrativeArc·Chapter Packet·Gold Router가 이미 있다.

결과:

- **실질 변경.** 일반 stage manifest와 새 Arc 이론을 제외했다.
- 남은 빈칸을 reference hash, Gold adoption receipt, NarrativeArc allocation, 운영 baseline으로 좁혔다.

### 감리 3 — 외부 저장소 직접 통합 가설

반례:

- private·READ 권한, LICENSE 없음, 제작자 다름
- 현재 트리에 InkOS 직접 의존 없음
- 자동 대본 집필 미구현
- Firefly는 이미 별도 Reference Lab과 production InkOS 경계를 가짐

결과:

- **실질 변경 없음. 안정 1.** 개념 비교만 하고 repo/code 통합은 하지 않는다.

### 감리 4 — 최소 실패 시나리오

검사한 실패:

1. Gold 카드가 수정됐는데 기존 작품이 옛 조언을 계속 사용한다.
2. 자연 Arc가 7화인데 1~3화 ArcPacket 하나로 잘린다.
3. 기획서는 최신인데 reference binding과 Rail은 옛 버전이다.
4. 레퍼런스가 없는 순수 오리지널 작품에도 source coverage가 강제된다.

판정:

- 1은 P0 해시·stale receipt가 해결한다.
- 2는 P1 배정층이 해결한다.
- 3은 P2 read-only baseline이 드러낸다.
- 4는 계약을 optional·reference-only로 두면 기존 창작 경로가 유지된다.

결과:

- **실질 변경 없음. 안정 2. 결론 확정.**

## 7. 우선순위

| 순위 | 작업 | 이유 | 현재 작품 영향 |
| --- | --- | --- | --- |
| 1 | Reference Asset Integrity + GoldRouteReceipt v1 | 여러 Gold 사건·보상 라우팅의 근거와 stale를 처음으로 기계화 | 승인 전 0, optional |
| 2 | NarrativeArcAllocation v1 | 자연 Arc를 보존하면서 1~3화 InkOS 제작 단위로 내림 | 승인된 신규 작품부터 |
| 3 | Book Production Baseline v1 | 흩어진 hash·승인·stale를 사람이 한 번에 확인 | read-only |
| 보류 | 원문 source ledger intake | IP 각색·대규모 원문 intake가 실제 Firefly 범위가 될 때만 | 없음 |

## 8. 최종 판단

외부 저장소 때문에 Firefly를 재편할 필요는 없다. Firefly의 창작 코어와 Reference Lab 방향은 맞다.

다만 현재 Firefly는 **좋은 조언을 만드는 구조**는 갖췄지만, 그 조언이 **어느 승인본에서 왔고, 어떤 자연 Arc의 어느 1~3화 제작 단위에 채택됐으며, 상류가 바뀐 뒤에도 여전히 유효한지**를 기계적으로 증명하는 연결층이 얇다.

그러므로 다음 시스템 개선을 하나만 고른다면 `GoldRouteReceipt v1`부터 시작한다. 외부 저장소에서 받을 가장 값싼 훈수이면서, 사용자가 원하는 여러 Gold의 사건·보상 라우팅과 가장 직접적으로 연결된다.
