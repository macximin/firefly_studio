# InkOS·Storyyard 용어와 계약 대조

2026-09-05 · 로컬 구현 조사 및 후속 수정안

**기존 A레일·B레일·아크·블록 연결을 보존한다.** 사용자가 말한 아크는 A/B레일 계열의 전개 설계다. 이를 InkOS의 `ArcPacket` 하나와 같다고 설명한 것이 잘못이었다. 반대로 기존 Storyyard의 아크까지 새 이름으로 치환하는 것도 해결책이 아니다.

이 문서는 현재 개념의 대응과 수정 범위를 정리한 조사 결과다. 새 계약 버전이나 새 제작 계층을 도입하지 않는다. 앞서 성급하게 추가했던 `production-terminology-v1.md`와 AGENTS 용어 규칙은 철회된 상태다. 이번 조사에서는 기존 계약·기획서 양식·코드·저장 데이터를 변경하지 않았다.

## 1. 사용자가 보는 개념과 구현 대응

| 기존 개념 | 실제 의미 | InkOS 대응 | Storyyard 대응·주의 |
| --- | --- | --- | --- |
| 작품 / Book | 한 작품의 설정·진행·원고를 담는 관리 대상 | `BookConfig`, `bookId`, `books/…` | 원고 검토 패킷의 `source.bookId`·`work.id`. 기존 플롯 프로젝트 ID와 자동으로 동일해지는 것은 아님 |
| 기획서 / 피치 | 주인공·목적·재미·초반 사건·장기 전개를 검토하는 기획 | `entryContract`, 피치 후보, `arcLadder` | 기획 검토 v3. 아직 Book이 만들어지지 않은 후보도 다룸 |
| 아크 설계 / A·B레일 | 사용자가 말한 전개 설계의 범위 | `StoryRail`: `anchorRail` + `arcRouteRail` | 기존 정본 화면도 A레일과 B레일을 구별해 표시 |
| A레일 / Anchor | 장기 도착점과 주요 변화 | `StoryAnchor`, `targetAnchorId` | 정본 패키지 `anchors`, B아크의 `targetAnchor` |
| B레일 / B레일 아크 | A 도착점으로 가는 순서 있는 전개 | `ArcRouteEntry`: `bId`, `targetAnchorId`, 연결된 `arcId` | 기존 플롯 투영의 `bArcs`·`storyyardProjection.arcs`. B아크 하나가 Storyyard 아크 하나에 대응 |
| ArcPacket | B레일 항목에 연결하는 당장 집필할 상세 실행 입력 | `episodeCount`, `chapterNumbers`, `episodeBeats`; 현재 연속 1~3화 | 조사한 HIL 패킷은 이것을 Storyyard 플롯 아크로 직접 전송하는 계약이 아님 |
| 회차 / Chapter·Episode | 연재하는 한 화 | 회차 번호와 회차 원고 | 기존 정본 플롯 투영에서는 한 화가 블록 하나. 회차 원고는 별도 원고 영역에도 투영 |
| 원작의 서사 구간 / NarrativeArc | 원작에서 분석한 사건의 범위 | `NarrativeArcAllocation`으로 여러 B 항목·ArcPacket에 배분 | 피치의 `sourceArcId`는 원작 근거 식별자. Storyyard 플롯 아크 ID로 읽으면 안 됨 |

‘아크 설계’, ‘B레일 아크’, ‘ArcPacket’은 여기서 서로를 구별하는 설명이다. 새 타입이나 새 이름의 단계 세 개를 추가한 것이 아니다. **대화에서 아크라고 하면 사용자가 말한 A/B레일 맥락을 따른다.** 실행 패킷을 말할 때만 기존 코드 이름 `ArcPacket`을 명시한다.

Book은 구조도나 A/B레일의 대체 명칭이 아니다. 작품을 등록하는 작업과 작품의 전개를 설계하는 작업도 구별한다.

