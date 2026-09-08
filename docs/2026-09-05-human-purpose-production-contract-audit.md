# 사람 표면 목적성과 Firefly 생산 계약 조사

2026-09-05 · HQ 조사 문서 · 현재 코드 확인 + 개선 제안 · 생산 계약 변경 아님

**판정: 목적성의 재료와 전달 경로는 이미 있다. 다만 일부 기본값과 피치 계약이 권한 중심 전개를 다시 넣고, 다작품 조합을 실제 집필 입력으로 이어 주는 연결이 부족하다. 모델 교체만으로 해결됐다고 볼 근거는 없다.**

사용자가 말한 `시스템 → 아크 → 원고`에서 시스템은 작품 전체의 작동 원리와 장기 설계로 해석했다. 이 문서에서는 이를 **작품 설계**라고 쓰고, InkOS 등 실행 소프트웨어는 **생산 시스템**이라고 구분한다. “사람 표면”은 주인공의 목적과 결과가 사람의 선택·행동·대우로 읽힌다는 뜻이다. 매번 감정이나 가족 장면을 추가하는 의무가 아니다.

조사 범위는 manifest에 등록된 HQ와 네 child의 관련 계약·코드·현재 카나리, 기존 상업성 문서, 로컬 스킬, 공개 원문 자료다. 소설 전체의 재분석이나 모델별 실제 집필 비교는 수행하지 않았다. 기존 후보·HIL 결정·Book·Arc·원고를 변경하지 않았으며, 조사 산출물만 HQ에 추가했다. 실행 검증과 소스 해시는 [증거 기록](/Users/a2501/Desktop/firefly_studio/docs/evidence/2026-09-05-human-purpose-production-contract-audit.json)에 보관한다.

## 1. 먼저 유지할 것과 고칠 것

| 질문 | 판단 |
| --- | --- |
| 장기·단기 목적성이 현재 있는가? | 있다. entry contract의 Series WHAT / Arc what / Chapter want / HOW, Architect의 전권 목표, Arc와 회차 메모가 있다. 이들이 같은 목적을 유지하는지 확인하는 연결을 보강해야 한다. |
| 생산 시스템이 지나치게 보수적인가? | 전체를 그렇게 판정할 수 없다. 큰 보상·대가 없는 결말·깨끗한 결산을 허용하는 명시 규칙이 있다. 반면 특정 생성·확장 계약은 원작 사건 순서, 관계 변화, 금지된 지름길 등을 과하게 고정할 여지가 있다. |
| 권한 중심 서술은 모델 탓인가? | 모델 경향은 미검증이다. 코드에는 권한 중심 기본 Rail을 생성하는 구체적 경로가 있다. 이를 먼저 분리해야 한다. |
| 기존 작품 여러 개를 섞는 실행이 완성됐는가? | 피치 스킬에는 주축+보조 작품 발상이 있다. 확인한 Writer 경로는 단일 bound pack에서 원문을 읽는다. 보조 작품 이름을 적는 것과 원문이 실제로 들어가는 것은 다르다. |
| 단계별 포맷을 새로 정해야 하는가? | 최소 의미 항목을 맞추는 작업은 필요하다. 새 문서 체계나 승인 단계를 추가할 필요는 없다. 기존 형식의 용어와 전달 관계부터 정리한다. |
| humanizer류가 해결책인가? | 문장 후처리 보조다. 목적·사건 선택 문제의 해결책은 아니다. 이미 있는 `inkos-story-deslop`이 장르 보호에는 더 직접적으로 맞는다. |

## 2. 사용자의 상업성과 ‘사람 표면’

기준으로 읽은 [남성향 웹소설 상업성 원칙](/Users/a2501/Desktop/firefly_studio/edge_repos/firefly_reference_lab/docs/2026-08-15-male-webnovel-commercial-editorial-principles.md:71)은 사용자의 암묵지와 샤이나크 논의를 정리한 **논의 초안**이다. 이 문서를 이미 모든 실행 단계에 강제되는 정본 규칙이라고 간주하지 않았다. 다만 현재 요청과 일치하는 판단 기준으로 사용했다.

그 문서는 장기 목표만 있으면 선언형 주인공, 단기 목표만 있으면 사건을 처리하는 직장인이 된다고 구분한다. HOW는 정보격차나 전용 우위이며, 목적 달성에 쓰이고 실제 결과로 바뀌어야 한다. 동시에 큰 행운, 압도적 승리, 과감한 보상을 허용한다. 비용은 능력을 가진 재미를 보존할 때 사용한다. [목적과 HOW](/Users/a2501/Desktop/firefly_studio/edge_repos/firefly_reference_lab/docs/2026-08-15-male-webnovel-commercial-editorial-principles.md:71), [보상 원칙](/Users/a2501/Desktop/firefly_studio/edge_repos/firefly_reference_lab/docs/2026-08-15-male-webnovel-commercial-editorial-principles.md:122).

아래는 설명용 신규 예시이며 현재 후보의 설정이나 승인된 수정안이 아니다.

