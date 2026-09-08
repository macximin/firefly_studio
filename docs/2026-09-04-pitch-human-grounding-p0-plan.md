# Pitch Human-Grounding P0 Recovery Plan

작성일: 2026-09-04  
상태: P0 구현·감리 완료 / 사람 HIL 대기  
범위: Firefly HQ → InkOS 피치 생성 → 독립심사 → Storyyard 기획 HIL  
명시적 제외: 그래프 엔지니어링, Book 생성, Arc/Rail 집필, 원고 생성, 자동 승격

## 결론

현재 실패는 기존 작품 구조도나 원문 학습 자산의 소실이 아니다. `pitch-slate`가
검증된 Reference Transformation Pack과 장르 Soul을 사용하지 않고, 요약 카드와
구조적 필드 검증만으로 피치와 심사를 완료한 배선·실행계약 결함이다.

P0는 다음 순서를 강제한다.

```text
원문 근거 결속
→ 사람 욕망·관계·목소리 전제 생성
→ 독립 Human Premise 심사
→ 사람 HIL
→ 통과한 전제에만 사업 엔진·초반 사건·장편 사다리 생성
```

그래프 엔지니어링은 이 흐름이 실제 카나리에서 통과한 뒤 P1로 재검토한다. 지금
그래프를 만들면 잘못된 `권리·계약·지분` 중심 추상화를 더 단단하게 고정할 위험이
있다.

## 두 차례 안정성 검토

### 검토 1 · 권한과 산출물

- HQ는 지시와 영수증 집계만 맡는다.
- Reference Lab은 원문 근거, 구조 분석, Transformation Pack을 제공한다.
- InkOS는 전제와 피치를 생성하고 심사·승격을 집행한다.
- Storyyard는 비정본 후보와 사람 결정을 투영할 뿐 InkOS 캐논을 수정하지 않는다.
- 이 경계는 기존 HQ 캐노니컬과 일치하므로 저장소 역할 이동은 하지 않는다.

### 검토 2 · 실패 경로와 상업성

- 원문을 읽지 않은 추상 요약 기반 생성은 금지한다.
- 사람 욕망 전에 6개 Arc와 권리 장부를 채우는 흐름은 금지한다.
- 생성 후보만 다시 읽는 자기참조 심사는 금지한다.
- 원문 표면 겹침을 이유로 입력을 약화하거나 자동 재작성하지 않는다.
- 돈·지분·권한은 욕망이 아니라 욕망을 실행하고 지급하는 수단으로 둔다.

두 검토에서 실행 순서와 저장소 경계가 바뀌지 않았으므로 아래 계획을 고정한다.

## 현재 증거

### 살아 있는 원천·구조 자산

- `analyses/doksik-chaebol3/project_bible.md`: 751화 작품 구조
- `analyses/doksik-chaebol3/chapter_map.csv`: 751화 이야기 검색 좌표
- `analyses/doksik-chaebol3/arc_atlas.md`: 131개 자연 Arc 상세
- `analyses/doksik-chaebol3/arc_map.csv`: 자연 Arc 경계
- `analyses/doksik-chaebol3/arc_pacing.csv`: 회차별 기능과 보상 리듬
- `inkos_handoffs/doksik-chaebol3-transformation-pack/v1/receipt.json`:
  원문 SHA-256, 751개 story index, 15개 문체 예문 영수증
- InkOS `.inkos/reference-packs/doksik-chaebol3-ko-v1/`:
  `reference-pack.json`, `story-index.jsonl`, `style-examples.jsonl`

### 확인된 결함

1. 실패 슬레이트 `chaebol-entry-hil-20260903-v1`은 Gold 카드, `CHB-CORE-02`,
   `CHB-CORE-05`, 상업성 원칙 문서만 입력으로 사용했다.
2. 피치 세션은 `bookId: null`, `sessionKind: pitch-slate`였고 Soul binding이 없다.
3. HQ 장르 Soul 활성 registry는 비어 있으며 `male-modern-fantasy-ko/v1`은
   `candidate-only`다.
4. 실제 피치와 심사 모델은 `gpt-5.6-terra`였다. 합의한 Hermes 기본
   `gpt-5.6-sol/high`가 아니다.