근거: [Book 설정](../edge_repos/inkos/packages/core/src/models/book.ts), [레일 스키마](../edge_repos/inkos/packages/core/src/arc/rail-schema.ts), [실행 패킷](../edge_repos/inkos/packages/core/src/arc/schema.ts), [서사 구간 배분](../edge_repos/inkos/packages/core/src/arc/allocation-schema.ts), [Storyyard 정본 타입](../edge_repos/storyyard/app/canon-packages.ts).

## 2. Storyyard 연결은 두 경로다

### 기존 정본·플롯 경로

```text
기존 Foundry 정본 패키지
  A레일 Anchor ───────────────→ 장기 도착점 표시
  B레일 아크 (bId) ───────────→ Storyyard 아크 (내부 kind: act)
  회차 (episode + bId) ───────→ 해당 아크의 블록
  승인 원고 ─────────────────→ 회차 원고 영역
```

현재 Storyyard 소스는 `foundry_storyyard_arc_episode_v1`과 `v2`를 받는다. 내보내기 스크립트는 v2를 생성하며 `arcUnit: b_rail_arc`, `blockUnit: episode`, `reverseSync: false`를 지정한다.

동기화는 `arc:${bId}`와 `episode:${episode}`로 기존 항목을 찾는다. 화면의 ‘아크’가 DB에서는 `kind: act`인 것도 기존 대응이다. 단어가 다르다고 이 키들을 일괄 바꾸면 기존 항목 식별과 충돌 감지가 달라진다. 로컬 편집 내용이 이전 투영 해시와 달라지면 기존 코드가 충돌로 보존한다.

**이 경로는 기존 Foundry 정본용이다. 현재 InkOS HIL 연결과 같다고 가정하지 않는다.** Foundry는 현 HQ manifest의 제외 대상이며 이번 조사에서 해당 저장소를 변경하거나 가족 구성원으로 추가하지 않았다. Storyyard 안에 남아 있는 수신 계약을 확인했다.

근거: [정본 내보내기](../edge_repos/storyyard/scripts/export-firefly-canon-package.mjs), [정본 동기화 수신](../edge_repos/storyyard/app/api/projects/[id]/foundry-sync/route.ts), [플롯 화면](../edge_repos/storyyard/app/project-workspace.tsx).

### 현재 InkOS 인간 검토 경로

```text
InkOS 검토 패킷 → Storyyard 검토 화면·사람의 결정 → InkOS의 적용 또는 결정 처리
```

| 패킷 버전 | 검토 대상 | 식별자와 효과 |
| --- | --- | --- |
| v1 | 회차 원고 후보 | `source.bookId`; 실제 적용은 InkOS |
| v2 | 비교 평가 | `source.bookId`; 평가 결정은 advisory, 원고에 바로 적용하지 않음 |
| v3 | 작품 기획 후보 | `source.slateId`; `planning-selection`, Book 생성 이전 후보 포함 |
| v4 | 사람 전제 후보 | `source.slateId`; `human-premise-selection`, 선택 자체로 상업 확장·Book 생성·원고 적용하지 않음 |

저장 컬럼 이름만으로 작품 생성 여부를 판단하면 안 된다. Storyyard는 v3/v4의 `slateId`도 기존 검토 DB의 `bookId` 컬럼에 저장하며, 결정 전송 시 이 값을 `workId`로 내보낸다. 이것은 기존 검토 저장 대응이지 실제 InkOS Book이 있다는 증거가 아니다.

조사한 InkOS의 Storyyard 패킷 모듈과 CLI 경로에서는 A/B레일 전체를 기존 정본 플롯으로 투영하는 연결을 확인하지 못했다. 따라서 ‘현재 InkOS B레일이 이미 Storyyard 플롯 아크와 동기화된다’고 보고할 수 없다. 향후 연결한다면 기존 정본 경로와 생산 주체·ID·상태 대응을 확인하는 별도 어댑터 작업이다.