| 층 | 예시 | 독자가 확인할 것 |
| --- | --- | --- |
| WHY: 욕망·동기 | 먹고살기 위해 자신을 모욕한 사람에게 다시 고개 숙이고 싶지 않다. | 무엇을 얻으면 이 인물에게 좋은 일인가? |
| Series WHAT: 장기 목적 | 자기 사업을 키워 그 사람의 제안을 거절하고도 자기 사람들을 먹여 살린다. | 달성하면 작품을 끝내도 되는 상태인가? |
| Arc what: 구간 목적 | 첫 거래를 성공시켜 함께 나올 동료들의 1년치 급여를 마련한다. | 구간 전후에 무엇이 실제로 달라지는가? |
| Chapter want: 이번 화 목적 | 경쟁사가 버린 물건을 사서 오늘 필요한 현금을 만든다. | 오늘 누가 어떤 결정을 내리는가? |
| HOW: 실행 우위 | 내일 수요가 폭증할 이유를 혼자 알고 있다. | 그 우위가 어떤 행동을 가능하게 하는가? |
| 지급·사람 표면 | 입금 후 동료에게 합류 조건을 제시한다. 동료가 사직서를 낸다. | 숫자가 선택과 행동으로 바뀌었는가? |

이 예시를 모든 작품의 표준 줄거리로 쓰면 다시 문제가 생긴다. 복수·수집·성공·지배·쾌락·독점·실력 증명도 목적이 될 수 있다. 타인의 인정을 원하지 않는 주인공도 성립한다. 관계 변화가 없는 돈 획득이나 혼자 즐기는 소비도 유효하다.

**권한·접근권·계약은 금칙어가 아니다.** “접근권을 얻는다”만으로 장기 전개가 끝나면 추상적이다. “그 열쇠로 창고를 열어 남들이 버린 물건을 골라 팔고 집을 산다”라면 권한은 행동을 가능하게 하는 구체적인 수단이다. 매 화 같은 목격자 반응이나 바뀐 호칭을 넣는 것도 새 할당량으로 만들지 않는다.

## 3. 현재 계약과 실행 경로에서 확인한 것

### 3.1 목적성은 이미 전달된다. 의미 보존의 확인이 약하다

[entry-contract.ts](/Users/a2501/Desktop/firefly_studio/edge_repos/inkos/packages/core/src/planning/entry-contract.ts:6)에는 동기·목적 3층·상황·HOW·지급 약속이 있다. [pitch.ts](/Users/a2501/Desktop/firefly_studio/edge_repos/inkos/packages/cli/src/commands/pitch.ts:231)는 이를 brief에 넣고, 승격 시 `externalContext`와 `authorIntent`로 Architect에 전달한다. [승격 연결](/Users/a2501/Desktop/firefly_studio/edge_repos/inkos/packages/cli/src/commands/pitch.ts:1299).

[Architect](/Users/a2501/Desktop/firefly_studio/edge_repos/inkos/packages/core/src/agents/architect.ts:1016)는 story_frame, volume_map, roles, book_rules, pending_hooks를 만든다. 전권 목표는 외부인이 달성 여부를 판단할 수 있어야 하며, 최종 장면의 사람과 행동도 요구한다. Arc·회차 메모를 Writer와 검수에 전달하고 보존하는 기존 경로도 있다. [계획 보존 코드](/Users/a2501/Desktop/firefly_studio/edge_repos/inkos/packages/core/src/pipeline/persisted-governed-plan.ts).

따라서 “목적성 모듈이 전혀 없다”는 진단은 폐기한다. 보강할 것은 **선택한 목적이 장기 설계와 현재 Arc에서 어떤 결과로 이어졌는지**다. 승인·해시 검증은 승인된 파일의 일치를 확인한다. 주인공의 목적이 같은 뜻으로 유지됐는지까지 증명하지는 않는다. 모든 문장을 고정하거나 별도 거대 그래프를 만들기보다, 기존 메모에 상위 목적과 현재 결과의 관계를 짧게 남기는 것이 먼저다.

### 3.2 권한 중심 기본 Rail을 ready로 만드는 경로가 있다

[firefly-preflight.ts](/Users/a2501/Desktop/firefly_studio/edge_repos/inkos/packages/core/src/reference/firefly-preflight.ts:181)의 `buildReferenceDerivedRail`에는 다음 문자열이 들어 있다.

- A2: “독립 지렛대 확보”, “돈·계약·권한의 첫 비가역 지급”.
- A3: “운영 확장”, “소유권과 실행권의 누적”.
- A5: “소유권 도약”, 산업·계열·가문의 지배권으로 확장.
- 가까운 anchor의 사람 후과: “상대와 가족·동료가 주인공의 새 권한을 행동과 호칭으로 인정한다”.
- 생성된 anchorRail과 arcRouteRail은 `ready`다.

이 기본값은 작품마다 선택한 인간적 목적을 읽어 만든 결과가 아니다. 돈과 사업을 다루는 작품에서 쓸 수 있는 전개지만, 모든 해당 작품의 기본 사다리로 사용하면 **사람 표면을 새 권한에 대한 주변의 인정으로 좁힐 수 있다**. 단순한 모델 추측보다 구체적인 수정 후보다.

