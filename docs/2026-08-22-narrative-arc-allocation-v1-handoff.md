# NarrativeArcAllocation v1 구현 인계

- 완료일: 2026-08-22
- 선행 계약: `57c6e7e8 feat(core): add approved gold route receipts`
- InkOS 구현: `ee588793 feat(core): allocate narrative arcs across packets`
- 상태: 구현·전체 검증·원격 push 완료

## 결론

`NarrativeArcAllocation v1`은 자연스러운 장편 NarrativeArc 하나를 순서가 있는 여러 ArcPacket에 배정하는 InkOS Core 계약이다. 기존 ArcPacket의 1~3화 상한은 바꾸지 않고, 여러 패킷이 한 NarrativeArc의 시작·전개·결산을 나눠 맡게 한다.

각 패킷은 B-Rail 항목 하나에 결속되며, 패킷 순서는 B-Rail 진행 순서를 따라야 한다. 승인된 GoldRouteReceipt에서 사람이 고른 사건·보상·관계 의무는 하나도 소실되지 않고 패킷에 배정되거나 명시적으로 유예·폐기된다.

## 구현 계약

InkOS Core 공개 API:

- `saveNarrativeArcAllocationDraft`
- `approveNarrativeArcAllocation`
- `loadNarrativeArcAllocationStore`
- `inspectNarrativeArcAllocation`
- `assertNarrativeArcAllocationApproval`
- 관련 Zod schema와 TypeScript type

작품에 실제 적용할 때의 저장 위치:

```text
books/<bookId>/story/narrative_arcs/allocations.json
```

한 allocation은 다음을 결속한다.

- NarrativeArc ID·제목·목표·시작 화·종료 화
- 순서가 있는 ArcPacket ID와 각 1~3화 범위
- 패킷별 B-Rail 항목 ID
- 패킷별 사건·압박·마이크로 보상·관계 변화·의무 ID
- ArcPacket 파일 해시·수정 시각·회차 번호 스냅샷
- 관련 B-Rail 항목 해시
- 승인된 GoldRouteReceipt 해시
- 모든 선택 Gold 소스의 `assigned | deferred | retired` 처리
- 사람 승인자·승인 시각·승인 페이로드 SHA-256

## 강제 규칙

- 패킷 회차 범위는 서로 끊기거나 겹칠 수 없다.
- 각 ArcPacket은 1~3화여야 한다.
- 패킷 순서는 B-Rail 항목의 진행 순서를 거슬러 갈 수 없다.
- `assigned` Gold 소스는 정확히 한 패킷을 가리키며 그 패킷 본문에도 존재해야 한다.
- `deferred`와 `retired`는 대상 패킷을 가질 수 없다.
- 포함된 GoldRouteReceipt의 사람이 선택한 모든 소스는 정확히 한 번 처리되어야 한다.
- draft 저장과 사람 승인은 분리되어 있다.
- 승인 뒤 allocation 본문을 변조하면 승인 해시 검증에서 거부한다.

검사 상태는 다음 넷이다.

- `pending`: 저장됐지만 아직 승인되지 않음
- `current`: allocation과 모든 의존 스냅샷이 승인 당시와 동일
- `stale`: ArcPacket, B-Rail 결속, Gold 파일 또는 GoldRouteReceipt 재승인 중 하나가 바뀜
- `missing`: allocation 또는 필수 의존 파일이 없음

## 의도적으로 하지 않은 것

- 현재 작품에 allocation 생성
- 원고·기획서·Arc·Rail 변경
- 에이전트의 자동 패킷 배정 또는 자동 승인
- Reference Lab의 InkOS 자동 writeback
- ArcPacket 1~3화 상한 변경
- 외부 비교 저장소 코드·계약 복사
- `Book Production Baseline v1` 구현

## 검증 영수증

```text
NarrativeArcAllocation 카나리: 7/7 PASS
Core: 200 files / 2039 tests PASS
Studio: 61 files / 642 tests PASS
CLI: 45 files / 243 tests PASS
합계: 2924 tests PASS
pnpm -r typecheck: PASS
git diff --check: PASS
```

전체 테스트 중 의도적으로 오류 경로를 검사하며 출력되는 SQLite experimental warning, mock API 연결 실패, mock lock/error 로그는 기존 기대 출력이고 테스트 실패가 아니다.

## 현재 작품 보호 확인

InkOS 커밋 `ee588793`의 변경 파일은 아래 네 개뿐이다.

```text
packages/core/src/arc/allocation-schema.ts
packages/core/src/arc/allocation-store.ts
packages/core/src/__tests__/narrative-arc-allocation.test.ts
packages/core/src/index.ts
```

따라서 《IMF를 독식한 재벌 3세》를 포함한 `books/**`에는 이번 작업으로 생긴 변경이 없다.

## 다음 작업

다음 독립 단계는 `Book Production Baseline v1`이다. 작품 제작에 실제 적용하기 전에 기획서·NarrativeArc·B-Rail·ArcPacket·GoldRouteReceipt·NarrativeArcAllocation의 승인 상태와 해시를 한 번에 고정하는 제작 기준선을 만든다. 기준선 생성 전까지 현재 작품에는 새 계약을 적용하지 않는다.