5. `FireflyEntryContractSchema`는 각 텍스트의 길이와 존재만 검증한다.
6. 독립심사는 후보 안에서 다섯 문장을 복원할 수 있는지만 확인하며 원문 근거,
   사람 욕망의 질, 관계 인과를 검증하지 않는다.
7. 자체 피치 Skill의 `주인공보다 시스템·권리·계약이 기억나면 HOLD` 규칙을
   결과와 심사기가 집행하지 못했다.

## P0 작업 목록

### P0-0 · 실패 슬레이트 봉쇄

- `chaebol-entry-hil-20260903-v1`의 두 후보는 승격 불가 상태로 취급한다.
- 기존 파일과 영수증은 회귀 테스트 fixture로 보존한다.
- 자동 Book 생성, `pitch-promote`, `/write` 진입이 불가능함을 테스트한다.
- 사람의 `reject` 결정 기록은 별도 실행 승인 시에만 Storyyard → InkOS
  hash-bound 경로로 반영한다.

### P0-1 · Pitch Source Binding 도입

Book이 없는 greenfield 피치에도 명시적 `pitchSourceBinding`을 요구한다.

필수 결속:

- Reference Transformation Pack ID와 pack SHA-256
- 원문 source SHA-256
- story index SHA-256과 선택된 회차·line/character range
- style examples SHA-256과 선택된 예문 ID
- 구조 근거: `project_bible`, `chapter_map`, `arc_atlas`
- 인물·관계 근거와 선택 사유

파일이 있다는 사실만으로 통과시키지 않는다. 실제 모델 입력에 들어간 항목과
해시를 세션·슬레이트·Storyyard 패킷에 기록한다. 선택 구간이 0개면 fail closed한다.

### P0-2 · Pitch Runtime 고정

- 피치 생성자는 `gpt-5.6-sol/high`로 고정한다.
- 독립심사는 생성자와 다른 세션에서 실행한다. 모델을 같게 쓸 수는 있지만
  생성자의 자기점수와 해설은 전달하지 않는다.
- 피치 런에 `male-modern-fantasy-ko/v1`의 candidate Soul을 canary-scoped로
  명시 결속한다. 이를 HQ 전역 활성 승급으로 오인하지 않는다.
- 세션 영수증에 provider, model, reasoning, Soul ID/version/hash를 남긴다.
- 요청 런타임과 실제 영수증이 다르면 후보를 저장하지 않는다.

### P0-3 · Human Premise Contract 분리

현재 Entry Contract에서 인간 전제를 먼저 떼어 낸다. 이 단계에서는 장편 Arc
사다리와 지분·의결권 장부를 생성하지 않는다.

필수 항목:

1. `protagonistAsPerson`: 직함과 능력을 지웠을 때 어떤 사람인가
2. `privateWant`: 누구에게서 무엇을 받고, 되찾거나 빼앗고 싶은가
3. `feltLack`: 그 결핍이 일상과 관계에서 어떻게 체감되는가
4. `targetPerson`: 욕망을 자극하거나 막는 구체적 사람
5. `whyToday`: 오늘 선택하지 않으면 잃는 사람·자리·감정
6. `firstChoice`: 주인공이 스스로 내리는 불가역 선택
7. `emotionalPayment`: 상대의 행동·표정·말·자리 변화로 지급되는 첫 회수
8. `voiceProof`: 선택된 원문 문체/목소리 예문에서 가져올 리듬과 태도
9. `sourceBeatIds`: 각 항목을 지지하는 원천 장면 좌표

다음 검사 중 하나라도 실패하면 사업 설계로 넘어가지 않는다.

- 회사명, 돈, 지분, 권리, 계약, 직책을 지워도 `privateWant`가 남는가.
- `privateWant`가 상태 명사 대신 사람과 행동을 포함하는가.
- 주인공이 원하는 이유를 과거 설명이 아니라 오늘 장면으로 보여줄 수 있는가.
- 첫 회수가 문서 취득만이 아니라 누군가의 실제 행동 변화를 포함하는가.
- 원천 장면 좌표 없이 새로 만든 욕망을 학습 결과라고 주장하지 않는가.