범위는 제한적이다. reference/rail의 `auto-required` 정책과 기존 계획 부재 등 [preflight 조건](/Users/a2501/Desktop/firefly_studio/edge_repos/inkos/packages/core/src/reference/firefly-preflight.ts:38)에서 실행된다. 기존 계획을 매번 덮어쓰는 코드가 아니다. 피치 승격은 entryContractPolicy를 설정하며 모든 Book에 rail 필수 정책을 켜지는 않는다. **현재 v3는 Book 이전이므로 이 코드가 v3 후보를 만들었다고 단정할 수 없다.**

제안: 승인된 목적에서 가까운 목적지를 구성하고 먼 목적지는 희소하게 유지한다. 내용이 없는 상태를 일반 권한 사다리로 메운 뒤 준비 완료로 취급하지 않는다. 이는 코드 수정 제안이며 이번 조사에서 변경하지 않았다.

### 3.3 A/B Rail이라는 같은 말이 두 가지 뜻이다

| 위치 | A | B |
| --- | --- | --- |
| 피치 스킬 | 돈·지분·계열사·영향력 누적 | 가족·동료·라이벌의 자리와 감정 변화 |
| 실행 스키마 | anchorRail: 장기 목적지 | arcRouteRail: 목적지에 연결되는 실제 Arc 경로 |

근거: [피치 스킬 36행](/Users/a2501/Desktop/firefly_studio/edge_repos/inkos/packages/core/skills/inkos-commercial-webnovel-pitch/SKILL.md:36), [Rail 스키마](/Users/a2501/Desktop/firefly_studio/edge_repos/inkos/packages/core/src/arc/rail-schema.ts:241), [실행 context](/Users/a2501/Desktop/firefly_studio/edge_repos/inkos/packages/core/src/arc/rail-context.ts).

이 상태에서는 “B가 있다”는 말만으로 인간 관계가 실행 계획에 보존됐다고 말할 수 없다. 제안은 runtime 식별자를 일괄 변경하는 것이 아니라, 피치에서 **외적 성취 / 사람에게 생기는 변화**라는 내용 축으로 쓰고 A/B는 runtime의 목적지/경로 의미로 통일하는 것이다. 내용 축은 각 목적지와 Arc의 기존 payoff·humanAftermath 항목에 매핑한다. 모든 Arc에 두 종류의 보상을 의무 지급하지 않는다.

### 3.4 다작품 조합은 의도보다 실제 원문 연결이 뒤처져 있다

[피치 스킬](/Users/a2501/Desktop/firefly_studio/edge_repos/inkos/packages/core/skills/inkos-commercial-webnovel-pitch/SKILL.md:16)은 주축 하나와 보조 작품 둘 이상을 요구한다. 그러나 확인한 [WriterReferenceContext 로더](/Users/a2501/Desktop/firefly_studio/edge_repos/inkos/packages/core/src/reference/store.ts:180)는 하나의 bound pack에서 story index·문체·해당 구간 원문을 읽는다. transformation의 `supportingReferences`는 역할과 상태 메타데이터이며, 이 경로에 보조 pack 원문을 순회 적재하는 연결은 없다. [스키마](/Users/a2501/Desktop/firefly_studio/edge_repos/inkos/packages/core/src/reference/schema.ts:153).

현재 InkOS 설치 위치에서 확인한 reference-pack은 `doksik-chaebol3-ko-v1` 하나다. manifest는 751화·131개 자연 Arc·`manager-qa15of15`를 선언한다. 이 조사는 그 전체 분석을 다시 검수하지 않았다. Reference Lab에 다른 작품 자료가 있다는 사실과 해당 집필 호출에서 그 작품을 읽었다는 사실은 구분해야 한다.

더구나 기본 transformation은 진행 비율에 따라 원작 index의 인접 항목 세 개를 고르고 supportingReferences를 빈 배열로 둔다. 원작 중간 사건을 현재 주인공의 목적에 맞춰 고른 것인지 보장하지 않는다. [자동 구성](/Users/a2501/Desktop/firefly_studio/edge_repos/inkos/packages/core/src/reference/firefly-preflight.ts:105).

제안: 각 차용 단위에 **출처 pack/버전, 가져올 기능, 원문 구간, 현재 목표와 맞는 이유, 필요한 선행 상태, 유지·변경할 요소**를 둔다. 기존 Reference Lab→InkOS 입력 계약을 확장하고 실제 주입 기록으로 확인한다. 여러 작품의 사건을 이어 붙였다는 이유만으로 정보 공개 순서·인물 관계·우위의 전제가 충돌하지 않는 것은 아니다. 단순 명칭 치환과 인과에 맞춘 재조합을 구분해야 한다.

### 3.5 카나리용 좁은 규칙이 일반 창작 원칙이 될 위험

