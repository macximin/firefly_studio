# Book Production Baseline v1 구현 인계

- 완료일: 2026-08-22
- 선행 계약: `ee588793 feat(core): allocate narrative arcs across packets`
- InkOS 기준선 구현: `bb857142 feat(core): freeze book production baselines`
- InkOS 읽기 전용 집계 보강: `20f69735 feat(core): report live production readiness`
- 상태: Core 구현·전체 검증·원격 push 완료

## 결론

`Book Production Baseline v1`은 작품 내용을 생성하거나 승인하는 기능이 아니다. 사람이 제작 시작 전에 확인한 `project_pitch.md`, `book_rules.md`, ready A/B Rail, 승인된 NarrativeArcAllocation, 1~3화 ArcPacket, 승인된 GoldRouteReceipt의 정확한 상태와 해시를 하나의 기준선으로 묶는다.

별도의 live readiness API는 기준선 저장 여부와 무관하게 현재 작품의 기획·참고자료·Rail·Arc·회차 truth·실행 잠금·열린 감리 및 리서치 문제를 읽기 전용으로 집계한다. 이 함수는 Book 파일을 생성·수정·승인하지 않는다.

## 저장 기준선 계약

InkOS Core 공개 API:

- `saveBookProductionBaselineDraft`
- `approveBookProductionBaseline`
- `loadBookProductionBaselineStore`
- `inspectBookProductionBaseline`
- `assertBookProductionBaselineApproval`
- 관련 Zod schema와 TypeScript type

작품에 실제 적용할 때의 저장 위치:

```text
books/<bookId>/story/production/baselines.json
```

기준선은 다음을 결속한다.

- `project_pitch.md` SHA-256
- `story/book_rules.md` SHA-256
- ready `story/rails/plan.json` 전체 해시와 수정 시각
- 승인된 NarrativeArcAllocation ID·NarrativeArc ID·승인 해시
- 포함된 모든 ArcPacket ID·상태·회차·수정 시각·해시
- 포함된 모든 GoldRouteReceipt ID·승인 해시
- 확인자·확인 시각·기준선 승인 페이로드 SHA-256

draft 기준선은 작품 내용 승인이 아니라 현재 제작 입력을 스냅샷한 상태다. 기준선 확인 시 의존 근거가 모두 `current`여야 하며, 이후 어느 하나라도 바뀌면 기준선은 `stale` 또는 `missing`이 된다.

검사 상태:

- `pending`: 기준선이 저장됐지만 아직 사람 확인 전
- `current`: 기준선과 모든 의존 근거가 확인 당시와 동일
- `stale`: 피치·규칙·Rail·Allocation·Packet·Gold 승인본 또는 원본이 변경됨
- `missing`: 기준선이나 필수 의존 파일이 없음

## live readiness 계약

공개 API:

- `inspectBookProductionReadiness`

한 번의 읽기에서 다음을 집계한다.

- 피치와 작품 규칙의 현재 해시
- 일반 BookReference의 존재 여부와 현재 파일 해시
- 모든 GoldRouteReceipt의 `current | stale | missing`
- Story Rail의 ready 여부와 해시
- NarrativeArcAllocation의 승인·신선도
- 해당 Allocation이 사용하는 ArcPacket의 draft/ready 상태와 해시
- 최신 승인·출간 회차의 ChapterTruthReceipt 검증 결과
- `.write.lock`의 clear/active/stale 상태
- 최신 회차 감리·분량 문제
- 미래 선점 research receipt의 미검증·조사 필요·충돌 문제

일반 BookReference v1에는 승인된 material 해시가 없으므로 파일이 존재해도 `current`라고 꾸미지 않고 `unverified`로 보고한다. 이 경우 전체 readiness는 `pending`이다. GoldRouteReceipt만 승인 해시와 외부 근거 검증을 통과하면 `current`가 된다.

## 강제 규칙

- 비어 있거나 누락된 피치·작품 규칙은 기준선을 만들 수 없다.
- A-Rail과 B-Rail이 모두 ready여야 한다.
- 미승인 NarrativeArcAllocation은 기준선에 넣을 수 없다.
- draft ArcPacket은 기준선에 넣을 수 없다.
- 저장 뒤 피치가 바뀌어도 기준선 확인을 강행할 수 없다.
- 확인된 기준선 JSON을 몰래 바꾸면 승인 해시 검증에서 거부한다.
- 승인된 기준선 ID는 같은 ID로 덮어쓸 수 없다.
- live readiness는 잠금이나 stale 파일을 수리·삭제하지 않는다.

## 의도적으로 하지 않은 것

- 현재 작품에 기준선 생성
- 원고·기획서·작품 규칙·Arc·Rail 수정
- Studio 화면 또는 CLI 명령 연결
- readiness 결과를 제작 자동 승인이나 집필 차단기로 사용
- 일반 BookReference v1을 승인 해시가 있는 것처럼 `current` 처리
- MaterialAsset v2 마이그레이션
- Reference Lab 또는 Market Radar의 InkOS 자동 writeback

## 검증 영수증

```text
Book Production Baseline + readiness 카나리: 11/11 PASS
Core: 201 files / 2050 tests PASS
Studio: 61 files / 642 tests PASS
CLI: 45 files / 243 tests PASS
합계: 2935 tests PASS
pnpm -r typecheck: PASS
git diff --check: PASS
```

전체 테스트 중 의도적으로 오류 경로를 검사하며 출력되는 SQLite experimental warning, mock API 연결 실패, mock lock/error 로그는 기존 기대 출력이고 테스트 실패가 아니다.

## 현재 작품 보호 확인

InkOS 두 커밋의 변경은 아래 Core 파일뿐이다.

```text
packages/core/src/production/baseline-schema.ts
packages/core/src/production/baseline-store.ts
packages/core/src/production/readiness-report.ts
packages/core/src/__tests__/book-production-baseline.test.ts
packages/core/src/index.ts
```

따라서 《IMF를 독식한 재벌 3세》를 포함한 `books/**`에는 이번 작업으로 생긴 변경이 없다.

## 다음 작업

P0 GoldRouteReceipt, P1 NarrativeArcAllocation, P2 Book Production Baseline의 Core 계약은 완료됐다.

다음 최소 단계는 `inspectBookProductionReadiness` 결과를 기존 InkOS 작품 상세 화면에 읽기 전용으로 붙이는 것이다. 새 대시보드를 만들지 않고 `기획서 → 아크 → 원고` 흐름 안에서 상태만 보여 준다. 그 뒤에도 현재 작품에 실제 Gold·Allocation·Baseline을 생성하는 일은 별도 사람 승인 전까지 하지 않는다.