### P0-4 · Human Premise 독립심사와 HIL

- 심사 입력은 후보 Human Premise와 같은 source beat packet이다.
- 생성자의 commercialScore, 자기해설, 채택 추천은 제거한다.
- 심사기는 `복원 가능`이 아니라 `사람 욕망으로 작동`, `원문 근거 있음`,
  `오늘의 선택으로 장면화 가능`을 판정한다.
- Storyyard는 먼저 Human Premise 카드만 보여 준다.
- 사람 선택은 `select | hold | reject`이며 `select` 전에는 전체 피치를 만들지 않는다.

### P0-5 · 통과 후 Commercial Expansion

선택된 Human Premise를 변경 불가능한 상위 입력으로 결속한 뒤에만 다음을 만든다.

- 주인공의 현실 직업과 반복 경제행동
- 첫 1~4화 사건과 물질·관계 지급
- A Rail / B Rail
- 최소 장편 공급성 가설

6개 Arc를 처음부터 완성본처럼 만들지 않는다. 첫 Arc와 장편 반복 엔진까지만
구체화하고 먼 Arc는 방향 가설로 둔다. 경제적 권리와 계약은 `privateWant`를
대체할 수 없으며, 각 보상은 사람 관계의 변화와 함께 읽혀야 한다.

### P0-6 · 실행 검증 강화

구조 검사와 LLM 의미 검사를 분리한다.

- 결정론 검사: 필수 필드, 해시, source range, 모델·Soul 영수증, 단계 순서
- LLM 검사: 인간 욕망, 관계 압력, 장면성, 원문 감각의 전이, 보고서 말투
- 결정론 검사는 조사 후보를 만들고 의미 판정은 독립 LLM이 담당한다.
- LLM PASS만으로 승격하지 않고 사람 HIL이 최종 생존 결정을 내린다.
- 회귀 테스트에는 현재 실패 후보 두 개를 넣고 둘 다 Human Premise FAIL이어야 한다.

### P0-7 · 관측성과 인수인계

슬레이트와 Storyyard 화면에 다음을 노출한다.

- 실제 모델·reasoning
- 실제 Soul binding 또는 `none`
- 실제 원문/Transformation Pack binding
- 선택된 source beat와 style example 개수
- Human Premise gate와 실패 사유
- 아직 실행되지 않은 다음 단계

`원문을 학습했다`는 표현은 위 영수증이 모두 있을 때만 허용한다.

## 구현 예상 경계

### InkOS

- `packages/cli/src/commands/pitch.ts`
- `packages/core/src/planning/entry-contract.ts`
- pitch용 source/Soul binding adapter와 receipt schema
- 피치·리뷰 Skill 및 rubric
- CLI/Core 회귀 테스트

### Reference Lab

- 기존 Transformation Pack을 변경하지 않고 pitch용 선택 packet을 파생한다.
- 원문·인덱스·문체 예문의 기존 SHA와 byte range를 재사용한다.
- 요약 카드 01~06은 보조 점검표로만 사용하고 주축 원문을 대체하지 않는다.

### Storyyard

- 기존 `firefly_review_packet/v3` 권한 경계는 유지한다.
- Human Premise 우선 화면과 source/runtime receipt 표시만 추가한다.
- InkOS로 직접 쓰지 않는다.

### HQ

- dispatcher가 P0 단계 순서와 영수증 존재를 fail closed로 검증한다.
- 콘텐츠를 대신 생성하거나 child canon을 직접 수정하지 않는다.

## 검증 순서

1. 현재 실패 후보 두 개를 fixture로 넣어 Human Premise FAIL 확인
2. source binding 누락, style example 0개, Soul 없음, Terra 실행을 각각 거부
3. 구조 검사와 의미 검사가 독립적으로 실패하는 단위 테스트
4. `독식하는 재벌 3세` source beat와 문체 예문을 실제 투입한 2후보 카나리
5. 독립심사에서 최소 한 후보가 탈락할 수 있는지 확인
6. Storyyard에서 Human Premise만 보고 사람 HIL
7. 사람이 하나를 선택한 경우에만 Commercial Expansion 카나리
8. Book·Arc·원고는 만들지 않고 다시 사람 HIL에서 중단