근거: [InkOS v3 패킷](../edge_repos/inkos/packages/core/src/storyyard/pitch-review-packet.ts), [InkOS v4 패킷](../edge_repos/inkos/packages/core/src/storyyard/human-premise-review-packet.ts), [Storyyard 수신 검증](../edge_repos/storyyard/app/firefly-review-contract.ts), [검토 DB 대응](../edge_repos/storyyard/app/firefly-review-data.ts), [적용 응답 확인](../edge_repos/storyyard/app/firefly-review-ack.ts).

## 3. 실제 충돌과 최소 수정안

| 충돌 | 확인된 사실 | 수정안과 범위 |
| --- | --- | --- |
| 아크 전체와 ArcPacket 혼용 | InkOS 화면에 ‘현재 Arc’·‘제작 Arc’가 실행 패킷을 뜻함 | 실행 패킷이 필요한 화면에 `ArcPacket · 1~3화 실행 계획`처럼 기존 이름과 의미 병기. Storyyard의 B레일 아크 명칭은 보존. 표시 수정은 후속 작업 |
| 피치의 `railA/railB` | 작성 스킬에서 A는 돈·사업 누적, B는 관계·감정 변화. 실행 레일과 다르다고 스킬도 명시 | 설명에서는 `railA(성과 누적)`·`railB(관계 변화)`로 구별. 이를 진짜 A/B레일로 바로 복사하지 않음. 키 변경은 양쪽 계약 개정 필요 |
| 미래 선점 화면의 A/B | 실행·보상을 A레일, 저항·후폭풍·기억 열화를 B레일로 표시 | 해당 카드 제목에서만 A/B를 제거하고 내용의 실제 의미를 표시할 수 있음. 레일이나 데이터 구조 변경 아님 |
| `arcLadder`와 B레일 혼동 | v3 피치의 최소 6개 전개 항목은 숫자 `arc`와 행동·보상·관계 항목. `bId`나 `targetAnchorId` 없음 | 기획 전개 목록으로 설명. 실제 B레일 바인딩 완료로 간주하지 않음 |
| 1~5화와 1~3화 | 기존 정본 화면 설명은 B레일 아크 1~5화. InkOS는 ArcPacket과 닫힌 B 항목의 실제 회차 수를 1~3으로 제한 | 이름 통일로 덮을 수 없는 실행 제약 차이. 지금은 각 경로의 규칙을 유지하고, 연결 구현 시 배분·분할 정책 검토 |
| ‘블록=한 화’ 일반화 | 정본 투영 계약은 한 화→블록. Storyyard 일반 편집 화면은 사용자가 자유롭게 블록 작성 가능 | 한 화 대응은 정본 투영 범위에서 설명. 기존 수동 블록을 회차로 일괄 재해석하지 않음 |

특히 InkOS의 B레일 항목과 ArcPacket은 별도 ID를 갖지만 연결되어 있다. `ArcRouteEntry.arcId`는 선택적 참조이며, 같은 실행 패킷을 여러 B 항목에 중복 연결하지 않도록 레일이 검증한다. 따라서 B레일이 존재한다는 이유로 상세 실행 패킷까지 작성·승인됐다고 볼 수 없다.

근거: [InkOS 레일 화면](../edge_repos/inkos/packages/studio/src/components/chat/StoryRailsPreview.tsx), [InkOS Arc 화면](../edge_repos/inkos/packages/studio/src/pages/ArcCanvas.tsx), [피치 작성 지침](../edge_repos/inkos/packages/core/skills/inkos-commercial-webnovel-pitch/SKILL.md), [기존 정본 화면](../edge_repos/storyyard/app/canon/canon-review-board.tsx).

## 4. 표시 수정과 계약 변경의 경계

