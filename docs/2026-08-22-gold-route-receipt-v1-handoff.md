# GoldRouteReceipt v1 구현 인계

- 완료일: 2026-08-22
- 부모 비교 감리: `35dbc72 docs: audit external story structure system`
- InkOS 구현: `57c6e7e8 feat(core): add approved gold route receipts`
- 상태: 구현·전체 검증·원격 push 완료

## 결론

`GoldRouteReceipt v1`은 Reference Lab의 승인된 Gold 근거를 InkOS 제작 계약으로 전달하되, Reference Lab이 작품에 직접 쓰지 못하도록 Core API 경계에 구현했다.

한 작품과 한 제작 목표에 여러 Gold를 동시에 라우팅할 수 있다. 각 Gold는 서로 다른 출처·역할·선택 사건·선택 보상·변환 근거를 독립 영수증으로 유지한다. 원문이나 Gold 카드 본문은 InkOS 영수증에 복사하지 않는다.

## 구현 계약

InkOS Core 공개 API:

- `approveGoldRouteReceipt`
- `loadGoldRouteReceiptStore`
- `inspectGoldRouteReceipt`
- `assertGoldRouteReceiptApproval`
- 관련 Zod schema와 TypeScript type

작품에 실제 적용할 때의 저장 위치:

```text
books/<bookId>/story/references/gold_route_receipts.json
```

각 영수증은 다음을 결속한다.

- Gold 원본 저장소·커밋·상대 경로·SHA-256
- 관리자 QA 영수증 저장소·커밋·상대 경로·SHA-256
- 역할: `spine | engine | payoff | hook | wildcard`
- 허용 용도
- 선택한 NarrativeArc·사건·보상·속도·인물·관계·훅 ID
- 금지할 원작 표면
- 신작으로 바꾼 변환 근거
- 목표 NarrativeArc·B-Rail·ArcPacket ID
- 사람 승인자·승인 시각·승인 페이로드 SHA-256

승인 시점에는 호출자가 명시한 Reference Lab root 아래의 두 파일을 실제로 읽는다. 둘 다 저장된 해시와 일치하는 `current` 상태여야만 영수증을 기록한다. 이후 재검사 결과는 다음 셋뿐이다.

- `current`: Gold와 QA 파일이 모두 승인본과 동일
- `stale`: 파일은 있으나 하나 이상의 해시가 변경됨
- `missing`: 저장소 root 또는 파일을 찾을 수 없음

승인 뒤 영수증 JSON의 역할·선택·변환 근거·목표 등이 바뀌면 승인 해시가 맞지 않아 load 단계에서 거부한다.

## 의도적으로 하지 않은 것

- 현재 작품에 Gold 영수증 생성
- 원고·기획서·Arc·Rail 변경
- 에이전트가 사람 승인 없이 Gold를 채택하는 tool 추가
- Reference Lab의 InkOS 자동 writeback
- 외부 비교 저장소 코드·계약 복사
- `NarrativeArcAllocation v1` 구현
- `MaterialAsset v2`와 일반 레퍼런스 해시 마이그레이션

## 검증 영수증

```text
GoldRouteReceipt 카나리: 6/6 PASS
Core: 199 files / 2032 tests PASS
Studio: 61 files / 642 tests PASS
CLI: 45 files / 243 tests PASS
합계: 2917 tests PASS
pnpm -r typecheck: PASS
git diff --check: PASS
```

전체 테스트 중 의도적으로 오류 경로를 검사하며 출력되는 SQLite experimental warning, mock API 연결 실패, mock lock/error 로그는 기존 기대 출력이고 테스트 실패가 아니다.

## 현재 작품 보호 확인

InkOS 커밋 `57c6e7e8`의 변경 파일은 아래 세 개뿐이다.

```text
packages/core/src/references/gold-route-receipt.ts
packages/core/src/__tests__/gold-route-receipt.test.ts
packages/core/src/index.ts
```

따라서 《IMF를 독식한 재벌 3세》를 포함한 `books/**`에는 이번 작업으로 생긴 변경이 없다.

## 다음 작업

다음 독립 단계는 `NarrativeArcAllocation v1`이다. 자연 NarrativeArc 하나를 여러 1~3화 ArcPacket에 배정하고, 승인된 `GoldRouteReceipt`의 사건·보상·관계 의무가 어느 패킷에서 실현·유예·폐기되는지 기록한다. ArcPacket의 1~3화 상한은 유지한다.