## P0 완료 조건

- 피치 세션 영수증이 `gpt-5.6-sol/high`와 canary Soul binding을 증명한다.
- 실제 원문 SHA, story index, 선택 회차·byte range, style example가 입력 영수증에 있다.
- 현재 실패 후보 두 개가 자동 PASS하지 않는다.
- 회사·권리 명사를 지운 뒤에도 선택 후보의 욕망과 첫 행동이 설명된다.
- Storyyard에서 전체 사업 기획보다 Human Premise가 먼저 보인다.
- 사람 선택 전에는 Commercial Expansion, Book 생성, 원고 생성이 불가능하다.
- 기존 751화/131 Arc 구조 자산은 변경되지 않는다.
- 그래프 저장소·그래프 DB·벡터 DB는 추가되지 않는다.

## P1 이후로 미룬 항목

- SourceEpisode, Scene, CharacterDesire, Relationship, Beat, Payoff, Arc 노드화
- `supports`, `transforms`, `pays_off`, `changes_relationship` edge
- 다작품 교차 검색과 donor scene 추천
- 그래프 기반 장편 공급량/중복 감지

P1 착수 조건은 P0 카나리에서 사람이 선택할 만한 Human Premise와 전체 피치가
연속으로 한 번 이상 나오는 것이다. 그 전에는 그래프 설계를 시작하지 않는다.

## 구현 및 감리 영수증

### 구현 경계

- HQ dispatcher에 `pitch-premise-slate`, `pitch-premise-review`,
  `pitch-premise-export-storyyard` capability와 source/style/structure artifact 검증을
  추가했다.
- InkOS에 source/runtime/Soul 결속 schema, Human Premise 생성, 별도 세션 독립심사,
  Storyyard v4 packet export, 실패 슬레이트 승격 봉쇄를 추가했다.
- Storyyard에는 기존 v3 packet을 보존하면서 v4 Human Premise 카드, 다섯 gate,
  원천·문체·런타임 영수증, HIL 전용 권한 경계를 추가했다.
- Reference Lab의 기존 751화·131 Arc 및 Transformation Pack은 읽기만 했으며
  변경하지 않았다.

### 두 차례 구현 감리

1. `chaebol-human-premise-20260904-v1`은 실제 모델 입력에는 원문 구간이 있었지만
   외부 source binding 영수증에 line/character range가 없었다. 이 packet은
   Storyyard invalidation registry에 넣어 활성 큐에서 제외하고 증거로만 보존했다.
2. v2의 첫 독립심사는 후보와 해시만 받고 실제 원문·문체·구조 내용을 받지 못해
   두 후보를 모두 HOLD했다. fail-open하지 않은 것은 정상이나 의미심사 입력이
   부족했으므로, 심사기가 결속된 자료를 다시 읽고 해시를 검증한 뒤 받도록 고쳤다.
   최초 심사 영수증은 `superseded-independent-review-no-source-context/`에 보존했다.

### 최종 2후보 카나리

- Slate: `chaebol-human-premise-20260904-v2`
- Slate SHA-256:
  `6ef8e228f4af0bb6671fd537efd7c3e317a5881cf60aab0ff3786b73f9f21198`
- 생성·심사 runtime: `codex-cli / gpt-5.6-sol / high`
- Soul: `male-modern-fantasy-ko/v1`, `canary-scoped`
- 원문 source SHA-256:
  `66f3e7df3123343c14a7134108dc59940511f40372493a549cba8ae709df4b45`
- 원문 선택: sequence 1, 2, 75 및 각 line/character range와 raw prose hash
- 문체 선택: `phase-1-entry-1`, `phase-1-escalation-75`,
  `phase-1-payoff-150`
- 구조 결속: `project_bible`, `chapter_map`, `arc_atlas` 각각의 SHA-256
- 독립심사: p01 `SURVIVE`, p02 `HOLD`; 사람 결정은 `pending`
- 추천 p01: `재벌 장손, 이번엔 동생을 버리지 않는다`
- 심사 JSON SHA-256:
  `76c61dd47547850028284dee3f19f37d79ac5b3be6ca5568b2ae3ecf0a9d350a`