| 확인한 규칙 | 현재 의미와 개선 판단 |
| --- | --- |
| 돈·권한 등을 지워도 특정 사람에게 원하는 것이 남아야 한다 | 추상적 권력욕을 잡는 이번 실험에는 유용하다. 이를 모든 주인공의 조건으로 삼으면 자기 삶·실력·수집·소비 목적을 불필요하게 탈락시킬 수 있다. |
| nonMechanical 결정 규칙 | 코드의 일부 검사는 권한 관련 단어를 지운 뒤 남은 문자열 길이를 본다. 문장의 구체성이나 인과에 대한 증명이 아니다. |
| 주축의 업종·반복 동사·진행·사건 순서 고정 | 원작 골격 유지 실험에 맞는다. 자유로운 조합·변주까지 같은 규칙으로 판단하면 실험 목적과 충돌한다. |
| 최소 6개 arcLadder 항목, 초반 4화 매핑 | 현재 피치 확장 형식이다. 실제 runtime Arc 파일 6개를 만든다는 뜻은 아니다. 먼 구간을 얼마나 구체화할지는 별개다. |
| 첫 지급에 물질·감정 지급과 목격자 대우 변화 요구 | 현재 확장의 첫 보상에 적용되는 조건이다. 이를 모든 회차로 확대하면 단일 보상이나 후과까지 기계적으로 채우게 된다. Arc ladder의 각 항목에도 관계 변화 필드가 있어 사용 범위를 정리할 필요가 있다. |
| 선택된 humanPremise를 정확히 동일하게 유지 | 이미 선택한 뜻을 보호하는 것은 맞다. 이후 편집에서 표현과 구현까지 전부 고정할 필요가 있는지는 별도다. 승인된 약속과 수정 가능한 구현을 구분한다. |

근거: [생성 지시와 간이 검사](/Users/a2501/Desktop/firefly_studio/edge_repos/inkos/packages/cli/src/commands/human-premise.ts:339), [확장 지시·예시·검증](/Users/a2501/Desktop/firefly_studio/edge_repos/inkos/packages/cli/src/commands/human-premise.ts:548), [확장 스키마](/Users/a2501/Desktop/firefly_studio/edge_repos/inkos/packages/core/src/planning/commercial-expansion.ts:60), [spine 계약](/Users/a2501/Desktop/firefly_studio/edge_repos/inkos/packages/core/src/planning/spine-retention.ts).

선택 가능한 세 가지 작업 의도를 구분할 수 있다: **골격 유지 실험**, **주축+보조 기능 조합**, **선택한 기능의 재구성**. 새 장편 시스템 세 개를 만드는 제안은 아니다. 시작할 때 유지할 요소를 명확히 하고, 그 작업의 평가에서만 적용하는 방식이다. 현재 v3의 조건이나 해시는 소급 변경하지 않는다.

### 3.6 시스템 전체가 보수적이라는 반증도 명확하다

Reference pack 정책은 `similarityPenalty: false`, 최소 차별화 거리 없음, 중복에 대한 자동 rewrite 없음이다. 소설의 유사성을 이유로 자동 감점하는 시스템으로 볼 근거가 없다. [정책](/Users/a2501/Desktop/firefly_studio/edge_repos/inkos/packages/core/src/reference/schema.ts:51).

Architect는 대가·벌·반성·속죄·내적 성장을 완결 조건으로 강제하지 않는다. Continuity도 깨끗한 결산, 후일담, 관계·정보·선택 중 하나의 변화, 희소한 메모를 허용한다. 새 훅이나 보상 개수로 통과 여부를 정하지 말라고 명시한다. [Architect](/Users/a2501/Desktop/firefly_studio/edge_repos/inkos/packages/core/src/agents/architect.ts:1074), [Continuity](/Users/a2501/Desktop/firefly_studio/edge_repos/inkos/packages/core/src/agents/continuity.ts:625).

반면 미래 지식 설정에 적용되는 [Architect 지시](/Users/a2501/Desktop/firefly_studio/edge_repos/inkos/packages/core/src/agents/architect.ts:874)는 완성 설계도 암기·무한 자금·저항 없는 도입 등을 금지된 지름길로 넣는다. 이것은 작품별 HOW의 약속과 충돌할 수 있다. 인과 모순을 막는 규칙과 의도적인 압도적 우위를 약화하는 규칙을 분리해 검토해야 한다. 현재 결과물에서 실제 재미를 훼손했는지는 별도 실험이 필요하다.

승인·해시·정본 소유권 경계는 취향 보수성과 별개다. 잘못된 작품에 쓰기, 미승인 후보의 생산 전환, 출처 불일치는 막아야 한다. 큰 보상·권한·반복·조용한 후일담 같은 취향 판단까지 같은 강도로 막으면 안 된다.

## 4. 단계별 포맷: 새 체계보다 기존 형식의 연결

| 단계 | 사용할 기존 자산 | 최소한 읽혀야 할 내용 | 피할 강제 |
| --- | --- | --- | --- |
| 작품 설계 | entry contract + story_frame + volume_map | 독자 약속, WHY, 완결 가능한 WHAT, HOW, 반복해서 즐길 행동, 장기 결산, 출처에서 취할 기능 | 업종·인물 수·문단 수·보상 종류의 보편적 할당량 |
| Arc | anchorRail + arcRouteRail + ArcPacket | 상위 목적, 이번 목표, 주인공 선택과 우위 사용, 전후 변화, 지급·후과, 남거나 닫히는 질문 | 매번 재난·굴욕·더 큰 권한·관계 전환·새 훅 |
| 원고 | 기존 회차 메모 + 본문 | 메모에는 현재 want/선택/예정된 결과, 본문에는 독자가 보는 행동과 결과 | 본문 속 검수표·설계 용어·해시·정해진 장면 수 |