**화면에만 있는 설명문**은 기존 객체·의미를 유지하며 정리할 수 있다. A/B레일 화면의 설명 보강이나 미래 선점 카드의 중복 A/B 제목 제거가 해당한다. 실제 렌더링과 관련 표시 테스트로 확인한다.

**생성 프롬프트의 의미 변경**은 단순 표시 수정이 아니다. 키가 같아도 기존 성과·관계 자료를 장기 도착점·실행 경로 자료로 바꾸면 과거 결과와 의미가 달라진다. 생산자와 수신자의 의미 대응 및 기존 후보 처리 방침이 먼저 필요하다.

**패킷 필드·필수 조건 변경**은 InkOS 생산 스키마와 Storyyard 수신 검증을 함께 수정해야 한다. v3의 `railA/railB/arcLadder`, `entryContract` 등은 실제 수신 필드다. Storyyard가 키 목록과 후보 SHA를 검증하므로 기존 후보 JSON의 이름을 바꿔 같은 패킷으로 저장할 수 없다. 패킷 본문과 인덱스도 해시로 묶인다.

**식별자·배분·화수·저장 구조 변경**은 표시 작업에서 제외한다. `bookId/slateId/workId`, `bId/arcId/sourceArcId`, `mappingVersion`, `arcUnit`, `blockUnit`, 기존 결정·승인·투영 해시는 그대로 둔다. 내부 파일명과 DB의 `act`도 이번 분류 때문에 바꾸지 않는다.

근거: [Storyyard 후보 키·해시 검증](../edge_repos/storyyard/app/firefly-review-contract.ts), [검토 인덱스 검증](../edge_repos/storyyard/app/firefly-review-packet-index.mjs), [InkOS 기획 승인 계약](../edge_repos/inkos/packages/core/src/planning/entry-contract.ts).

## 5. 후속 작업의 순서

1. **표시 충돌부터 정리:** InkOS의 실행 Arc 설명, 미래 선점 카드 A/B 중복, 피치 항목의 의미 표기. Storyyard의 기존 아크·블록 연결은 그대로 확인한다.
2. **기획서 양식·생성 지침 동시 대조:** ‘현재 Arc’가 장기 전개인지 현재 B레일 아크인지 실행 패킷인지 문맥별로 명확히 한다. Markdown만 수정하고 모델 입력까지 바뀌었다고 보고하지 않는다.
3. **원작 역설계 후 재설계 개선:** 기존 방법론 문서의 자기 이익·원문 충실도·변형 범위 작업을 진행한다. 그 과정에서 피치 필드나 필수 조건을 바꾸면 InkOS 생성→Storyyard 검토→InkOS 결정 수신까지 묶어 검증한다.
4. **InkOS→Storyyard 플롯 연결은 별도 기능으로 평가:** 기존 Foundry 연결을 이름만 바꿔 대체하지 않는다. 필요한 경우 A/B·ArcPacket·회차 및 1~3/1~5화 차이를 실제 매핑으로 검증한다.

후속 계약 변경의 검증 범위는 새 후보의 양쪽 통과, 기존 패킷 해시와 과거 결정의 유효성 보존, 결정 대상 ID 일치, 기존 B아크→아크·회차→블록 대응, 수동 편집 충돌 보존이다. 이번 문서 작성 때문에 이 런타임 변경이나 새 카나리를 실행하지 않았다.

관련: [원작 중심 재설계 방법론](2026-09-05-source-first-redesign-methodology.md), [현재 기획서 양식](templates/webnovel-project-plan-v1.md).

## 조사 범위와 상태

로컬 소스·스키마·화면 코드·동기화 코드에 근거했다. 실제 배포 화면, 운영 DB 동기화, 신규 어댑터의 작동을 검증한 결과는 아니다. InkOS는 기존 미커밋 변경이 있는 상태, Storyyard는 조사 시 깨끗한 상태였다. 이 문서와 [검증 기록](evidence/2026-09-05-terminology-contract-audit.json)만 추가한다.