- Storyyard packet: `frp-326a79098a01aabd990f4abb`
- Packet canonical SHA-256:
  `326a79098a01aabd990f4abbc90b4f5348fdd6fa5f0982b06f09b02ac6490dc0`

### 중단점과 남은 권한

- Storyyard에는 immutable packet과 pending HIL projection까지만 반영했다.
- 사람 HIL 전이므로 Commercial Expansion, Book, Arc, Rail, 원고, graph layer는
  생성하지 않았다.
- HQ 실제 mutating dispatch는 구현 중 InkOS가 dirty여서 안전장치가 거부했다.
  이를 우회하지 않았고 dispatcher 단위·회귀 테스트로 계약 연결을 검증했다.
  향후 변경사항을 별도 승인으로 커밋한 뒤부터 실제 HQ dispatch를 사용한다.
- 이번 목표의 안전한 중단점은 p01 선택 여부를 사람이 결정하는 현재 상태다.

## 2026-09-04 원문 역설계 변주 P0 보강

오너는 후속 HIL에서 v2 후보를 모두 탈락시켰다. 이유는 사람 욕망을 복구하는
과정에서 주축 원문의 재벌물 상업 엔진과 물질 지급까지 교체해, 의도한
`원문 골격 보존 + 표면 변주`보다 새 기획 발명에 가까워졌기 때문이다.

이를 막기 위해 다음 경로를 추가했다.

1. `pitch-premise-decision`: 심사된 Human Premise에 한 번만 쓰는 해시 결속
   `select | hold | reject` 영수증을 기록한다. `select`만
   `commercial-expansion-authorized`이며 원고 권한은 항상 `false`다.
2. `pitch-premise-expand`: 선택된 Human Premise 객체를 불변 입력으로 유지하고,
   같은 source pack·story beat·style example·구조 증거를 다시 읽어 기존
   schema-v2 상업 피치 슬레이트 하나를 만든다.
3. `firefly_spine_retention/v1`: 주축 업종, 반복 동사, 성장 사다리, 보상 문법,
   1~4화의 source beat/Arc 매핑, 관계 전환, 훅 진행, 허용 표면 변경과 인과
   조정, 물질·감정 동시 지급을 구조적으로 요구한다.
   확장 프롬프트의 예시 좌표도 실제 결속된 첫 두 source beat/Arc에서 만들며,
   결속 beat가 둘 미만이면 모델 호출 전에 실패한다.
4. 확장 슬레이트는 기존 `pitch-review → pitch-export-storyyard → pitch-decision
   → pitch-promote`를 그대로 사용한다. 새 Book·원고 직행 경로는 만들지 않았다.
5. Storyyard의 기획 HIL에는 선택된 Human Premise와 원문 골격 보존 증거가 함께
   투영된다. 사용자는 실제 원천 beat 매핑과 물질·감정 지급을 보고 생존 여부를
   판단할 수 있다.
6. 신규 Human Premise HIL은 reference pack에서 해시 검증한 주축 작품명과 slug를
   표시한다. 확장 기획 HIL은 `referenceDisclosure`를 필수화해 참고 역할, 선정
   이유, 보존 요소, 표면 변주 요소와 원천 beat/Arc를 함께 보여 준다. 이 공개는
   내부 심사용이며 공개 작품 소개와 원고에는 투영하지 않는다.

그래프 DB나 벡터 DB는 추가하지 않았다. 다음 실행은 기존 탈락 후보의 선택이
아니라 새 Human Premise 카나리부터 시작해야 한다.

### 회귀 검증

- HQ: 전체 154 tests PASS, manifest/profile/adoption validation PASS;
  최종 dispatcher 집중 회귀 57 tests PASS
- InkOS: Core 2,537 + Studio 654 + CLI 271 = 전체 3,462 tests PASS;
  최종 Core/CLI typecheck PASS
- Storyyard: build PASS, 전체 44 tests PASS
- 세 저장소 `git diff --check` PASS
- Reference Lab과 Market Radar working tree clean
- `books/chaebol-human-premise-20260904-v2` 부재 확인