Arc라는 단위도 구분해야 한다. 현재 [ArcPacket](/Users/a2501/Desktop/firefly_studio/edge_repos/inkos/packages/core/src/arc/schema.ts:53)은 1~3화 실행 패킷이다. 원작 분석의 NarrativeArc나 독자가 느끼는 하나의 큰 사건 구간과 크기가 다를 수 있다. 큰 구간을 여러 실행 패킷에 연결하는 매핑을 명시하면 된다. 조사만으로 실행 단위를 일괄 바꾸지는 않는다.

회차 메모에는 아래 정도의 **짧은 연결 문장**이면 충분하다. 정확한 key 추가 여부는 구현 시 기존 스키마와 결정한다.

> 상위 목적: 자기 사업으로 독립한다. 이번 Arc: 첫 거래 대금을 받는다. 이번 화: 저평가된 재고를 산다. 우위: 내일의 수요를 안다. 결과: 현금이 생긴다. 사람 표면: 그 돈을 어디에 쓰기로 선택하는지 보여준다.

해당 화가 후일담이면 새 목표를 억지로 만들지 않고, 앞선 결과가 누구에게 어떻게 정착하는지 쓰면 된다. 장기 목표를 매 화 대사로 재선언할 필요도 없다. **본문의 재미는 본문에서 판단하고, 메모는 뜻이 사라지지 않도록 보조한다.**

```mermaid
flowchart LR
  R[Reference Lab: 분석과 출처] --> I[InkOS: 작품 설계]
  I --> A[장기 목적지와 현재 Arc]
  A --> M[회차 메모]
  M --> P[원고]
  P --> V[정합성 검수와 문장 보조 검수]
  V --> H[Storyyard: 사람 검토 투영]
  H --> D[승인 결정]
  D --> K[InkOS가 결정 적용]
```

이 그림은 소유권과 흐름을 요약한다. 제안한 목적 연결과 다작품 입력이 이미 전부 구현됐다는 뜻은 아니다. Storyyard나 외부 컨설턴트가 InkOS 정본에 직접 쓰는 화살표는 추가하지 않는다.

## 5. 스킬 조사와 채택 판단

사용자가 말한 “im not ai”라는 정확한 이름의 설치 스킬은 식별하지 못했다. 관련 설치물인 humanizer, avoid-ai-writing, deslop을 확인했다. 이름을 동일한 것으로 단정하지 않는다. 이번 조사 문서에는 deslop을 적용했고, find-skills로 후보를 찾았다. 다른 스킬은 내용과 적합성을 검토했으며 설치·갱신하지 않았다.

| 스킬/도구 | 현재 확인 | 권고 |
| --- | --- | --- |
| `inkos-story-deslop` | InkOS 자체 스킬. 의미 검수·최소 수정·장르 보상 보존. 한국어 안내는 권한 지급·바뀐 대우·의도적 반복을 보호 | 우선 재사용. 해당 생산 호출에서 요청·실행되는지 기록으로 확인 |
| `humanizer` | 전역 설치 v2.8.2. 일반 산문 AI 패턴 편집, 문단 수 보존 등의 지시 | 선택한 원고 일부의 최소 편집 비교용. 사건 설계나 한국 웹소설 취향 판정 대체 불가 |
| `avoid-ai-writing` | 전역 설치 v3.16.0. 탐지·프로필·문맥 판정 | 문제 위치를 찾는 보조. 표현 하나를 결함으로 자동 확정하지 않음 |
| `deslop` | 전역 설치. 반복적 설명·틀에 박힌 산문 정리 | 조사 문서에 사용. 소설에서는 의도적인 단문·반복·대조를 장르 기준으로 보호 |
| `story-zoom` | 공개 스킬. 이야기 규모별 구조와 변경 전파를 다룸 | 상위 목적 연결 발상만 참고. 별도 daemon·대시보드·상태 저장소 도입은 보류 |
| `scene-sequencing` | Goal→Conflict→Disaster 진단. 깔끔한 성공을 불리하게 보는 명시 규칙 | 그대로 채택하지 않음. 목표·결과 연결만 취하고 매번 실패/단서 추가는 제외 |
| `reverse-outliner` | 원고 역설계. scene-sequencing 분석을 호출 | Reference Lab의 선택적 분석 체크리스트로만 검토. 역설계 단계에도 동일한 장르 편향 주의 |
| `oh-story-claudecode` | 현재 zenstory-ai 저장소, 중국어 중심 README와 다수 단계의 창작 도구 | 한국 남성향 적합성 확인 안 됨. 기존 InkOS와 겹치는 시스템 전체 도입은 권하지 않음 |

로컬 근거: [InkOS deslop](/Users/a2501/Desktop/firefly_studio/edge_repos/inkos/packages/core/skills/inkos-story-deslop/SKILL.md), [한국어 장르 보호](/Users/a2501/Desktop/firefly_studio/edge_repos/inkos/packages/core/skills/inkos-story-deslop/references/korean-fiction-signals.md:17), [humanizer](/Users/a2501/.codex/skills/humanizer/SKILL.md), [avoid-ai-writing](/Users/a2501/.codex/skills/avoid-ai-writing/SKILL.md), [deslop](/Users/a2501/.codex/skills/skill-deslop/SKILL.md).

외부 원문: [story-zoom 고정 버전](https://github.com/jwynia/agent-skills/blob/e02ec7e226a6e4f8419fd3b88a1d8e472d421b32/skills/creative/fiction/structure/story-zoom/SKILL.md), [scene-sequencing 고정 버전](https://github.com/jwynia/agent-skills/blob/e02ec7e226a6e4f8419fd3b88a1d8e472d421b32/skills/creative/fiction/structure/scene-sequencing/SKILL.md), [reverse-outliner 고정 버전](https://github.com/jwynia/agent-skills/blob/e02ec7e226a6e4f8419fd3b88a1d8e472d421b32/skills/creative/fiction/structure/reverse-outliner/SKILL.md), [oh-story](https://github.com/zenstory-ai/oh-story-claudecode), [humanizer](https://github.com/blader/humanizer).

과거 조사 메모에는 oh-story를 한국어 웹소설에 가까운 후보로 기록했지만, 현재 자료만으로 그 주장을 유지하지 않았다. 설치 수나 별 개수는 발견에 사용했을 뿐 품질 증거로 사용하지 않았다. `npx --yes skills find fiction`, `npx --yes skills find story-zoom`을 실행했고 설치 명령은 실행하지 않았다.

특히 **전역 설치와 InkOS 호출에 주입되는 것은 다르다.** [external-loader](/Users/a2501/Desktop/firefly_studio/edge_repos/inkos/packages/core/src/skills/external-loader.ts:92)의 기본 탐색은 환경변수, `.openclaw/skills`, `.agents/skills`, 프로젝트 경로 등이다. `.codex/skills`는 기본 목록에 없다. 현재 확인한 기본 경로에도 위 세 스킬은 없었다. 요청 스킬을 실제 사용하는 registry/session 경로도 별도다. 카나리는 전용 생성·검수 스킬을 요청한다.

Codex backend는 [임시 작업 디렉터리와 사용자 규칙 무시 옵션](/Users/a2501/Desktop/firefly_studio/edge_repos/inkos/packages/core/src/llm/codex-cli.ts:539)을 사용한다. 따라서 “HQ 운영 AGENTS의 권한 규칙이 그대로 소설에 들어간다”는 가설을 확인된 원인으로 쓰지 않는다. 실제로 주입하는 Soul·스킬·프롬프트·출력 형식부터 점검해야 한다.

새 스킬이 필요하다면 역할은 두 가지 정도다. Reference Lab에는 **현재 목적에 맞는 원작 기능을 고르고 변주 가능 범위를 설명하는 분석 보조**, InkOS에는 **WHY→WHAT→Arc→선택→지급이 끊긴 곳을 원문 근거로 지적하는 편집 보조**다. 독립된 새 pipeline보다 기존 스킬의 짧은 계약과 예시를 먼저 보강한다. 범용 인간화 스킬 세 개를 차례로 돌리는 방식은 권하지 않는다.

## 6. 모델 교체와 시스템 밖 컨설팅

현재 카나리 명령은 [Sol/high로 고정](/Users/a2501/Desktop/firefly_studio/edge_repos/inkos/packages/cli/src/commands/human-premise.ts:38)돼 있다. 이 대화에서 Astra를 사용한다고 카나리의 생산 모델이 바뀌지 않는다. 생성자와 검수자는 별도 세션이지만 같은 모델·배경 지시를 사용할 수 있으므로 취향까지 독립적인 검증이라고 보기는 어렵다.

OpenAI의 Astra 문서는 지시 준수 개선을 설명하지만, 특정 스킬과 상세한 형식 지시가 응답에 영향을 줄 수 있다고도 설명한다. 한국 남성향 웹소설에서 권한 중심 전개가 사라진다는 증거는 아니다. 참고 작품을 context로 제공하는 것은 해당 호출의 조건화이며 모델을 재학습한 것과도 다르다. [Astra 공식 가이드](https://developers.openai.com/api/docs/guides/latest-model?model=gpt-6-astra), [프롬프트 가이드](https://developers.openai.com/api/docs/guides/prompt-engineering).

유용한 실험은 **모델 2종 × 입력 계약 2종**이다. Sol/Astra 각각에 현재 계약과 얇게 정리한 계약을 넣는다. 같은 원문·분량·가능한 한 같은 reasoning 조건을 사용하고, 현재 HIL과 별도인 실험 산출물로 둔다. 첫 탐색은 세 상황 × 네 조건 = 12개 결과로 가능하다. 이 표본은 가능성을 찾는 용도이며 안정적인 우월성 확정용이 아니다.

독립적으로 읽을 항목은 목적의 선명함, 자기 선택, 우위의 활용, 사람 행동으로 보이는 지급, 장르 재미, 원작 기능의 인과 보존, 문장 맛이다. JSON 통과율은 따로 본다. 같은 상황의 결과를 모델 이름 없이 순서를 바꿔 비교하고 사람이 이유를 적는다. 재현 표본에서 유지될 때 채택한다. 같은 모델의 점수 하나로 결론 내리지 않는다. [평가 공식 가이드](https://developers.openai.com/api/docs/guides/evaluation-best-practices).

시스템 밖 자문도 유효하다. 생성 프롬프트와 동일한 해법을 반복하지 않도록, 현재 원고와 상업성 기준을 주고 **편집 의견만 받는 작업**으로 분리한다. 한국 남성향 연재 경험이 확인되는 PD·편집자의 소량 유료 샘플 검토가 취향 검증에는 더 직접적이다. 이번 조사에서 특정 한국 편집자를 검증·섭외하지 않았다.

외부 서비스는 참고할 패턴이 있다. Sudowrite는 story bible→outline→scenes→draft 사이에 사람이 내용을 편집하는 흐름을 제공한다. Novelcrafter의 Codex는 작품 인물·설정과 시간에 따른 변화를 관리한다. 이들은 중간 설계와 상태를 사람이 읽기 쉽게 보여주는 참고 사례다. 한국 상업성이나 기존 InkOS보다 우월한 원고 품질을 입증하지 않으며 이전을 권고하는 근거로 사용하지 않았다. [Sudowrite Story Bible](https://docs.sudowrite.com/using-sudowrite/1ow1qkGqof9rtcyGnrWUBS/what-is-story-bible/jmWepHcQdJetNrE991fjJC), [Novelcrafter Codex](https://www.novelcrafter.com/features/codex).

컨설팅을 요청할 때는 문장 교정보다 이야기·인물·구조를 보는 editorial assessment에 가까운 범위를 정하는 편이 맞다. Reedsy의 설명은 이런 서비스 구분의 근거로만 참고했으며 한국 웹소설 전문가 추천으로 해석하지 않았다. [Editorial assessment](https://reedsy.com/editing/editorial-assessment).

### 외부 자문에 전달할 짧은 요청문

> 첨부한 작품 설계·현재 Arc·원고와 출처 발췌를 읽고 편집 의견을 주세요. 목표는 한국 남성향 상업 웹소설의 능동적인 주인공과 즉각적인 독자 만족입니다. WHY, 완결 가능한 장기 WHAT, 현재 Arc의 목적, 이번 화의 선택, HOW, 눈에 보이는 지급이 연결되는지 봐 주세요. 큰 행운·압도적 승리·돈·권한·깨끗한 결산은 그 자체로 결함이 아닙니다. ‘사람 표면’은 누가 무엇을 하고 얻는지 읽히는 뜻이며 관계 장면 추가 의무가 아닙니다. 가장 큰 문제 세 개 이하를 해당 구절과 독자가 잃는 재미로 설명하고, 유지할 장점과 최소 수정안을 함께 주세요. 매번 실패·비용·도덕적 성장·새 훅을 추가하지 마세요. 모르는 원작 사실은 추정하지 마세요. 결과는 비정본 자문이며 승인이나 원고 적용을 대신하지 않습니다.

## 7. 후속 개선 순서와 완료 기준

아래는 **아직 실행하지 않은 구현 제안**이다. 기존 upstream 구조를 보존하고 해당 child가 자기 코드를 소유한다.

| 순서 | 범위 | 수정 방향 | 확인할 결과 |
| --- | --- | --- | --- |
| P0 | InkOS preflight | 권한 중심 일반 Rail을 내용 없이 ready로 채우는 경로 수정 | 서로 다른 승인 목적이 같은 권한 사다리로 수렴하지 않음. 기존 ready 계획 보존과 정책 선택은 유지 |
| P0 | 피치/Arc 계약 | A/B 뜻 정합화, 목적과 현재 결과 연결, 사람 표면을 관계 할당량으로 만들지 않음 | 목표가 손실된 사례는 잡고, 정당한 권한 지급·깨끗한 승리·후일담은 통과 |
| P0 | 실험 규칙 | 골격 유지와 조합·변주 의도 분리, 미래 우위의 일괄 제한 검토 | 선택한 실험의 조건만 적용. 현재 v3 receipt와 선택 상태는 불변 |
| P1 | Reference Lab→InkOS | 여러 출처의 기능·선행 상태·원문 구간과 실제 주입 연결 | 보조 출처를 선언한 경우 해당 버전의 원문이 해당 호출에 들어갔다는 기록 |
| P1 | InkOS 편집 보조 | native deslop/목적 진단을 실제 호출 경로에 연결 | 원문 보상·사건은 유지하면서 확인된 문장 문제만 수정. 조언을 자동 정본으로 취급하지 않음 |
| P2 | 별도 실험·자문 | 모델/입력 교차 비교와 블라인드 편집 | 미학적 선호와 형식 통과를 분리한 실제 사람 평가 |

HQ가 가져갈 것은 경계와 입력/출력 계약의 정리다. Reference Lab은 원작 기능과 조합 근거, InkOS는 설계·생산·수정·결정 적용, Storyyard는 불변 검토 패킷과 인간 결정, Market Radar는 날짜가 있는 시장 근거를 계속 소유한다. 새 대시보드나 정본 저장소는 필요하지 않다.

## 8. 반증 재검토와 종료 기준

사용자의 “생각이 두 번 이상 안 바뀔 때까지”는 **마지막 중요한 수정 이후 두 번 연속 반증 검토에서 핵심 결론과 우선순위가 유지되는 것**으로 실행했다. 동일 조사자가 관점을 바꿔 재검토한 기록이다. 외부 편집자 또는 독립 모델 심사를 했다고 표현하지 않는다.

| 라운드 | 반증 관점 | 결과 |
| --- | --- | --- |
| R0 | 목적성이 없는가? 운영 AGENTS가 직접 오염시키는가? 옛 외부 스킬 평가가 유효한가? | 기존 목적 연결 확인. 전면 재구축 가설·직접 오염 확정·oh-story 한국어 적합성 주장 철회 |
| R1 | 시스템 전체가 보수적인가? 기존 형식을 재사용할 수 없는가? | clean closure·비도덕성 중립·유사성 자동 감점 없음·52개 테스트 확인. 잠정 결론 유지 |
| R1 후속 | 구체적인 권한 편향 입력이 숨어 있는가? | 기본 Rail의 권한 문자열과 ready 생성 발견. 중요 결론과 우선순위 수정, 연속 유지 횟수 초기화 |
| R2 | 그 경로가 모든 Book과 v3에 적용되는가? 보조 작품·스킬이 실제 로드되는가? | 조건부 경로로 범위 제한. 다작품 연결과 스킬 주입의 차이 재확인. 최종 결론 유지 1회 |
| R3 | 개선안이 또 다른 규칙 과잉인가? 합법적인 돈·권한 보상, 단일 지급, 깨끗한 승리, 자연 Arc를 망가뜨리는가? | 반례를 허용하는 최소 연결안 유지. 외부 스킬의 실패 편향 배제. 최종 결론 유지 2회 |

최종 다섯 결론은 ① 기존 단계에 사람 표면 목적 연결 ② 무결성 경계 유지와 실험별 창작 조건 분리 ③ 권한 기본 Rail·A/B 충돌·목적 추적·다작품 주입 보강 ④ 기존 형식/native deslop 재사용 ⑤ 비정본 외부 자문과 모델/입력 교차 실험이다. 실제 시각과 반증 항목은 증거 JSON의 reviewLog에 있다.

## 9. 검증과 한계

현재 InkOS에서 아래 기존 테스트를 실행했다. **5개 파일, 52개 테스트 통과**. 스키마·승인·참고 입력·Rail·창작 내용 중립성의 회귀 확인이며 재미나 모델 우월성의 증명이 아니다. 자동 Rail을 기대하는 테스트가 통과해도 그 Rail의 미학적 적합성이 증명되는 것은 아니다.

```sh
pnpm --filter @actalk/inkos-core exec vitest run \
  src/__tests__/human-premise.test.ts \
  src/__tests__/planning-entry-contract.test.ts \
  src/__tests__/reference-transformation.test.ts \
  src/__tests__/arc-rail-store.test.ts \
  src/__tests__/fiction-content-contract.test.ts
```

현재 카나리 `chaebol-human-premise-20260904-v3`는 p01 SURVIVE / p02 중복 HOLD 상태이며, 조사한 로컬 자료에서 소유자의 선택 적용은 확인되지 않았다. Book·Arc·원고가 만들어진 상태로 보고하지 않는다. slate/review와 InkOS→Storyyard 불변 packet 해시는 증거 기록에 담았다. [기존 handoff](/Users/a2501/Desktop/firefly_studio/docs/2026-09-05-human-premise-canary-handoff.md).

조사 시작 시 HQ와 InkOS에는 이미 미커밋 변경이 있었다. 그 변경을 보존한 채 조사 문서와 증거 JSON만 추가했다. child별 HEAD·상태·tracked diff·시작 시 개별 추적한 dirty 파일 해시를 대조했다. 시작 시 디렉터리로 묶여 나타난 모든 untracked 파일의 전수 해시를 가진 것은 아니므로 전체 디스크 불변 증명으로 과장하지 않는다. 문서 링크와 증거 소스 해시를 검사하고 `git diff --check`를 실행했다.

미실행: 생산 코드 수정, 추가 후보·원고 생성, 모델 교차 실험, 외부 자문 발송, 스킬 설치, HIL 승인·승격, 원격 배포·커밋·푸시. Storyyard의 현재 공개/비공개 UI 상태를 다시 관찰한 조사도 아니다. 이 문서의 코드상 가능성과 실제 창작 품질을 구분한 채 후속 개선에 사용한다.
